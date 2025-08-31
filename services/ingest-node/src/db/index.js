const { Pool } = require("pg");
const { createLogger } = require("../utils/logger");

let pool = null;
let log = createLogger("db");

function initDB(connectionString, logger = log) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  log = logger.child ? logger.child("db") : createLogger("db");
  pool = new Pool({
    connectionString,
    max: 10,
  });
  pool.on("error", (err) => {
    log.error("pool error", { error: err.message });
  });
  return pool;
}

function getPool() {
  if (!pool) throw new Error("db not initialized (call initDB first)");
  return pool;
}

async function query(text, params) {
  const client = await getPool().connect();
  try {
    log.debug("query", { text, params: params || null });
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { initDB, getPool, query };
