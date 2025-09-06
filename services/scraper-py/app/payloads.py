import time
from typing import Dict, List, Tuple

from .normalize import reading_time_min


def first_paragraphs(text: str, max_chars: int) -> str:
    parts = [p.strip() for p in (text or "").split("\n\n") if p.strip()]
    out = []
    total = 0
    for p in parts:
        if total + len(p) > max_chars and out:
            break
        out.append(p)
        total += len(p)
    return "\n\n".join(out)[:max_chars]


def last_paragraphs(text: str, max_chars: int) -> str:
    parts = [p.strip() for p in (text or "").split("\n\n") if p.strip()]
    parts.reverse()
    out = []
    total = 0
    for p in parts:
        if total + len(p) > max_chars and out:
            break
        out.append(p)
        total += len(p)
    out.reverse()
    return "\n\n".join(out)[:max_chars]


def candidate_tags_from(story_title: str, domain: str, headings: List[str], url_path: str) -> List[str]:
    tags = []
    for token in (story_title or "").replace("/", " ").split():
        if token and token[0].isupper():
            tags.append(token.strip(".,:;!?").strip())
    tags.extend([h.split(" ")[0] for h in (headings or []) if h])
    for seg in url_path.split("/"):
        if seg and seg.isalpha() and len(seg) <= 20:
            tags.append(seg.title())
    # de-dupe case-insensitive and clamp to 6
    seen = set()
    out = []
    for t in tags:
        tl = t.lower()
        if tl in seen:
            continue
        seen.add(tl)
        out.append(t)
        if len(out) >= 6:
            break
    return out


def build_summarizer_payload(trace_id: str, story: Dict, article_id: str, language: str, text: str, headings: List[str], is_pdf: bool, is_paywalled: bool, domain: str, url: str) -> Dict:
    words = len((text or "").split())
    head = first_paragraphs(text, 900)
    tail = last_paragraphs(text, 600)
    from urllib.parse import urlparse
    path = urlparse(url).path or "/"
    payload = {
        "trace_id": trace_id,
        "story": {
            "id": story.get("id"),
            "hn_id": story.get("hn_id"),
            "source": story.get("source"),
            "title": story.get("title"),
            "url": story.get("url"),
            "domain": domain,
            "created_at": story.get("created_at"),
        },
        "article": {
            "id": article_id,
            "language": language,
            "word_count": words,
            "is_pdf": is_pdf,
            "is_paywalled": is_paywalled,
            "text_head": head,
            "headings": headings[:5],
            "text_tail": tail,
        },
        "hints": {
            "candidate_tags": candidate_tags_from(story.get("title") or "", domain, headings[:5], path),
            "source_reputation": 0.5,
        },
        "metrics": None,
        "attempt": 0,
        "schema_version": 1,
    }
    return payload

