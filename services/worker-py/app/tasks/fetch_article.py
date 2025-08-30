from typing import Optional
import httpx
from bs4 import BeautifulSoup
from ..db import upsert_article_from_text, link_story_article, get_story_url_title


def extract_main_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    # Heuristic: join paragraphs with a blank space
    paras = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    text = "\n\n".join([p for p in paras if p])
    if not text:
        text = soup.get_text(" ", strip=True)
    return text


async def handle(job: dict):
    story_id = job.get("story_id")
    url: Optional[str] = job.get("url")
    if not story_id or not url:
        # Fallback: load from DB
        url, _title = get_story_url_title(story_id)
        if not url:
            raise ValueError("invalid_job_payload")
    # TODO: respect robots.txt (out of scope here)
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text
    text = extract_main_text(html)
    article_id = upsert_article_from_text(text=text, html=None)
    link_story_article(story_id, article_id)
    return {"article_id": article_id}
