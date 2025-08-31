from dataclasses import dataclass
import os


@dataclass
class Config:
    database_url: str
    redis_url: str
    log_level: str
    idle_heartbeat_sec: int
    summarizer_url: str
    max_retries: int


def load_config() -> Config:
    db = os.environ.get("DATABASE_URL")
    redis = os.environ.get("REDIS_URL")
    if not db:
        raise RuntimeError("DATABASE_URL is required (e.g., postgresql://user:pass@host:5432/db)")
    if not redis:
        raise RuntimeError("REDIS_URL is required (e.g., redis://localhost:6379/0)")
    level = os.environ.get("LOG_LEVEL", "INFO")
    idle = int(os.environ.get("IDLE_HEARTBEAT_SEC", "60"))
    summarizer = os.environ.get("SUMMARIZER_URL", "http://localhost:8000")
    max_retries = int(os.environ.get("MAX_RETRIES", "5"))
    return Config(
        database_url=db,
        redis_url=redis,
        log_level=level,
        idle_heartbeat_sec=idle,
        summarizer_url=summarizer,
        max_retries=max_retries,
    )


# Backward-compat for tasks expecting `from ..config import config` with attributes
class _CompatConfig:
    def __init__(self):
        cfg = load_config()
        self.DATABASE_URL = cfg.database_url
        self.REDIS_URL = cfg.redis_url
        self.LOG_LEVEL = cfg.log_level
        self.IDLE_HEARTBEAT_SEC = cfg.idle_heartbeat_sec
        self.SUMMARIZER_URL = cfg.summarizer_url
        self.MAX_RETRIES = cfg.max_retries


config = _CompatConfig()
