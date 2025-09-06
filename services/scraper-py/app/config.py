import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    redis_url: str
    input_queue: str
    summarizer_queue: str
    retry_queue: str
    dlq: str
    pg_dsn: str
    worker_concurrency: int
    fetch_timeout_ms: int
    max_retries: int
    user_agent: str
    headless_enabled: bool
    headless_timeout_ms: int
    allowed_langs: Optional[str]
    log_level: str
    post_scrape_delay_seconds: int


def load_config() -> Config:
    redis = os.environ.get("REDIS_URL")
    pg = os.environ.get("PG_DSN") or os.environ.get("DATABASE_URL")
    if not redis:
        raise RuntimeError("REDIS_URL is required (e.g., redis://localhost:6379/0)")
    if not pg:
        raise RuntimeError("PG_DSN or DATABASE_URL is required (postgresql://user:pass@host:5432/db)")
    return Config(
        redis_url=redis,
        input_queue=os.environ.get("INPUT_QUEUE", "ingest:out"),
        summarizer_queue=os.environ.get("SUMMARIZER_QUEUE", "summarizer:in"),
        retry_queue=os.environ.get("RETRY_QUEUE", "scraper:retry"),
        dlq=os.environ.get("DLQ", "scraper:dlq"),
        pg_dsn=pg,
        worker_concurrency=int(os.environ.get("WORKER_CONCURRENCY", "4")),
        fetch_timeout_ms=int(os.environ.get("FETCH_TIMEOUT_MS", "15000")),
        max_retries=int(os.environ.get("MAX_RETRIES", "2")),
        user_agent=os.environ.get("USER_AGENT", "YourAppScraper/1.0 (+contact)"),
        headless_enabled=(os.environ.get("HEADLESS_ENABLED", "true").lower() in ("1","true","yes")),
        headless_timeout_ms=int(os.environ.get("HEADLESS_TIMEOUT_MS", "20000")),
        allowed_langs=os.environ.get("ALLOWED_LANGS"),
        log_level=os.environ.get("LOG_LEVEL", "debug"),
        post_scrape_delay_seconds=int(os.environ.get("POST_SCRAPE_DELAY_SECONDS", "10")),
    )


# Back-compat simple attributes
class _Compat:
    def __init__(self):
        c = load_config()
        self.REDIS_URL = c.redis_url
        self.INPUT_QUEUE = c.input_queue
        self.SUMMARIZER_QUEUE = c.summarizer_queue
        self.RETRY_QUEUE = c.retry_queue
        self.DLQ = c.dlq
        self.PG_DSN = c.pg_dsn
        self.WORKER_CONCURRENCY = c.worker_concurrency
        self.FETCH_TIMEOUT_MS = c.fetch_timeout_ms
        self.MAX_RETRIES = c.max_retries
        self.USER_AGENT = c.user_agent
        self.HEADLESS_ENABLED = c.headless_enabled
        self.HEADLESS_TIMEOUT_MS = c.headless_timeout_ms
        self.ALLOWED_LANGS = c.allowed_langs
        self.LOG_LEVEL = c.log_level
        self.POST_SCRAPE_DELAY_SECONDS = c.post_scrape_delay_seconds


config = _Compat()

