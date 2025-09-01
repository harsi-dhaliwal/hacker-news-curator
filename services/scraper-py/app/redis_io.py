import json
import time
from typing import Any, Dict, Optional, Tuple

from redis import Redis
from app.logging import _safe_default
from .config import load_config
from .logging import logger


_r: Redis | None = None


def client() -> Redis:
    global _r
    if _r is None:
        cfg = load_config()
        logger.info("redis.client.connecting", url=cfg.redis_url)
        _r = Redis.from_url(cfg.redis_url, decode_responses=True)
        try:
            # Test the connection
            _r.ping()
            logger.info("redis.client.connected")
        except Exception as e:
            logger.error("redis.client.connection_failed", error=str(e))
            raise
    return _r


def blpop(queue: str, timeout: int = 5) -> Optional[Dict[str, Any]]:
    key = queue
    logger.debug("redis.blpop.start", queue=queue, key=key, timeout=timeout)
    try:
        res = client().blpop([key], timeout=timeout)
        if not res:
            logger.debug("redis.blpop.timeout", queue=queue, key=key)
            return None
        _k, v = res
        logger.debug("redis.blpop.success", queue=queue, key=key, value_length=len(v))
        try:
            return json.loads(v)
        except Exception as e:
            logger.warn("redis.blpop.json_parse_error", queue=queue, key=key, error=str(e))
            return {"raw": v}
    except Exception as e:
        logger.error("redis.blpop.error", queue=queue, key=key, error=str(e))
        raise


def rpush(queue: str, payload: Dict[str, Any]) -> None:
    key = queue
    logger.debug("redis.rpush.start", queue=queue, key=key)
    try:
        client().rpush(key, json.dumps(payload,default=_safe_default))
        logger.debug("redis.rpush.success", queue=queue, key=key)
    except Exception as e:
        logger.error("redis.rpush.error", queue=queue, key=key, error=str(e))
        raise


def lpush(queue: str, payload: Dict[str, Any]) -> int:
    """Add a job to a Redis list using LPUSH (push to left)."""
    logger.debug("redis.lpush.start", queue=queue)
    try:
        result = client().lpush(queue, json.dumps(payload, default=_safe_default))
        logger.debug("redis.lpush.success", queue=queue, list_length=result)
        return result
    except Exception as e:
        logger.error("redis.lpush.error", queue=queue, error=str(e))
        raise


def is_idempotent_done(story_id: str) -> bool:
    key = f"scraper:done:{story_id}"
    logger.debug("redis.idem.check", story_id=story_id, key=key)
    try:
        return client().exists(key) == 1
    except Exception as e:
        logger.error("redis.idem.check.error", story_id=story_id, key=key, error=str(e))
        raise

def set_idempotent_done(story_id: str, ttl_sec: int = 7 * 24 * 3600) -> None:
    key = f"scraper:done:{story_id}"
    logger.debug("redis.idem.mark", story_id=story_id, key=key, ttl=ttl_sec)
    try:
        client().set(key, "1", ex=ttl_sec)
    except Exception as e:
        logger.error("redis.idem.mark.error", story_id=story_id, key=key, error=str(e))
        raise