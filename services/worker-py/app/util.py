import logging
from datetime import datetime, timezone
import traceback


class KeyValueFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        lvl = record.levelname
        msg = record.getMessage()

        # Build key=value pairs from record.__dict__ extras
        parts = [f"ts={ts}", f"lvl={lvl}", f"msg=\"{msg}\""]
        # Common service tag
        svc = getattr(record, "svc", None)
        if svc:
            parts.insert(2, f"svc={svc}")

        for k, v in sorted(record.__dict__.items()):
            if k in {"msg", "args", "levelname", "levelno", "pathname", "filename", "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName", "created", "msecs", "relativeCreated", "thread", "threadName", "processName", "process", "name"}:
                continue
            if k == "svc":
                continue
            parts.append(f"{k}={repr(v) if isinstance(v, str) else v}")

        return " ".join(parts)


def setup_logging(level: str | None = None) -> None:
    import os

    lvl = (level or os.environ.get("LOG_LEVEL") or "INFO").upper()
    logging.captureWarnings(True)
    root = logging.getLogger()
    root.setLevel(lvl)
    handler = logging.StreamHandler()
    handler.setFormatter(KeyValueFormatter())
    root.handlers[:] = [handler]


def get_logger() -> logging.Logger:
    return logging.getLogger("worker")


def format_exception_one_line() -> str:
    tb = traceback.format_exc()
    return " | ".join(line.strip() for line in tb.splitlines() if line.strip())

