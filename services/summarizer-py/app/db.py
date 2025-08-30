from contextlib import contextmanager
from psycopg.pool import ConnectionPool
from .config import config
from pgvector.psycopg import register_vector, Vector


pool: ConnectionPool | None = None


def _configure(conn):
    try:
        register_vector(conn)
    except Exception:
        # If extension missing on connection, registration may still succeed
        # once extension exists. Best-effort.
        pass


def get_pool() -> ConnectionPool:
    global pool
    if pool is None:
        if not config.DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set")
        pool = ConnectionPool(conninfo=config.DATABASE_URL, min_size=1, max_size=10, configure=_configure)
    return pool


@contextmanager
def conn_cursor():
    p = get_pool()
    with p.connection() as conn:
        with conn.cursor() as cur:
            yield conn, cur


def fetch_article_text(article_id: str) -> tuple[str, str]:
    """Return (text, language) for article."""
    with conn_cursor() as (conn, cur):
        cur.execute(
            "SELECT text, language FROM article WHERE id = %s",
            (article_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("article_not_found")
        return row[0], row[1]


def get_embedding_dims(model_key: str) -> int:
    with conn_cursor() as (conn, cur):
        cur.execute(
            "SELECT dimensions FROM embedding_model WHERE key = %s",
            (model_key,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("embedding_model_not_found")
        return int(row[0])


def upsert_summary(article_id: str, model: str, lang: str, summary: str) -> None:
    # No unique constraint present: emulate idempotency by delete+insert
    with conn_cursor() as (conn, cur):
        cur.execute(
            "DELETE FROM summary WHERE article_id = %s AND model = %s AND lang = %s",
            (article_id, model, lang),
        )
        cur.execute(
            """
            INSERT INTO summary(article_id, model, lang, summary)
            VALUES (%s, %s, %s, %s)
            """,
            (article_id, model, lang, summary),
        )
        conn.commit()


def upsert_embedding(article_id: str, model_key: str, vector: list[float]) -> None:
    # Rely on UNIQUE (article_id, model_key)
    with conn_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO embedding(article_id, model_key, vector)
            VALUES (%s, %s, %s)
            ON CONFLICT (article_id, model_key)
            DO UPDATE SET vector = EXCLUDED.vector, created_at = now()
            """,
            (article_id, model_key, Vector(vector)),
        )
        conn.commit()
