import asyncio
import json
import time
from typing import Any, Dict

from .config import config
from .logging import logger
from .redis_io import redis_client, read_job, to_list, set_idempotency
from .model_client import summarize_with_llm, LLMError
from .schemas import SummarizerIn, SummarizerOut


LAST_LLM_OK_AT_MS: int = 0


async def process_one(r) -> None:
    # Prefer retry queue first, then new jobs
    payload = await read_job(r, [config.RETRY_QUEUE, config.INPUT_QUEUE])
    if not payload:
        return
    
    trace_id = (payload or {}).get("trace_id")
    attempt = int((payload or {}).get("attempt", 0))

    t0 = time.time()
    try:
        # Deserialize and basic schema check
        sin = SummarizerIn(**payload)
    except Exception as e:
        logger.error("job.invalid_payload", trace_id=trace_id, err=str(e))
        await to_list(r, config.DLQ, {"reason": "SCHEMA_MISMATCH", "payload": payload, "err": str(e)})
        return

    # Idempotency key: skip if already processed
    done_key_new = await set_idempotency(r, sin.article.id, config.LLM_MODEL)
    if not done_key_new:
        logger.info("job.already_done", trace_id=trace_id, article_id=sin.article.id)
        return

    # Build LLM input
    llm_input = json.loads(SummarizerIn(**payload).model_dump_json())

    # LLM call with simple retries
    backoff = 0.5
    last_err = None
    for i in range(3):
        try:
            partial = await summarize_with_llm(llm_input)
            latency_ms = int((time.time() - t0) * 1000)
            # Assemble output
            out = SummarizerOut(
                trace_id=sin.trace_id,
                story_id=sin.story.id,
                article_id=sin.article.id,
                model=config.LLM_MODEL,
                lang=sin.article.language,
                summary=partial.get("summary") or "",
                classification=partial.get("classification") or {},
                ui=partial.get("ui") or {},
                embedding=None,  # future: optional
                timestamps={"summarized_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                schema_version=config.JSON_SCHEMA_VERSION,
            )
            await to_list(r, config.OUTPUT_QUEUE, json.loads(out.model_dump_json()))
            logger.info(
                "job.completed",
                trace_id=trace_id,
                story_id=sin.story.id,
                article_id=sin.article.id,
                model=config.LLM_MODEL,
                latency_ms=latency_ms,
                attempt=attempt,
            )
            global LAST_LLM_OK_AT_MS
            LAST_LLM_OK_AT_MS = int(time.time() * 1000)
            return
        except LLMError as e:
            last_err = str(e)
            await asyncio.sleep(backoff)
            backoff *= 2
        except Exception as e:
            last_err = str(e)
            break

    # Failure path
    attempt += 1
    reason = "LLM_TIMEOUT" if last_err == "timeout" else ("JSON_PARSE" if "json_parse" in (last_err or "") else "UNKNOWN")
    if attempt < config.MAX_RETRIES:
        payload["attempt"] = attempt
        await to_list(r, config.RETRY_QUEUE, payload)
        logger.warn("job.requeued", trace_id=trace_id, attempt=attempt, reason=reason)
    else:
        await to_list(r, config.DLQ, {"reason": reason, "payload": payload, "err": last_err})
        logger.error("job.dlq", trace_id=trace_id, reason=reason, err=last_err)


async def worker_main() -> None:
    r = redis_client()
    logger.info("worker.loop_started", redis_url=_mask_url(config.REDIS_URL))
    count = 0
    # Simple single-threaded loop
    while count< 5:
        try:
            await process_one(r)
        except Exception as e:
            logger.error("worker.loop_error", err=str(e))
            await asyncio.sleep(0.5)


def _mask_url(url: str) -> str:
    """Mask sensitive parts of URLs for logging."""
    if not url:
        return url
    
    # Simple masking - hide password if present
    if "@" in url and "//" in url:
        parts = url.split("//", 1)
        if len(parts) == 2 and "@" in parts[1]:
            auth_host = parts[1].split("@", 1)
            if len(auth_host) == 2:
                auth = auth_host[0]
                if ":" in auth:
                    user, _ = auth.split(":", 1)
                    masked_auth = f"{user}:***"
                else:
                    masked_auth = "***"
                return f"{parts[0]}//{masked_auth}@{auth_host[1]}"
    return url


if __name__ == "__main__":
    asyncio.run(worker_main())
