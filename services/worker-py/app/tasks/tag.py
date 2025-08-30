from ..db import get_or_create_tag, attach_tag_to_story, get_story_url_title


KEYWORDS = {
    "ai": ["ai", "artificial intelligence", "gpt", "llm", "openai"],
    "security": ["security", "vuln", "cve", "xss", "csrf", "rce", "encryption"],
    "show": ["show hn"],
}


async def handle(job: dict):
    story_id = job.get("story_id")
    title = job.get("title") or (get_story_url_title(story_id)[1])
    text = (job.get("text") or "") + " " + (title or "")
    if not story_id:
        raise ValueError("invalid_job_payload")
    matched = set()
    low = text.lower()
    for slug, kws in KEYWORDS.items():
        if any(kw in low for kw in kws):
            matched.add(slug)
    # Always return quickly; upsert tags and link
    for slug in matched:
        tag_id = get_or_create_tag(slug, name=slug.title())
        attach_tag_to_story(story_id, tag_id)
    return {"tags": sorted(list(matched))}
