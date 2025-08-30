import httpx
from ..config import config


async def handle(job: dict):
    article_id = job.get("article_id")
    model_key = job.get("model_key", "default")
    if not article_id:
        raise ValueError("invalid_job_payload")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{config.SUMMARIZER_URL}/embed",
            json={"article_id": article_id, "model_key": model_key},
        )
        resp.raise_for_status()
        return resp.json()

