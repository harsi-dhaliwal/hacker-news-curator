import json
from typing import Any, Dict, Optional, List

import httpx
from openai import AsyncOpenAI
from openai._types import NOT_GIVEN
from pydantic import BaseModel, ValidationError

from .config import config


class LLMError(Exception):
    pass


_client: Optional[AsyncOpenAI] = None


def _get_client() -> AsyncOpenAI:
    """Singleton async client with optional base_url and timeout."""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=config.LLM_API_KEY,
            base_url=(config.LLM_API_BASE or None),
            timeout=float(getattr(config, "LLM_TIMEOUT", 20.0)),
        )
    return _client


async def summarize_with_llm(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Call an LLM to produce summarization JSON.

    Requires LLM_API_KEY to be configured - no heuristic fallback available.
    """
    if not config.LLM_API_KEY:
        raise LLMError("LLM_API_KEY is required - no heuristic fallback available")

    # Minimal OpenAI client (optional base_url if provided).
    client = _get_client()

    # ---------------------------
    # Build prompt (messages) and schema
    # ---------------------------
    system_prompt = (
        "You are an expert at structured data extraction. "
        "Convert the given article context into the specified structure."
    )

    story = payload.get("story", {}) or {}
    article = payload.get("article", {}) or {}
    hints = payload.get("hints", {}) or {}
    metrics = payload.get("metrics", {}) or {}

    user_prompt = {
        "task": "Summarize and classify the article into the target schema.",
        "context": {
            "title": story.get("title"),
            "domain": story.get("domain"),
            "url": story.get("url"),
            "language": article.get("language"),
            "is_pdf": article.get("is_pdf"),
            "is_paywalled": article.get("is_paywalled"),
            "headings": article.get("headings"),
            "text_head": article.get("text_head"),
            "text_tail": article.get("text_tail"),
            "hn_metrics": metrics,
            "candidate_tags": hints.get("candidate_tags"),
        },
        "requirements": {
            "summary": "<= 2 short paragraphs or 3 bullets",
            "classification.type.options": ["news", "article", "discussion", "research", "other"],
            "ui.summary_140": "<= 140 chars",
        },
    }

    class LinkProps(BaseModel):
        paywall: Optional[bool] = None
        format: Optional[str] = None
        is_pdf: Optional[bool] = None

    class Classification(BaseModel):
        primary_category: Optional[str] = None
        type: Optional[str] = None
        tags: Optional[List[str]] = None
        topics: Optional[List[str]] = None

    class UI(BaseModel):
        summary_140: Optional[str] = None
        quicktake: Optional[List[str]] = None
        audience: Optional[List[str]] = None
        impact_score: Optional[int] = None
        confidence: Optional[float] = None
        reading_time_min: Optional[int] = None
        link_props: Optional[LinkProps] = None

    class LLMResult(BaseModel):
        summary: Optional[str] = None
        classification: Optional[Classification] = None
        ui: Optional[UI] = None

    # Responses API payload
    model = config.LLM_MODEL
    temperature = getattr(config, "LLM_TEMPERATURE", 0.2)
    max_tokens = getattr(config, "LLM_MAX_TOKENS", None)

    try:
        # Parse directly into the typed schema using Responses API
        resp = await client.responses.parse(
            model=model,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
            ],
            temperature=temperature,
            max_output_tokens=(max_tokens if isinstance(max_tokens, int) else NOT_GIVEN),
            text_format=LLMResult,
        )

        parsed: Optional[LLMResult] = getattr(resp, "output_parsed", None)
        if parsed is None:
            raise LLMError("no_text_output")
        print(parsed)
        return parsed.model_dump(exclude_none=True)
    
    except (httpx.TimeoutException, httpx.ReadTimeout, httpx.WriteTimeout, httpx.ConnectTimeout) as e:
        raise LLMError("timeout") from e
    except ValidationError as e:
        # Map schema/parse issues to keep existing worker categorization
        raise LLMError("json_parse_failed") from e
    except Exception as e:
        raise LLMError("llm_failed") from e
