
import json
import os
import socket
from typing import Any, Dict, List, Optional, Tuple, Union
from .logging import _safe_default
from redis.asyncio import Redis

from .config import config
from .logging import logger


def redis_client() -> Redis:
    return Redis.from_url(config.REDIS_URL, decode_responses=True, health_check_interval=10)

async def read_job(r: Redis, queues: Union[str, List[str]], block_ms: int = 1000) -> Optional[Dict[str, Any]]:
    """Read a job from one or more Redis lists using BRPOP (blocking pop from right).

    When multiple queues are provided, BRPOP checks them in the given order.
    """
    logger.debug("redis.read_job.start", queues=queues, block_ms=block_ms)
    
    try:
        # BRPOP blocks until a message is available or timeout
        keys: List[str] = queues if isinstance(queues, list) else [queues]
        # Redis timeout is in seconds; pass keys as a list (single positional)
        result = await r.brpop(keys, timeout=block_ms / 1000)
        
        if result:
            queue_name, message_data = result
            logger.info("redis.read_job.message_received", queue=queue_name)
            
            try:
                payload = json.loads(message_data)
                logger.debug("redis.read_job.payload_parsed", queue=queue_name, payload_keys=list(payload.keys()) if payload else [])
                return payload
            except Exception as e:
                logger.warn("redis.payload_parse_failed", queue=queue_name, error=str(e))
                return {}
        else:
            logger.debug("redis.read_job.no_messages", queues=queues)
            return None
            
    except Exception as e:
        logger.error("redis.read_job.error", queues=queues, error=str(e))
        raise


async def to_list(r: Redis, queue: str, payload: Dict[str, Any]) -> int:
    """Add a job to a Redis list using LPUSH (push to left)."""
    try:
        message_data = json.dumps(payload, default=_safe_default)
        result = await r.lpush(queue, message_data)
        logger.info("redis.to_list.success", queue=queue, list_length=result)
        return result
    except Exception as e:
        logger.error("redis.to_list.error", queue=queue, error=str(e))
        raise


async def set_idempotency(r: Redis, article_id: str, model: str, ttl_sec: int = 7 * 24 * 3600) -> bool:
    """Set idempotency key to prevent duplicate processing."""
    key = f"summarizer:done:{article_id}:{model}"
    was_set = await r.set(key, "1", nx=True, ex=ttl_sec)
    return bool(was_set)
