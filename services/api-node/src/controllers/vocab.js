const { query } = require("../db");

async function listTags(req, res, next) {
  try {
    const { rows } = await query(`SELECT id, slug, name, kind FROM tag ORDER BY slug`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listTopics(req, res, next) {
  try {
    const { rows } = await query(`SELECT id, slug, name FROM topic ORDER BY slug`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listTags, listTopics };

