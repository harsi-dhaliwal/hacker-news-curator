from typing import List, Optional, Tuple
from bs4 import BeautifulSoup, FeatureNotFound

try:
    import trafilatura
    _HAS_TRAF = True
except Exception:
    _HAS_TRAF = False


def extract_with_bs4(html: str) -> Tuple[str, List[str], Optional[str]]:
    try:
        soup = BeautifulSoup(html, "lxml")
    except FeatureNotFound:
        soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    headings = []
    for tag in soup.find_all(["h1", "h2", "h3"]):
        txt = tag.get_text(" ", strip=True)
        if txt:
            headings.append(txt)
    author = None
    a = soup.find(attrs={"name": "author"})
    if a and a.get("content"):
        author = a["content"]
    text_parts = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    text = "\n\n".join([t for t in text_parts if t])
    if not text:
        text = soup.get_text(" ", strip=True)
    return text, headings[:5], author


def extract_content(html: str) -> Tuple[str, List[str], Optional[str]]:
    if _HAS_TRAF:
        try:
            extracted = trafilatura.extract(html, include_comments=False, include_tables=False, include_formatting=False)
            if extracted and len(extracted.strip()) > 0:
                # Trafilatura doesn't provide headings; fall back to bs4 for them
                _, heads, author = extract_with_bs4(html)
                return extracted.strip(), heads, author
        except Exception:
            pass
    return extract_with_bs4(html)

