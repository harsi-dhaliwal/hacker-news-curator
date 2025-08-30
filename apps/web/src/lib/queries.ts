import { Pool } from "pg";
import type { StoriesPage, StoryBase, SearchResults } from "@/types/api";

function mapStoryBase(r: any): StoryBase {
  return {
    id: r.id,
    source: r.source,
    hn_id: r.hn_id,
    title: r.title,
    url: r.url,
    domain: r.domain,
    author: r.author,
    points: r.points,
    comments_count: r.comments_count,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    fetched_at: r.fetched_at instanceof Date ? r.fetched_at.toISOString() : r.fetched_at,
    tags: r.tags || [],
    topics: r.topics || [],
  } as StoryBase;
}

export async function listStories(db: Pool, params: {
  q?: string;
  tags?: string[];
  topics?: string[];
  domain?: string | null;
  sort?: "hot" | "newest" | "points" | "comments";
  since?: string | null;
  limit: number;
  offset: number;
}): Promise<StoriesPage> {
  const where: string[] = [];
  const p: any[] = [];
  if (params.q) {
    p.push(params.q);
    where.push(`EXISTS (SELECT 1 FROM article a WHERE a.id = s.article_id AND a.tsv @@ plainto_tsquery('simple', $${p.length}))`);
  }
  if (params.domain) {
    p.push(params.domain);
    where.push(`s.domain = $${p.length}`);
  }
  if (params.since) {
    p.push(params.since);
    where.push(`s.created_at >= $${p.length}`);
  }
  if (params.tags && params.tags.length) {
    p.push(params.tags);
    where.push(
      `EXISTS (SELECT 1 FROM story_tag st JOIN tag t ON t.id = st.tag_id WHERE st.story_id = s.id AND t.slug = ANY($${p.length}::text[]))`
    );
  }
  if (params.topics && params.topics.length) {
    p.push(params.topics);
    where.push(
      `EXISTS (SELECT 1 FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id WHERE stp.story_id = s.id AND tp.slug = ANY($${p.length}::text[]))`
    );
  }
  const sort = params.sort || "hot";
  const orderBy =
    sort === "newest"
      ? "s.created_at DESC"
      : sort === "points"
      ? "s.points DESC NULLS LAST, s.created_at DESC"
      : sort === "comments"
      ? "s.comments_count DESC NULLS LAST, s.created_at DESC"
      : "COALESCE(s.hot_score, 0) DESC, s.created_at DESC";

  p.push(params.limit);
  p.push(params.offset);

  const sql = `
    SELECT
      s.id, s.source, s.hn_id, s.title, s.url, s.domain, s.author,
      s.points, s.comments_count, s.created_at, s.fetched_at,
      stags.tags, stopics.topics
    FROM story_list s
    LEFT JOIN LATERAL (
      SELECT coalesce(json_agg(json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind) ORDER BY t.slug), '[]'::json) AS tags
      FROM story_tag st JOIN tag t ON t.id = st.tag_id WHERE st.story_id = s.id
    ) stags ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(json_agg(json_build_object('id', tp.id, 'slug', tp.slug, 'name', tp.name) ORDER BY tp.slug), '[]'::json) AS topics
      FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id WHERE stp.story_id = s.id
    ) stopics ON true
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderBy}
    LIMIT $${p.length - 1} OFFSET $${p.length}
  `;

  const { rows } = await db.query(sql, p);
  const items = rows.map(mapStoryBase);
  const next_offset = items.length === params.limit ? params.offset + items.length : null;
  return { items, next_offset };
}

export async function searchLexical(db: Pool, q: string, k: number): Promise<SearchResults> {
  const sql = `
    WITH q AS (SELECT plainto_tsquery('simple', $1) AS tsq)
    SELECT
      s.id, s.source, s.hn_id, s.title, s.url, s.domain, s.author,
      s.points, s.comments_count, s.created_at, s.fetched_at,
      stags.tags, stopics.topics,
      ts_rank_cd(a.tsv, (SELECT tsq FROM q)) AS score
    FROM story_list s
    JOIN story st ON st.id = s.id
    JOIN article a ON a.id = st.article_id
    LEFT JOIN LATERAL (
      SELECT coalesce(json_agg(json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind) ORDER BY t.slug), '[]'::json) AS tags
      FROM story_tag st2 JOIN tag t ON t.id = st2.tag_id WHERE st2.story_id = s.id
    ) stags ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(json_agg(json_build_object('id', tp.id, 'slug', tp.slug, 'name', tp.name) ORDER BY tp.slug), '[]'::json) AS topics
      FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id WHERE stp.story_id = s.id
    ) stopics ON true
    WHERE a.tsv @@ (SELECT tsq FROM q)
    ORDER BY score DESC, s.created_at DESC
    LIMIT $2
  `;
  const { rows } = await db.query(sql, [q, k]);
  return {
    items: rows.map((r: any) => ({ story: mapStoryBase(r), score: r.score, match: "lexical" as const })),
  };
}

