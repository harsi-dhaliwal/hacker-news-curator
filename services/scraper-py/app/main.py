import json
import random
import time
from typing import Any, Dict, Optional
import os
import inspect

from .config import load_config
from .logging import logger
from .redis_io import blpop, rpush, lpush, is_idempotent_done,set_idempotent_done
from .normalize import canonicalize_url, detect_language, content_hash
from .fetcher import fetch_url, headless_fetch, RetryableFetch, NonRetryableFetch
from .extractor import extract_content
from .db import transaction, upsert_article_tx, link_story_tx, close_pool
from .payloads import build_summarizer_payload
from .charset_util import decode_body


class NonRetryable(Exception):
    pass


# ---- small helpers -----------------------------------------------------------------

def _now_ms() -> int:
    return int(time.time() * 1000)


def _maybe_call_async(fn, *args, **kwargs):
    """
    Allows calling possibly-async functions (e.g., fetch_url, headless_fetch)
    from this synchronous worker. If fn(*args, **kwargs) returns an awaitable,
    we run it to completion; otherwise we return the value directly.
    """
    result = fn(*args, **kwargs)
    if inspect.isawaitable(result):
        # minimal, local event loop just for this call
        import asyncio
        return asyncio.run(result)
    return result


def _decode_redis_item(item: Any) -> Optional[Dict[str, Any]]:
    """
    Accepts:
      - None -> None (timeout)
      - dict -> dict (already decoded)
      - (queue, bytes|str) -> json-decoded dict
      - bytes|str -> json-decoded dict
    Raises NonRetryable if content is unexpected / unserializable.
    """
    if item is None:
        return None

    raw = item
    if isinstance(item, (tuple, list)) and len(item) == 2:
        _, raw = item

    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="ignore")

    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception as e:
            raise NonRetryable(f"bad_json:{e}")

    if isinstance(raw, dict):
        return raw

    raise NonRetryable("unexpected_queue_payload_type")


def _pop_job_from_queue(queue: str, timeout_s: int) -> Optional[Dict[str, Any]]:
    """Blocking pop + decode with consistent behavior."""
    item = blpop(queue, timeout_s)
    try:
        job = _decode_redis_item(item)
    except NonRetryable as e:
        logger.error("scraper.queue.bad_item", queue=queue, error=str(e))
        return None
    return job


# ---- core worker -------------------------------------------------------------------

def process_one() -> bool:
    cfg = load_config()
    logger.info("scraper.process_one.start", queue=cfg.input_queue)

    # 1) Try input queue, then retry queue (respecting visibility)
    job = _pop_job_from_queue(cfg.input_queue, 5)
    if not job:
        logger.debug("scraper.no_job_input_queue", queue=cfg.input_queue)
        job = _pop_job_from_queue(cfg.retry_queue, 1)
        if not job:
            logger.debug("scraper.no_job_retry_queue", queue=cfg.retry_queue)
            return False

        visible_at = job.get("visible_at")
        if visible_at and visible_at > _now_ms():
            logger.debug(
                "scraper.job_not_visible_yet",
                visible_at=visible_at,
                current_time=_now_ms(),
            )
            rpush(cfg.retry_queue, job)
            return False

    # 2) Basic validation / idempotency
    trace_id = job.get("trace_id")
    story = job.get("story") or {}
    story_id = story.get("id")
    url = story.get("url")
    attempt = int(job.get("attempt", 0))
    logger.info("scraper.job.received", trace_id=trace_id, story_id=story_id, url=url, attempt=attempt)

    if not story_id:
        logger.error("scraper.job.bad_payload", trace_id=trace_id, job=job)
        raise NonRetryable("bad_payload")
    if is_idempotent_done(story_id) and not (os.environ.get("FORCE", "false").lower() in ("1", "true", "yes")):
        logger.info("scraper.job.skip_idempotent", trace_id=trace_id, story_id=story_id)
        return True

    if not url:
        logger.error("scraper.job.no_url", trace_id=trace_id, story_id=story_id)
        raise NonRetryable("no_url")

    # 3) Normalize URL
    logger.info("scraper.url.normalize.start", trace_id=trace_id, story_id=story_id, original_url=url)
    canon_url, domain = canonicalize_url(url)
    logger.info("scraper.url.normalized", trace_id=trace_id, story_id=story_id,
                original_url=url, canonical_url=canon_url, domain=domain)

    # 4) Fetch
    logger.info("scraper.fetch.start", trace_id=trace_id, story_id=story_id, url=canon_url)
    final_url, ctype, body, headers = None, None, None, None
    fetch_success = False
    used_headless = False
    
    try:
        final_url, ctype, body, headers = _maybe_call_async(fetch_url, canon_url)
        logger.info("scraper.fetch.success", trace_id=trace_id, story_id=story_id,
                    final_url=final_url, content_type=ctype, body_size=len(body) if body else 0)
        fetch_success = True
    except RetryableFetch as e:
        logger.warn("scraper.fetch.retryable_error", trace_id=trace_id, story_id=story_id, error=str(e))
        # Try headless fallback for retryable errors before giving up
        if cfg.headless_enabled:
            logger.info("scraper.headless.retryable_fallback.start", trace_id=trace_id, story_id=story_id)
            try:
                headless = _maybe_call_async(headless_fetch, canon_url)
                if headless:
                    final_url, ctype, body, headers = headless
                    logger.info("scraper.headless.retryable_fallback.success", trace_id=trace_id, story_id=story_id,
                                final_url=final_url, content_type=ctype, body_size=len(body) if body else 0)
                    fetch_success = True
                    used_headless = True
                else:
                    logger.warn("scraper.headless.retryable_fallback.no_content", trace_id=trace_id, story_id=story_id)
            except Exception as headless_e:
                logger.error("scraper.headless.retryable_fallback.error", trace_id=trace_id, story_id=story_id, error=str(headless_e))
        
        if not fetch_success:
            return _handle_retry(job, reason="FETCH_RETRY", err=str(e))
    except NonRetryableFetch as e:
        logger.error("scraper.fetch.nonretryable_error", trace_id=trace_id, story_id=story_id, error=str(e))
        return _handle_dlq(job, reason="FETCH_NONRETRY", err=str(e))

    if not fetch_success:
        logger.error("scraper.fetch.failed_all_methods", trace_id=trace_id, story_id=story_id)
        return _handle_retry(job, reason="FETCH_ALL_FAILED", err="both regular and headless fetch failed")

    if not ("html" in (ctype or "").lower() or (final_url or "").lower().endswith(".html")):
        logger.warn("scraper.content.unsupported_mime", trace_id=trace_id, story_id=story_id,
                       content_type=ctype, final_url=final_url)
        return _handle_dlq(job, reason="UNSUPPORTED_MIME", err=ctype)

    # 5) Decode + extract
    html = decode_body(body)
    logger.debug("scraper.content.html_decoded", trace_id=trace_id, story_id=story_id, html_size=len(html))

    logger.info("scraper.extract.start", trace_id=trace_id, story_id=story_id)
    text, headings, author = extract_content(html)
    words = len((text or "").split())
    is_paywalled = bool(words < 100 and any(k in html.lower() for k in ["subscribe", "paywall"]))
    is_pdf = False
    logger.info("scraper.extract.done", trace_id=trace_id, story_id=story_id,
                word_count=words, headings_count=len(headings), author=author, is_paywalled=is_paywalled)

    # 6) Headless fallback for empty content (only if we didn't already use headless for retryable errors)
    if not text and cfg.headless_enabled and not used_headless:
        logger.info("scraper.headless.content_fallback.start", trace_id=trace_id, story_id=story_id)
        try:
            headless = _maybe_call_async(headless_fetch, final_url)
            if headless:
                _fu, _ct, b2, _h2 = headless
                html2 = b2.decode("utf-8", errors="ignore") if isinstance(b2, (bytes, bytearray)) else str(b2)
                text, headings, author = extract_content(html2)
                words = len((text or "").split())
                logger.info("scraper.headless.content_fallback.success", trace_id=trace_id, story_id=story_id, word_count=words)
            else:
                logger.warn("scraper.headless.content_fallback.no_content", trace_id=trace_id, story_id=story_id)
        except Exception as e:
            logger.error("scraper.headless.content_fallback.error", trace_id=trace_id, story_id=story_id, error=str(e))

    if not text:
        logger.error("scraper.content.empty_after_extraction", trace_id=trace_id, story_id=story_id)
        return _handle_dlq(job, reason="EMPTY_CONTENT", err="no text after extraction")

    # 7) Language + content hash
    logger.info("scraper.language.detect.start", trace_id=trace_id, story_id=story_id)
    lang = detect_language(text, cfg.allowed_langs)
    if lang == "und":
        logger.warn("scraper.language.undetected", trace_id=trace_id, story_id=story_id)
    else:
        logger.info("scraper.language.detected", trace_id=trace_id, story_id=story_id, language=lang)

    chash = content_hash(lang, domain, text)
    logger.debug("scraper.content.hash", trace_id=trace_id, story_id=story_id, content_hash=chash)

    # 8) DB txn
    logger.info("scraper.database.transaction.start", trace_id=trace_id, story_id=story_id)
    try:
        with transaction() as conn:
            article_id = upsert_article_tx(conn, lang, None, text, words, chash)
            link_story_tx(conn, story_id, article_id, domain=domain, author=author)
        logger.info("scraper.database.transaction.success", trace_id=trace_id, story_id=story_id, article_id=article_id)
    except Exception as e:
        logger.error("scraper.database.transaction.error", trace_id=trace_id, story_id=story_id, error=str(e))
        return _handle_retry(job, reason="DB_ERROR", err=str(e))

    # 9) Enqueue summarizer
    logger.info("scraper.summarizer.enqueue.start", trace_id=trace_id, story_id=story_id, article_id=article_id)
    payload = build_summarizer_payload(trace_id, story, article_id, lang, text, headings,
                                       is_pdf, is_paywalled, domain, final_url)
    try:
        lpush(cfg.summarizer_queue, payload)
        logger.info("scraper.summarizer.enqueue.success", trace_id=trace_id, story_id=story_id,
                    article_id=article_id, queue=cfg.summarizer_queue)
        set_idempotent_done(story_id)
    except Exception as e:
        logger.error("scraper.summarizer.enqueue.error", trace_id=trace_id, story_id=story_id,
                     article_id=article_id, error=str(e))
        return _handle_retry(job, reason="REDIS_OUT", err=str(e))

    logger.info("scraper.job.completed", trace_id=trace_id, story_id=story_id, article_id=article_id)
    return True


# ---- retry / DLQ -------------------------------------------------------------------

def _handle_retry(job: Dict[str, Any], reason: str, err: str) -> bool:
    cfg = load_config()
    attempt = int(job.get("attempt", 0)) + 1
    trace_id = job.get("trace_id")
    story_id = job.get("story", {}).get("id")

    if attempt < cfg.max_retries:
        delay_ms = int((2 ** attempt) * 1000 * (1.0 + random.random() * 0.25))
        job["attempt"] = attempt
        job["visible_at"] = _now_ms() + delay_ms
        rpush(cfg.retry_queue, job)
        logger.warn("scraper.job.requeued", trace_id=trace_id, story_id=story_id,
                       attempt=attempt, reason=reason, delay_ms=delay_ms, queue=cfg.retry_queue)
    else:
        logger.error("scraper.job.max_retries_exceeded", trace_id=trace_id, story_id=story_id,
                     attempt=attempt, reason=reason)
        _handle_dlq(job, reason=reason, err=err)
    return True


def _handle_dlq(job: Dict[str, Any], reason: str, err: str) -> bool:
    cfg = load_config()
    trace_id = job.get("trace_id")
    story_id = job.get("story", {}).get("id")
    payload = {"reason": reason, "err": err, "job": job}
    rpush(cfg.dlq, payload)
    logger.error("scraper.job.dlq", trace_id=trace_id, story_id=story_id, reason=reason, queue=cfg.dlq)
    return True


# ---- single-worker loop ------------------------------------------------------------

def main() -> None:
    cfg = load_config()
    logger.info(
        "scraper.worker.start",
        queues={"in": cfg.input_queue, "out": cfg.summarizer_queue, "retry": cfg.retry_queue, "dlq": cfg.dlq},
        concurrency=1,
        max_retries=cfg.max_retries,
        headless_enabled=cfg.headless_enabled,
    )

    processed_count = 0
    while True:
        try:
            logger.debug("scraper.loop.iteration", processed_count=processed_count)
            if process_one():
                processed_count += 1
                logger.info("scraper.loop.successful_processing", processed_count=processed_count)

                delay_seconds = getattr(cfg, "post_scrape_delay_seconds", 0) or 0
                if delay_seconds > 0:
                    logger.info("scraper.loop.delay_start", delay_seconds=3)
                    time.sleep(3)
                    logger.info("scraper.loop.delay_complete")
            else:
                logger.debug("scraper.loop.no_job_available")
                # close any background pools (DB connection pool, threadpools, etc.)
                try:
                    close_pool()
                except Exception:
                    pass
                return
        except Exception as e:
            logger.error("scraper.loop.error", error=str(e), processed_count=processed_count)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
