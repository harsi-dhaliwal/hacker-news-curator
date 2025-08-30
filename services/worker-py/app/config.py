import os


class Config:
    DATABASE_URL: str | None = os.environ.get("DATABASE_URL")
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    SUMMARIZER_URL: str = os.environ.get("SUMMARIZER_URL", "http://localhost:8000")
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "info")
    MAX_RETRIES: int = int(os.environ.get("MAX_RETRIES", "5"))


config = Config()

