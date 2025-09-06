import hashlib
import math
import re
import time
from typing import Dict, Tuple, Optional
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

import langid
import tldextract


TRACKING_PARAMS = {"utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid","mc_cid","mc_eid"}


def canonicalize_url(url: str) -> Tuple[str, str]:
    p = urlparse(url)
    qs = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=False) if k.lower() not in TRACKING_PARAMS]
    cleaned = p._replace(query=urlencode(qs, doseq=True), fragment="")
    canon = urlunparse(cleaned)
    ext = tldextract.extract(canon)
    domain = ".".join(part for part in [ext.domain, ext.suffix] if part)
    return canon, domain


def detect_language(text: str, allowed_csv: Optional[str] = None) -> str:
    if not text:
        return "und"
    lang, _ = langid.classify(text)
    if allowed_csv:
        allowed = {x.strip() for x in allowed_csv.split(",") if x.strip()}
        if lang not in allowed:
            return "und"
    return lang


def reading_time_min(words: int) -> int:
    return max(1, min(60, math.ceil(words / 200)))


def content_hash(language: str, domain: str, text: str, max_chars: int = 10000) -> str:
    base = f"{language}\n{domain}\n{text[:max_chars]}".encode("utf-8", errors="ignore")
    return hashlib.sha256(base).hexdigest()

