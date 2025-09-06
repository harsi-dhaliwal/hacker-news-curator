const { Pool } = require("pg");

// This will be set by main.js during startup
let pool = null;

// Function to set the pool (called by main.js)
function setPool(poolInstance) {
  pool = poolInstance;
}

async function query(text, params) {
  if (!pool) {
    throw new Error("Database pool not initialized. Call setPool() first.");
  }

  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Get the current pool instance
function getPool() {
  return pool;
}

module.exports = { pool, query, setPool, getPool };
