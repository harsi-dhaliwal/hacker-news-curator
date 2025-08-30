from fastapi import APIRouter, HTTPException
from ..models import EmbedRequest, EmbedResponse
from ..db import fetch_article_text, get_embedding_dims, upsert_embedding
from ..services.embedder import deterministic_embed

router = APIRouter()


@router.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    try:
        text, _lang = fetch_article_text(req.article_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="article_not_found")

    try:
        dims = get_embedding_dims(req.model_key)
    except ValueError:
        raise HTTPException(status_code=400, detail="unknown_embedding_model")

    vector = deterministic_embed(text, dims)
    upsert_embedding(req.article_id, req.model_key, vector)
    return EmbedResponse(article_id=req.article_id, model_key=req.model_key, dims=dims)

