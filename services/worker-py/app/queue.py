"""Redis helper for the worker (sync client).

We keep the API minimal; calls can be wrapped with asyncio.to_thread.
"""

from typing import Optional, Tuple
import json
from redis import Redis

from .config import load_config


_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        cfg = load_config()
        _redis = Redis.from_url(cfg.redis_url, decode_responses=True)
    return _redis


def enqueue(queue_name: str, payload: dict) -> None:
    get_redis().lpush(f"queue:{queue_name}", json.dumps(payload))


def blpop(queues: list[str], timeout: int = 5) -> Optional[Tuple[str, dict]]:
    keys = [f"queue:{q}" for q in queues]
    result = get_redis().blpop(keys, timeout=timeout)
    if not result:
        return None
    key, val = result
    try:
        payload = json.loads(val)
    except Exception:
        payload = {"raw": val}
    return key.split(":", 1)[1], payload
