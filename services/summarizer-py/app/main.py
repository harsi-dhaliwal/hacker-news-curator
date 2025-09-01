import asyncio
import sys
from typing import Dict, Any

from .config import config
from .logging import logger
from .redis_io import redis_client
from .worker import worker_main


class SetupError(Exception):
    """Raised when service setup fails."""
    pass


async def setup_and_validate() -> None:
    """Comprehensive setup and validation before starting the worker.
    
    Raises SetupError if any critical dependency is missing or invalid.
    """
    logger.info("setup.starting")
    
    # 1. Validate configuration
    _validate_config()
    
    # 2. Test Redis connectivity
    await _test_redis_connection()
    
    # 3. Validate LLM configuration
    _validate_llm_config()
    
    logger.info("setup.completed", 
                config={
                    "redis_url": _mask_url(config.REDIS_URL),
                    "queues": {
                        "input": config.INPUT_QUEUE,
                        "output": config.OUTPUT_QUEUE,
                        "retry": config.RETRY_QUEUE,
                        "dlq": config.DLQ
                    },
                    "llm_model": config.LLM_MODEL,
                    "max_retries": config.MAX_RETRIES,
                    "schema_version": config.JSON_SCHEMA_VERSION
                })


def _validate_config() -> None:
    """Validate required configuration values."""
    logger.info("setup.validating_config")
    
    required_configs = [
        ("REDIS_URL", config.REDIS_URL),
        ("INPUT_QUEUE", config.INPUT_QUEUE), 
        ("OUTPUT_QUEUE", config.OUTPUT_QUEUE),
        ("RETRY_QUEUE", config.RETRY_QUEUE),
        ("DLQ", config.DLQ),
        ("LLM_MODEL", config.LLM_MODEL),
        ("LLM_API_KEY", config.LLM_API_KEY),
    ]
    
    missing = []
    for name, value in required_configs:
        if not value or (isinstance(value, str) and not value.strip()):
            missing.append(name)
    
    if missing:
        raise SetupError(f"Missing required configuration: {', '.join(missing)}")
    
    # Validate numeric configs
    if config.MAX_RETRIES < 0:
        raise SetupError(f"MAX_RETRIES must be >= 0, got {config.MAX_RETRIES}")
    
    if config.JSON_SCHEMA_VERSION < 1:
        raise SetupError(f"JSON_SCHEMA_VERSION must be >= 1, got {config.JSON_SCHEMA_VERSION}")
    
    if config.LLM_TEMPERATURE < 0 or config.LLM_TEMPERATURE > 2:
        raise SetupError(f"LLM_TEMPERATURE must be 0-2, got {config.LLM_TEMPERATURE}")
    
    if config.LLM_MAX_TOKENS < 1:
        raise SetupError(f"LLM_MAX_TOKENS must be > 0, got {config.LLM_MAX_TOKENS}")


async def _test_redis_connection() -> None:
    """Test Redis connectivity."""
    logger.info("setup.testing_redis")
    
    try:
        r = redis_client()
        pong = await r.ping()
        if not pong:
            raise SetupError("Redis ping failed")
        logger.info("setup.redis_ok")
    except Exception as e:
        raise SetupError(f"Redis connection failed: {str(e)}") from e


def _validate_llm_config() -> None:
    """Validate LLM configuration."""
    logger.info("setup.validating_llm")
    
    # LLM API key is required - no fallback to heuristics
    if not config.LLM_API_KEY:
        raise SetupError("LLM_API_KEY is required - no heuristic fallback available")
    
    # Validate API base URL format if provided
    if config.LLM_API_BASE:
        if not config.LLM_API_BASE.startswith(("http://", "https://")):
            raise SetupError(f"LLM_API_BASE must be a valid URL, got: {config.LLM_API_BASE}")
    
    logger.info("setup.llm_ok", mode="api_key_configured")





def _mask_url(url: str) -> str:
    """Mask sensitive parts of URLs for logging."""
    if not url:
        return url
    
    # Simple masking - hide password if present
    if "@" in url and "//" in url:
        parts = url.split("//", 1)
        if len(parts) == 2 and "@" in parts[1]:
            auth_host = parts[1].split("@", 1)
            if len(auth_host) == 2:
                auth = auth_host[0]
                if ":" in auth:
                    user, _ = auth.split(":", 1)
                    masked_auth = f"{user}:***"
                else:
                    masked_auth = "***"
                return f"{parts[0]}//{masked_auth}@{auth_host[1]}"
    return url


async def main():
    """Run the summarizer worker with comprehensive setup."""
    try:
        await setup_and_validate()
        logger.info("worker.starting")
        await worker_main()
    except SetupError as e:
        logger.error("setup.failed", error=str(e))
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("worker.interrupted")
        sys.exit(0)
    except Exception as e:
        logger.error("worker.unexpected_error", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
