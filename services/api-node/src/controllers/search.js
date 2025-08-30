const { query } = require("../db");
const { clamp } = require("../utils/params");
const { mapStoryBase } = require("../utils/mappers");

async function search(req, res, next) {
  try {
    const q = (req.query.q || "").toString().trim();
    const k = clamp(parseInt(req.query.k || "30", 10), 1, 100);
    if (!q) return res.json({ items: [] });

    const { rows } = await query(
      `
      WITH q AS (
        SELECT plainto_tsquery('simple', $1) AS tsq
      )
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
        FROM story_tag st2 JOIN tag t ON t.id = st2.tag_id
        WHERE st2.story_id = s.id
      ) stags ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(json_agg(json_build_object('id', tp.id, 'slug', tp.slug, 'name', tp.name) ORDER BY tp.slug), '[]'::json) AS topics
        FROM story_topic stp JOIN topic tp ON tp.id = stp.topic_id
        WHERE stp.story_id = s.id
      ) stopics ON true
      WHERE a.tsv @@ (SELECT tsq FROM q)
      ORDER BY score DESC, s.created_at DESC
      LIMIT $2
      `,
      [q, k]
    );

    const items = rows.map((r) => ({
      story: mapStoryBase(r),
      score: r.score,
      match: "lexical",
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { search };

