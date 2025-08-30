const { query } = require("../db");

async function healthz(req, res) {
  try {
    if (process.env.DATABASE_URL) {
      await query("SELECT 1");
    }
    res.json({ status: "ok", service: "ingest-node", time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error", error: "db_unreachable" });
  }
}

module.exports = { healthz };

