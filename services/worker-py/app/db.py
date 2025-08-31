"""Lightweight Postgres helper using psycopg3 connection pool.

Provides a global pool and convenience helpers for quick queries.
"""

from contextlib import contextmanager
from typing import Iterable, Optional

from psycopg_pool import ConnectionPool

from .config import load_config


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        cfg = load_config()
        if not cfg.database_url:
            raise RuntimeError("DATABASE_URL is not set")
        _pool = ConnectionPool(conninfo=cfg.database_url, min_size=1, max_size=10)
    return _pool


@contextmanager
def get_conn_cursor():
    p = get_pool()
    with p.connection() as conn:
        with conn.cursor() as cur:
            yield conn, cur


def query(sql: str, params: Optional[Iterable] = None) -> list[tuple]:
    """Execute a SQL query (read or write). Commits if needed; returns rows.
    For statements that don't return rows, returns an empty list.
    """
    with get_conn_cursor() as (conn, cur):
        cur.execute(sql, tuple(params) if params is not None else None)
        rows = []
        try:
            rows = cur.fetchall() or []
        except Exception:
            # No results to fetch
            rows = []
        conn.commit()
        return rows


@contextmanager
def transaction():
    """Context manager for an explicit transaction block."""
    p = get_pool()
    with p.connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# Domain helpers required by task handlers

def link_story_article(story_id: str, article_id: str) -> None:
    query("UPDATE story SET article_id = %s WHERE id = %s", (article_id, story_id))


def get_story_url_title(story_id: str) -> tuple[str | None, str | None]:
    rows = query("SELECT url, title FROM story WHERE id = %s", (story_id,))
    if not rows:
        raise ValueError("story_not_found")
    return rows[0][0], rows[0][1]


def upsert_article_from_text(text: str, language: str = "en", html: Optional[str] = None) -> str:
    from hashlib import sha1

    norm = " ".join((text or "").split())
    content_hash = sha1(norm.encode("utf-8")).hexdigest()
    word_count = len(norm.split())
    rows = query(
        (
            "INSERT INTO article(language, html, text, word_count, content_hash) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON CONFLICT (content_hash) DO UPDATE SET language = EXCLUDED.language "
            "RETURNING id"
        ),
        (language, html, norm, word_count, content_hash),
    )
    return rows[0][0]


def get_or_create_tag(slug: str, name: Optional[str] = None, kind: str = "tech") -> str:
    rows = query("SELECT id FROM tag WHERE slug = %s", (slug,))
    if rows:
        return rows[0][0]
    rows = query(
        "INSERT INTO tag(slug, name, kind) VALUES (%s,%s,%s) RETURNING id",
        (slug, name or slug.title(), kind),
    )
    return rows[0][0]


def attach_tag_to_story(story_id: str, tag_id: str) -> None:
    query(
        (
            "INSERT INTO story_tag(story_id, tag_id) VALUES (%s,%s) "
            "ON CONFLICT DO NOTHING"
        ),
        (story_id, tag_id),
    )


def refresh_recent_hot_scores(hours: int = 48) -> int:
    rows = query(
        (
            "INSERT INTO rank_signals(story_id, hot_score, decay_ts, click_count, dwell_ms_avg, updated_at) "
            "SELECT s.id, "
            "       compute_hot_score(COALESCE(s.points,0), COALESCE(s.comments_count,0), EXTRACT(EPOCH FROM (now() - s.created_at))/3600.0), "
            "       now(), rs.click_count, rs.dwell_ms_avg, now() "
            "FROM story s LEFT JOIN rank_signals rs ON rs.story_id = s.id "
            "WHERE s.created_at >= now() - (%s || ' hours')::interval "
            "ON CONFLICT (story_id) DO UPDATE SET hot_score = EXCLUDED.hot_score, decay_ts = EXCLUDED.decay_ts, updated_at = now() "
            "RETURNING story_id"
        ),
        (hours,),
    )
    return len(rows or [])
