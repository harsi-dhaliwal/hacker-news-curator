import os


class Config:
    DATABASE_URL: str | None = os.environ.get("DATABASE_URL")
    DEFAULT_EMBEDDING_MODEL_KEY: str = os.environ.get("EMBEDDING_MODEL_KEY", "default")
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "info")


config = Config()

