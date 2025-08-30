import asyncio
import json
import time
from typing import Dict, Callable
from .queue import blpop, enqueue
from .config import config

# Task registry
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


class Worker:
    def __init__(self):
        self._stop = False
        self.stats = {k: {"ok": 0, "err": 0} for k in HANDLERS.keys()}

    async def run_once(self, timeout: int = 5):
        item = await blpop(list(HANDLERS.keys()), timeout=timeout)
        if not item:
            return
        qname, payload = item
        handler = HANDLERS.get(qname)
        if not handler:
            return
        attempt = int(payload.get("attempt", 1))
        try:
            result = await handler(payload)
            self.stats[qname]["ok"] += 1
            # Enqueue follow-ups
            if qname == "FETCH_ARTICLE":
                article_id = result.get("article_id")
                story_id = payload.get("story_id")
                await enqueue("SUMMARIZE", {"article_id": article_id, "attempt": 1})
                await enqueue("EMBED", {"article_id": article_id, "model_key": "default", "attempt": 1})
                await enqueue("TAG", {"story_id": story_id, "title": payload.get("title"), "attempt": 1})
        except Exception as e:
            self.stats[qname]["err"] += 1
            if attempt >= config.MAX_RETRIES:
                # Dead-letter
                await enqueue(f"DLQ:{qname}", {**payload, "error": str(e), "failed_at": int(time.time())})
            else:
                # simple backoff: requeue with attempt+1
                await enqueue(qname, {**payload, "attempt": attempt + 1})

    async def run_forever(self):
        while not self._stop:
            await self.run_once(timeout=5)

    async def stop(self):
        self._stop = True

