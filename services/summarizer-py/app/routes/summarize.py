from fastapi import APIRouter, HTTPException
from ..models import SummarizeRequest, SummarizeResponse
from ..db import fetch_article_text, upsert_summary
from ..services.summarizer import simple_summarize

router = APIRouter()


@router.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest):
    try:
        text, _lang = fetch_article_text(req.article_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="article_not_found")

    summary = simple_summarize(text, lang=req.lang)
    upsert_summary(req.article_id, req.model, req.lang, summary)
    return SummarizeResponse(article_id=req.article_id, summary=summary)

