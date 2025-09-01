from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator
from .config import config


class Story(BaseModel):
    id: str
    hn_id: Optional[int]
    source: str
    title: str
    url: str
    domain: str
    created_at: str


class Article(BaseModel):
    id: str
    language: str = Field(..., min_length=2, max_length=5)
    word_count: Optional[int]
    is_pdf: Optional[bool] = False
    is_paywalled: Optional[bool] = False
    text_head: Optional[str] = ""
    headings: Optional[List[str]] = []
    text_tail: Optional[str] = ""


class Hints(BaseModel):
    candidate_tags: Optional[List[str]] = []
    source_reputation: Optional[float]


class Metrics(BaseModel):
    points: Optional[int]
    comments: Optional[int]
    captured_at: Optional[str]


class SummarizerIn(BaseModel):
    trace_id: str
    story: Story
    article: Article
    hints: Optional[Hints]
    metrics: Optional[Metrics]
    attempt: int = 0
    schema_version: int = 1

    @field_validator("schema_version")
    @classmethod
    def schema_version_match(cls, v: int) -> int:
        if v != config.JSON_SCHEMA_VERSION:
            raise ValueError("schema_version_mismatch")
        return v


class Classification(BaseModel):
    primary_category: Optional[str] = None
    type: Optional[Literal["news", "article", "discussion", "research", "other"]] = "news"
    tags: List[str] = []
    topics: List[str] = []


class UILayer(BaseModel):
    summary_140: Optional[str] = None
    quicktake: Optional[List[str]] = None
    audience: Optional[List[str]] = None
    impact_score: Optional[int] = None
    confidence: Optional[float] = None
    reading_time_min: Optional[int] = None
    link_props: Optional[Dict[str, Any]] = None

    @field_validator("impact_score")
    @classmethod
    def impact_score_range(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        return max(0, min(100, v))

    @field_validator("confidence")
    @classmethod
    def confidence_range(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        return max(0.0, min(1.0, v))


class Embedding(BaseModel):
    model_key: Optional[str] = None
    dimensions: Optional[int] = None
    vector: Optional[List[float]] = None


CONTROLLED_AUDIENCE = {
    "Kernel Devs",
    "OSS Maintainers",
    "Data Scientists",
    "Frontend Engineers",
    "Backend Engineers",
    "Security Engineers",
}


class SummarizerOut(BaseModel):
    trace_id: str
    story_id: str
    article_id: str
    model: str
    lang: str = Field(..., min_length=2, max_length=5)
    summary: str
    classification: Classification
    ui: UILayer
    embedding: Optional[Embedding] = None
    timestamps: Dict[str, str]
    schema_version: int = 1

    @field_validator("schema_version")
    @classmethod
    def schema_version_out_match(cls, v: int) -> int:
        if v != config.JSON_SCHEMA_VERSION:
            raise ValueError("schema_version_mismatch")
        return v

    @field_validator("summary")
    @classmethod
    def summary_non_empty_and_cap(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("summary_empty")
        # Cap at ~800 chars for DB friendliness
        return v[:800]

    @model_validator(mode="after")
    def validate_tags_topics_and_audience(self):
        if self.classification:
            tags = []
            for t in (self.classification.tags or [])[:6]:
                t = (t or "").strip()
                if not (2 <= len(t) <= 40):
                    continue
                # Simple aliasing: normalize casing for some known terms
                if t.lower() == "btrfs":
                    t = "Btrfs"
                tags.append(t)
            self.classification.tags = tags
            topics = []
            for t in (self.classification.topics or [])[:6]:
                t = (t or "").strip()
                if 2 <= len(t) <= 40:
                    topics.append(t)
            self.classification.topics = topics

        if self.ui and self.ui.audience:
            self.ui.audience = [a for a in self.ui.audience if a in CONTROLLED_AUDIENCE]

        return self

