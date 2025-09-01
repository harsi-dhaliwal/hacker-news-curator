from typing import Dict, Any, List


ALIASES = {
    "btrfs": "Btrfs",
}


def normalize_tags(tags: List[str]) -> List[str]:
    out = []
    for t in (tags or [])[:6]:
        t = (t or "").strip()
        if not (2 <= len(t) <= 40):
            continue
        tl = t.lower()
        t = ALIASES.get(tl, t)
        out.append(t)
    return out


def clip_summary(text: str, max_len: int = 800) -> str:
    return (text or "").strip()[:max_len]

