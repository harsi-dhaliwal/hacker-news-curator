from contextlib import contextmanager
from typing import Optional
from psycopg.pool import ConnectionPool
from .config import config


pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global pool
    if pool is None:
        if not config.DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set")
        pool = ConnectionPool(conninfo=config.DATABASE_URL, min_size=1, max_size=10)
    return pool


@contextmanager
def conn_cursor():
    p = get_pool()
    with p.connection() as conn:
        with conn.cursor() as cur:
            yield conn, cur


def link_story_article(story_id: str, article_id: str) -> None:
    with conn_cursor() as (conn, cur):
        cur.execute("UPDATE story SET article_id = %s WHERE id = %s", (article_id, story_id))
        conn.commit()


def get_story_url_title(story_id: str) -> tuple[str | None, str | None]:
    with conn_cursor() as (conn, cur):
        cur.execute("SELECT url, title FROM story WHERE id = %s", (story_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError("story_not_found")
        return row[0], row[1]


def upsert_article_from_text(text: str, language: str = "en", html: Optional[str] = None) -> str:
    from hashlib import sha1
    norm = " ".join((text or "").split())
    content_hash = sha1(norm.encode("utf-8")).hexdigest()
    word_count = len(norm.split())
    with conn_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO article(language, html, text, word_count, content_hash)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (content_hash) DO UPDATE SET language = EXCLUDED.language
            RETURNING id
            """,
            (language, html, norm, word_count, content_hash),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0]


def get_or_create_tag(slug: str, name: Optional[str] = None, kind: str = "tech") -> str:
    with conn_cursor() as (conn, cur):
        cur.execute("SELECT id FROM tag WHERE slug = %s", (slug,))
        r = cur.fetchone()
        if r:
            return r[0]
        cur.execute(
            "INSERT INTO tag(slug, name, kind) VALUES (%s,%s,%s) RETURNING id",
            (slug, name or slug.title(), kind),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0]


def attach_tag_to_story(story_id: str, tag_id: str) -> None:
    with conn_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO story_tag(story_id, tag_id)
            VALUES (%s,%s)
            ON CONFLICT DO NOTHING
            """,
            (story_id, tag_id),
        )
        conn.commit()


def refresh_recent_hot_scores(hours: int = 48) -> int:
    with conn_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO rank_signals(story_id, hot_score, decay_ts, click_count, dwell_ms_avg, updated_at)
            SELECT s.id,
                   compute_hot_score(COALESCE(s.points,0), COALESCE(s.comments_count,0), EXTRACT(EPOCH FROM (now() - s.created_at))/3600.0),
                   now(),
                   rs.click_count,
                   rs.dwell_ms_avg,
                   now()
            FROM story s
            LEFT JOIN rank_signals rs ON rs.story_id = s.id
            WHERE s.created_at >= now() - (%s || ' hours')::interval
            ON CONFLICT (story_id) DO UPDATE
              SET hot_score = EXCLUDED.hot_score, decay_ts = EXCLUDED.decay_ts, updated_at = now()
            RETURNING story_id
            """,
            (hours,),
        )
        rows = cur.fetchall() or []
        conn.commit()
        return len(rows)
