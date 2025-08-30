from typing import Tuple


def simple_summarize(text: str, lang: str = "en", max_sentences: int = 3) -> str:
    """Dev-friendly heuristic summary: first N sentences, trimmed.
    Replace with real model integration when available.
    """
    if not text:
        return ""
    # naive sentence split
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    snippet = ". ".join(sentences[:max_sentences])
    if snippet and not snippet.endswith("."):
        snippet += "."
    return snippet[:2000]

