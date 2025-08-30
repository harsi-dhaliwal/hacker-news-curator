from typing import Optional, Tuple
import json
import asyncio
import redis.asyncio as aioredis
from .config import config


redis = aioredis.from_url(config.REDIS_URL, decode_responses=True)


async def enqueue(queue_name: str, payload: dict):
    await redis.lpush(f"queue:{queue_name}", json.dumps(payload))


async def blpop(queues: list[str], timeout: int = 5) -> Optional[Tuple[str, dict]]:
    keys = [f"queue:{q}" for q in queues]
    result = await redis.blpop(keys, timeout=timeout)
    if not result:
        return None
    key, val = result
    try:
        payload = json.loads(val)
    except Exception:
        payload = {"raw": val}
    return key.split(":", 1)[1], payload

