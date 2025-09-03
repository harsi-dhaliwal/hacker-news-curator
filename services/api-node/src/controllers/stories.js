const { query } = require("../db");
const { parseArrayParam, clamp } = require("../utils/params");
const { mapStoryBase } = require("../utils/mappers");
const { TTL, sendCachedJSON } = require("../utils/caching");

async function listStories(req, res, next) {
  try {
    const q = (req.query.q || "").toString().trim();
    const tags = parseArrayParam(req.query.tags);
    const topics = parseArrayParam(req.query.topics);
    const domain = req.query.domain ? req.query.domain.toString().trim() : null;
    const sortParam = req.query.sort ? req.query.sort.toString() : "hot";
    const sort = ["hot", "newest", "points", "comments"].includes(sortParam)
      ? sortParam
      : "hot";
    const limit = clamp(parseInt(req.query.limit || "30", 10), 1, 100);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

    // Improved date validation
    let since = null;
    if (req.query.since) {
      const sinceDate = new Date(req.query.since.toString());
      if (!isNaN(sinceDate.getTime())) {
        since = sinceDate;
      }
    }

    const where = [];
    const params = [];
    let paramIndex = 1;

    if (q) {
      params.push(q);
      where.push(
        `EXISTS (
           SELECT 1 FROM article a
           WHERE a.id = s.article_id AND a.tsv @@ plainto_tsquery('simple', $${paramIndex})
         )`
      );
      paramIndex++;
    }

    if (domain) {
      params.push(domain);
      where.push(`s.domain = $${paramIndex}`);
      paramIndex++;
    }

    if (since) {
      params.push(since.toISOString());
      where.push(`s.created_at >= $${paramIndex}`);
      paramIndex++;
    }

    if (tags.length > 0) {
      params.push(tags);
      where.push(
        `EXISTS (
           SELECT 1 FROM story_tag st
           JOIN tag t ON t.id = st.tag_id
           WHERE st.story_id = s.id AND t.slug = ANY($${paramIndex}::text[])
         )`
      );
      paramIndex++;
    }

    if (topics.length > 0) {
      params.push(topics);
      where.push(
        `EXISTS (
           SELECT 1 FROM story_topic stp
           JOIN topic tp ON tp.id = stp.topic_id
           WHERE stp.story_id = s.id AND tp.slug = ANY($${paramIndex}::text[])
         )`
      );
      paramIndex++;
    }

    // Only include stories that have at least one summary for their article
    where.push(
      `EXISTS (SELECT 1 FROM summary smx WHERE smx.article_id = s.article_id)`
    );

    const orderBy =
      sort === "newest"
        ? "s.created_at DESC"
        : sort === "points"
        ? "s.points DESC NULLS LAST, s.created_at DESC"
        : sort === "comments"
        ? "s.comments_count DESC NULLS LAST, s.created_at DESC"
        : "COALESCE(s.hot_score, 0) DESC, s.created_at DESC";

    // Add limit and offset parameters
    params.push(limit);
    params.push(offset);

    const sql = `
      SELECT
        s.id, s.source, s.hn_id, s.title, s.url, s.domain, s.author,
        s.points, s.comments_count, s.created_at, s.fetched_at,
        stags.tags, stopics.topics,
        ssum.summary_snippet
      FROM story_list s
      LEFT JOIN LATERAL (
        SELECT coalesce(json_agg(json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind) ORDER BY t.slug), '[]'::json) AS tags
        FROM story_tag st JOIN tag t ON t.id = st.tag_id
        WHERE st.story_id = s.id
      ) stags ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(json_agg(json_build_object('id', tp.id, 'slug', tp.slug, 'name', tp.name) ORDER BY tp.slug), '[]'::json) AS topics
        FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id
        WHERE stp.story_id = s.id
      ) stopics ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(sm.ui_json ->> 'summary_140', LEFT(sm.summary, 160)) AS summary_snippet,
          sm.ui_json -> 'quicktake' AS summary_quicktake,
          NULLIF(sm.ui_json ->> 'reading_time_min', '')::int AS reading_time_min,
          NULLIF(sm.ui_json ->> 'impact_score', '')::int AS impact_score,
          NULLIF(sm.ui_json ->> 'confidence', '')::float AS confidence,
          NULLIF(sm.ui_json -> 'link_props' ->> 'paywall', '')::boolean AS paywall,
          sm.ui_json -> 'link_props' ->> 'format' AS link_format,
          NULLIF(sm.ui_json -> 'link_props' ->> 'is_pdf', '')::boolean AS is_pdf,
          sm.classification_json ->> 'type' AS class_type
        FROM summary sm
        WHERE sm.article_id = s.article_id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) ssum ON true
      -- drop expensive summaries array aggregation for list performance
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const { rows } = await query(sql, params);
    const items = rows.map((row) => ({
      ...mapStoryBase(row),
      summary_snippet: row.summary_snippet || undefined,
      summary_quicktake: Array.isArray(row.summary_quicktake) ? row.summary_quicktake : undefined,
      reading_time_min: typeof row.reading_time_min === 'number' ? row.reading_time_min : undefined,
      impact_score: typeof row.impact_score === 'number' ? row.impact_score : undefined,
      confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
      paywall: typeof row.paywall === 'boolean' ? row.paywall : undefined,
      link_format: row.link_format || undefined,
      is_pdf: typeof row.is_pdf === 'boolean' ? row.is_pdf : undefined,
      class_type: row.class_type || undefined,
    }));
    const next_offset = items.length === limit ? offset + items.length : null;
    sendCachedJSON(res, { items, next_offset }, TTL.FEED);
  } catch (err) {
    next(err);
  }
}

async function getStoryById(req, res, next) {
  try {
    const id = req.params.id;
    // Accept UUIDs; basic presence check only
    if (!id || typeof id !== "string" || id.length < 8) {
      return res.status(400).json({ error: "Invalid story ID" });
    }

    const sql = `
      SELECT
        s.id, s.source, s.hn_id, s.title, s.url, s.domain, s.author,
        s.points, s.comments_count, s.created_at, s.fetched_at,
        st.article_id,
        stags.tags, stopics.topics,
        rs.hot_score, rs.decay_ts, rs.click_count, rs.dwell_ms_avg
      FROM story_list s
      JOIN story st ON st.id = s.id
      LEFT JOIN LATERAL (
        SELECT coalesce(json_agg(json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'kind', t.kind) ORDER BY t.slug), '[]'::json) AS tags
        FROM story_tag st2 JOIN tag t ON t.id = st2.tag_id
        WHERE st2.story_id = s.id
      ) stags ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(json_agg(json_build_object('id', tp.id, 'slug', tp.slug, 'name', tp.name) ORDER BY tp.slug), '[]'::json) AS topics
        FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id
        WHERE stp.story_id = s.id
      ) stopics ON true
      LEFT JOIN rank_signals rs ON rs.story_id = s.id
      WHERE s.id = $1
    `;

    const { rows } = await query(sql, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const r = rows[0];

    let article = null;
    if (r.article_id) {
      const ares = await query(
        `SELECT id, language, html, text, word_count, content_hash FROM article WHERE id = $1`,
        [r.article_id]
      );
      if (ares.rows[0]) {
        const a = ares.rows[0];
        article = {
          id: a.id,
          story_id: r.id,
          language: a.language,
          html: a.html,
          text: a.text,
          word_count: a.word_count,
          content_hash: a.content_hash,
        };
      }
    }

    let summaries = [];
    if (r.article_id) {
      const sres = await query(
        `SELECT id, article_id, model, lang, summary, created_at, classification_json, ui_json, summarized_at
         FROM summary WHERE article_id = $1 ORDER BY created_at DESC`,
        [r.article_id]
      );
      summaries = sres.rows.map((s) => ({
        id: s.id,
        story_id: r.id,
        model: s.model,
        lang: s.lang,
        summary: s.summary,
        created_at: s.created_at?.toISOString?.() || s.created_at,
        classification: s.classification_json || undefined,
        ui: s.ui_json || undefined,
        summarized_at: s.summarized_at?.toISOString?.() || s.summarized_at || undefined,
      }));
    }

    const storyBase = mapStoryBase(r);
    const rank_signals =
      r.hot_score == null &&
      r.decay_ts == null &&
      r.click_count == null &&
      r.dwell_ms_avg == null
        ? undefined
        : {
            hot_score: r.hot_score || 0,
            decay_ts: r.decay_ts?.toISOString?.() || r.decay_ts,
            click_count: r.click_count,
            dwell_ms_avg: r.dwell_ms_avg,
          };

    res.json({
      ...storyBase,
      article,
      summaries,
      rank_signals,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listStories, getStoryById };
