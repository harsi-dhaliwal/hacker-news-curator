import httpx
from ..config import config


async def handle(job: dict):
    article_id = job.get("article_id")
    model = job.get("model", "gpt-4.1")
    lang = job.get("lang", "en")
    if not article_id:
        raise ValueError("invalid_job_payload")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{config.SUMMARIZER_URL}/summarize",
            json={"article_id": article_id, "model": model, "lang": lang},
        )
        resp.raise_for_status()
        return resp.json()

