import asyncio
import json
import time
from typing import Callable, Dict, Optional

from .config import Config, load_config
from .queue import get_redis, blpop, enqueue
from .util import get_logger, format_exception_one_line

# Import task handlers
from .tasks import fetch_article as task_fetch_article
from .tasks import summarize as task_summarize
from .tasks import embed as task_embed
from .tasks import tag as task_tag
from .tasks import refresh_stats as task_refresh


HANDLERS: Dict[str, Callable[[dict], asyncio.Future]] = {
    "FETCH_ARTICLE": task_fetch_article.handle,
    "SUMMARIZE": task_summarize.handle,
    "EMBED": task_embed.handle,
    "TAG": task_tag.handle,
    "REFRESH_HN_STATS": task_refresh.handle,
}


async def _async_ping_dependencies(cfg: Config) -> None:
    log = get_logger()
    # Verify Redis connectivity
    try:
        await asyncio.to_thread(get_redis().ping)
    except Exception:
        log.error("redis connection failed", extra={"svc": "worker", "error": format_exception_one_line()})
        raise


async def process_one_job(cfg: Config) -> bool:
    log = get_logger()
    start_wait = time.perf_counter()
    item: Optional[tuple[str, dict]] = await asyncio.to_thread(
        blpop, list(HANDLERS.keys()), 5
    )
    if not item:
        return False
    qname, payload = item
    t0 = time.perf_counter()
    log.info(
        "job start",
        extra={
            "svc": "worker",
            "queue": qname,
            "payload_bytes": len(json.dumps(payload)),
            "wait_ms": round((t0 - start_wait) * 1000, 2),
        },
    )
    attempt = int(payload.get("attempt", 1))
    handler = HANDLERS.get(qname)
    if not handler:
        log.error("unknown queue", extra={"svc": "worker", "queue": qname})
        return True
    try:
        result = await handler(payload)
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        log.info(
            "job done",
            extra={"svc": "worker", "queue": qname, "duration_ms": duration_ms},
        )
        # Enqueue follow-ups
        if qname == "FETCH_ARTICLE":
            article_id = result.get("article_id") if isinstance(result, dict) else None
            story_id = payload.get("story_id")
            if article_id:
                await asyncio.to_thread(
                    enqueue,
                    "SUMMARIZE",
                    {"article_id": article_id, "attempt": 1},
                )
                await asyncio.to_thread(
                    enqueue,
                    "EMBED",
                    {"article_id": article_id, "model_key": "default", "attempt": 1},
                )
            if story_id:
                await asyncio.to_thread(
                    enqueue,
                    "TAG",
                    {"story_id": story_id, "title": payload.get("title"), "attempt": 1},
                )
        return True
    except Exception:
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        err = format_exception_one_line()
        log.error(
            "job error",
            extra={
                "svc": "worker",
                "queue": qname,
                "duration_ms": duration_ms,
                "attempt": attempt,
                "error": err,
            },
        )
        # Retry or dead-letter
        if attempt >= cfg.max_retries:
            await asyncio.to_thread(
                enqueue,
                f"DLQ:{qname}",
                {**payload, "error": err, "failed_at": int(time.time())},
            )
        else:
            await asyncio.to_thread(
                enqueue,
                qname,
                {**payload, "attempt": attempt + 1},
            )
        return True


async def run_worker(cfg: Config, stop_event: asyncio.Event) -> None:
    log = get_logger()
    log.info("startup", extra={"svc": "worker"})

    # Initialize clients
    await _async_ping_dependencies(cfg)

    last_idle_log = 0.0
    idle_every = max(1, int(cfg.idle_heartbeat_sec))

    try:
        while not stop_event.is_set():
            try:
                processed = await process_one_job(cfg)
                if not processed:
                    now = time.time()
                    if (now - last_idle_log) >= idle_every:
                        log.debug("idle", extra={"svc": "worker"})
                        last_idle_log = now
            except Exception:
                log.error(
                    "loop error", extra={"svc": "worker", "error": format_exception_one_line()}
                )
                await asyncio.sleep(1)
    finally:
        log.info("shutdown", extra={"svc": "worker"})
