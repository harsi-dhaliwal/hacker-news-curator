import { Pool } from 'pg';

let pool = null;

export function initDB(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  pool = new Pool({ connectionString, max: 10 });
  pool.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', component: 'db', msg: 'pool error', meta: { error: err.message } }));
  });
  return pool;
}

export function getPool() {
  if (!pool) throw new Error('db not initialized');
  return pool;
}

export async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function upsertTagSlug(slug, name, kind = 'tech') {
  const sql = `
    INSERT INTO tag(slug, name, kind)
    VALUES ($1, $2, $3)
    ON CONFLICT (slug) DO UPDATE SET name = COALESCE(tag.name, EXCLUDED.name)
    RETURNING id
  `;
  const { rows } = await query(sql, [slug, name || slug, kind]);
  return rows[0].id;
}

export async function upsertTopicSlug(slug, name) {
  const sql = `
    INSERT INTO topic(slug, name)
    VALUES ($1, $2)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  const res = await query(sql, [slug, name || slug]);
  if (res.rows[0]?.id) return res.rows[0].id;
  const r2 = await query('SELECT id FROM topic WHERE slug = $1', [slug]);
  return r2.rows[0]?.id || null;
}

export async function linkStoryTag(storyId, tagId) {
  await query(
    'INSERT INTO story_tag(story_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [storyId, tagId]
  );
}

export async function linkStoryTopic(storyId, topicId) {
  await query(
    'INSERT INTO story_topic(story_id, topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [storyId, topicId]
  );
}

export async function insertSummary(articleId, model, lang, summary) {
  // Idempotent-ish insert: avoid exact duplicates
  const sql = `
    INSERT INTO summary(article_id, model, lang, summary)
    SELECT $1, $2, $3, $4
    WHERE NOT EXISTS (
      SELECT 1 FROM summary WHERE article_id=$1 AND model=$2 AND lang=$3 AND summary=$4
    )
    RETURNING id
  `;
  const res = await query(sql, [articleId, model, lang, summary]);
  return res.rows[0]?.id || null;
}

