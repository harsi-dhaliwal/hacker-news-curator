import os
from typing import Optional


class Config:
    """Runtime configuration for the summarizer worker (Redis + LLM).

    All values are read once at import time; mutate env and re-import to change.
    """

    # Core infra
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    INPUT_QUEUE: str = os.environ.get("INPUT_QUEUE", "summarizer:in")
    OUTPUT_QUEUE: str = os.environ.get("OUTPUT_QUEUE", "summarizer:out")
    RETRY_QUEUE: str = os.environ.get("RETRY_QUEUE", "summarizer:retry")
    DLQ: str = os.environ.get("DLQ", "summarizer:dlq")

    # LLM
    LLM_MODEL: str = os.environ.get("LLM_MODEL", "gpt-4o-mini-2024-07-18")
    LLM_API_KEY: Optional[str] = os.environ.get("LLM_API_KEY")
    LLM_API_BASE: Optional[str] = os.environ.get("LLM_API_BASE")  # optional override
    LLM_TEMPERATURE: float = float(os.environ.get("LLM_TEMPERATURE", "0.1"))
    LLM_MAX_TOKENS: int = int(os.environ.get("LLM_MAX_TOKENS", "800"))
    LLM_TIMEOUT: float = float(os.environ.get("LLM_TIMEOUT", "20"))

    # Behavior
    MAX_RETRIES: int = int(os.environ.get("MAX_RETRIES", "3"))
    VISIBILITY_TIMEOUT_SEC: int = int(os.environ.get("VISIBILITY_TIMEOUT", "120").rstrip("s"))
    JSON_SCHEMA_VERSION: int = int(os.environ.get("JSON_SCHEMA_VERSION", "1"))
    EMBEDDINGS_ENABLED: bool = os.environ.get("EMBEDDINGS_ENABLED", "false").lower() in ("1", "true", "yes")

    # Observability
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "info").lower()


config = Config()
