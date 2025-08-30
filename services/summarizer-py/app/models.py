from pydantic import BaseModel


class SummarizeRequest(BaseModel):
    article_id: str
    model: str = "gpt-4.1"
    lang: str = "en"


class SummarizeResponse(BaseModel):
    article_id: str
    summary: str


class EmbedRequest(BaseModel):
    article_id: str
    model_key: str = "default"


class EmbedResponse(BaseModel):
    article_id: str
    model_key: str
    dims: int

