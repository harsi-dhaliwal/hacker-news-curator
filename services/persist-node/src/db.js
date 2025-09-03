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

export async function insertSummary(articleId, model, lang, summary, classification, ui, summarizedAt) {
  // Upsert on unique article_id: keep a single summary per article.
  const sql = `
    INSERT INTO summary(article_id, model, lang, summary, classification_json, ui_json, summarized_at)
    VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::jsonb, $6::jsonb, $7::timestamptz)
    ON CONFLICT (article_id) DO UPDATE SET
      model = EXCLUDED.model,
      lang = EXCLUDED.lang,
      summary = EXCLUDED.summary,
      classification_json = COALESCE(EXCLUDED.classification_json, summary.classification_json),
      ui_json = COALESCE(EXCLUDED.ui_json, summary.ui_json),
      summarized_at = COALESCE(EXCLUDED.summarized_at, summary.summarized_at)
    RETURNING id
  `;
  const { rows } = await query(sql, [
    articleId,
    model,
    lang,
    summary,
    classification ? JSON.stringify(classification) : null,
    ui ? JSON.stringify(ui) : null,
    summarizedAt || null,
  ]);
  return rows[0]?.id || null;
}
