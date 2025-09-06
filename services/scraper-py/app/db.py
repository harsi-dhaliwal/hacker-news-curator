from contextlib import contextmanager
from typing import Iterable, Optional

from psycopg_pool import ConnectionPool

from .config import load_config


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        cfg = load_config()
        _pool = ConnectionPool(conninfo=cfg.pg_dsn, min_size=1, max_size=10)
    return _pool


def close_pool() -> None:
    """Close the global ConnectionPool if it exists.

    We defensively call close/wait_closed if available on the implementation so
    the process doesn't hang on program exit due to background threads.
    """
    global _pool
    if _pool is None:
        return
    try:
        # preferred: close method
        close_fn = getattr(_pool, "close", None)
        if callable(close_fn):
            close_fn()
    except Exception:
        pass
    try:
        # some pool implementations expose wait_closed / closed / shutdown
        wait_fn = getattr(_pool, "wait_closed", None) or getattr(_pool, "wait_shutdown", None)
        if callable(wait_fn):
            wait_fn()
    except Exception:
        pass
    try:
        # finally drop reference so future calls will recreate
        _pool = None
    except Exception:
        _pool = None


@contextmanager
def transaction():
    p = get_pool()
    with p.connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def upsert_article_tx(conn, language: str, html: Optional[str], text: str, word_count: int, content_hash: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            (
                "INSERT INTO article(language, html, text, word_count, content_hash) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (content_hash) DO NOTHING "
                "RETURNING id"
            ),
            (language, html, text, word_count, content_hash),
        )
        row = cur.fetchone()
        if row and row[0]:
            return row[0]
        cur.execute("SELECT id FROM article WHERE content_hash = %s", (content_hash,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError("article_upsert_failed")
        return row[0]


def link_story_tx(conn, story_id: str, article_id: str, domain: Optional[str], author: Optional[str]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            (
                "UPDATE story SET article_id = %s, domain = COALESCE(domain, %s), author = COALESCE(author, %s) "
                "WHERE id = %s"
            ),
            (article_id, domain, author, story_id),
        )

