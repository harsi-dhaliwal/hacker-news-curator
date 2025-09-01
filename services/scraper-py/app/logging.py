import json
import sys
import time
from typing import Any, Dict, Iterable
import os
import uuid
import base64
from datetime import datetime, date
from decimal import Decimal

LEVELS = {"debug": 10, "info": 20, "warn": 30, "warning": 30, "error": 40}
_REDACT_KEYS = {"api_key", "authorization", "password", "secret", "token", "access_token", "refresh_token"}

def _safe_default(o: Any) -> Any:
    """Fallback serializer for non-JSON-serializable types."""
    if isinstance(o, uuid.UUID):
        return str(o)
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (bytes, bytearray)):
        # try utf-8, else base64
        try:
            return o.decode("utf-8")
        except Exception:
            return {"__b64__": base64.b64encode(bytes(o)).decode("ascii")}
    if isinstance(o, set):
        return list(o)
    if isinstance(o, Exception):
        return {"type": o.__class__.__name__, "message": str(o)}
    # as a last resort
    return str(o)

def _scrub(obj: Any, redact_keys: Iterable[str]) -> Any:
    """Recursively scrub sensitive fields by key name (case-insensitive)."""
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.lower() in redact_keys:
                out[k] = "[REDACTED]"
            else:
                out[k] = _scrub(v, redact_keys)
        return out
    if isinstance(obj, list):
        return [_scrub(v, redact_keys) for v in obj]
    if isinstance(obj, tuple):
        return tuple(_scrub(v, redact_keys) for v in obj)
    # primitives / everything else
    return obj

class JsonLogger:
    def __init__(self, level: str = "info") -> None:
        self.level = LEVELS.get(level.lower(), 20)
        self._pid = os.getpid()

    def _emit(self, level_name: str, event: str, **fields: Any) -> None:
        if LEVELS.get(level_name, 20) < self.level:
            return
        rec: Dict[str, Any] = {
            "ts": int(time.time() * 1000),
            "event": event,
            "level": level_name.upper() if level_name != "warning" else "WARN",
            "pid": self._pid,
        }
        # merge fields then scrub secrets recursively
        for k, v in fields.items():
            rec[k] = v
        rec = _scrub(rec, _REDACT_KEYS)

        try:
            sys.stdout.write(json.dumps(rec, default=_safe_default, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception as e:
            # Last-ditch: never crash the app because logging failed
            fallback = {
                "ts": rec.get("ts"),
                "event": "logger.error",
                "level": "ERROR",
                "orig_event": event,
                "orig_level": level_name.upper(),
                "error": str(e),
                "data_repr": repr(rec),
            }
            sys.stdout.write(json.dumps(fallback, default=_safe_default, ensure_ascii=False) + "\n")
            sys.stdout.flush()

    def debug(self, event: str, **fields: Any) -> None:
        self._emit("debug", event, **fields)

    def info(self, event: str, **fields: Any) -> None:
        self._emit("info", event, **fields)

    def warn(self, event: str, **fields: Any) -> None:
        self._emit("warn", event, **fields)

    # compatibility with std logging API
    def warning(self, event: str, **fields: Any) -> None:
        self._emit("warn", event, **fields)

    def error(self, event: str, **fields: Any) -> None:
        self._emit("error", event, **fields)

logger = JsonLogger(os.environ.get("LOG_LEVEL", "info"))
__all__ = ["logger","JsonLogger","_safe_default"]