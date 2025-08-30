from ..db import refresh_recent_hot_scores


async def handle(job: dict):
    hours = int(job.get("hours", 48))
    count = refresh_recent_hot_scores(hours=hours)
    return {"updated": count}

