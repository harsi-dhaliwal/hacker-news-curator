const { query } = require("../db");
const { enqueue } = require("../queue");
const { getDomain } = require("../utils/url");
const { contentHash } = require("../utils/hash");

async function upsertStory({
  source = "hn",
  hn_id = null,
  title,
  url = null,
  author = null,
  created_at = new Date(),
  points = null,
  comments_count = null,
}) {
  const domain = url ? getDomain(url) : null;
  const sql = `
    INSERT INTO story (source, hn_id, title, url, domain, author, points, comments_count, created_at, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
    ON CONFLICT (hn_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      domain = EXCLUDED.domain,
      author = EXCLUDED.author,
      points = COALESCE(EXCLUDED.points, story.points),
      comments_count = COALESCE(EXCLUDED.comments_count, story.comments_count),
      created_at = LEAST(story.created_at, EXCLUDED.created_at),
      fetched_at = now()
    RETURNING id;
  `;
  const { rows } = await query(sql, [
    source,
    hn_id,
    title,
    url,
    domain,
    author,
    points,
    comments_count,
    created_at instanceof Date ? created_at.toISOString() : created_at,
  ]);
  return rows[0].id;
}

async function createArticleForStory({ story_id, text, language = "en" }) {
  const wc = (text || "").split(/\s+/).filter(Boolean).length;
  const hash = contentHash(text);
  const { rows } = await query(
    `INSERT INTO article(language, html, text, word_count, content_hash)
     VALUES ($1, NULL, $2, $3, $4)
     ON CONFLICT (content_hash) DO UPDATE SET language = EXCLUDED.language
     RETURNING id`,
    [language, text, wc, hash]
  );
  const article_id = rows[0].id;
  await query(`UPDATE story SET article_id = $1 WHERE id = $2`, [article_id, story_id]);
  return article_id;
}

async function postIngest(req, res, next) {
  try {
    const body = req.body || {};
    // Accept either an HN item or a generic URL + title
    const story_id = await upsertStory({
      source: body.source || (body.hn_id ? "hn" : "blog"),
      hn_id: body.hn_id ?? null,
      title: body.title,
      url: body.url ?? null,
      author: body.author ?? null,
      created_at: body.created_at ? new Date(body.created_at) : new Date(),
      points: body.points ?? null,
      comments_count: body.comments_count ?? null,
    });

    // If text-only (e.g., Ask HN) and provided, create article now
    let article_id = null;
    if (!body.url && body.text) {
      article_id = await createArticleForStory({ story_id, text: body.text });
      // Enqueue SUMMARIZE + EMBED + TAG
      await enqueue("SUMMARIZE", { job_key: null, story_id, article_id, attempt: 1 });
      await enqueue("EMBED", { job_key: null, story_id, article_id, model_key: "default", attempt: 1 });
      await enqueue("TAG", { job_key: null, story_id, article_id, attempt: 1 });
    }

    // If URL present, enqueue FETCH_ARTICLE for worker
    if (body.url) {
      const job_key = `FETCH_ARTICLE:${story_id}`;
      await enqueue("FETCH_ARTICLE", { job_key, story_id, article_id: null, attempt: 1 }, job_key);
    }

    res.status(202).json({ accepted: true, story_id, article_id });
  } catch (err) {
    next(err);
  }
}

module.exports = { postIngest };

