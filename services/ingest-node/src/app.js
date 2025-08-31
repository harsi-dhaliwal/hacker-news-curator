const express = require("express");
const routes = require("./routes");
const { startHNPoller } = require("./poller/hnPoller");
const { initQueue, getRedis } = require("./queue");
const { initDB, query } = require("./db");
const config = require("./config");
const { createLogger } = require("./utils/logger");
const log = createLogger("startup");

const app = express();
app.use(express.json());

// Mount routes
app.use(routes);

async function initApp() {
  // Validate env
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.redisUrl) missing.push("REDIS_URL");
  if (missing.length) {
    missing.forEach((key) => log.error("missing env", { key }));
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  log.info("config", {
    logLevel: config.logLevel,
    pollIntervalSec: config.pollIntervalSec,
    databaseUrlSet: Boolean(config.databaseUrl),
    redisUrlSet: Boolean(config.redisUrl),
  });

  // Init clients
  initDB(config.databaseUrl, log);
  initQueue(config.redisUrl, log);

  // Connectivity checks
  try {
    const pong = await getRedis().ping();
    log.info("redis ping ok", { pong });
  } catch (e) {
    log.error("redis connection failed", { error: e.message });
    throw e;
  }

  try {
    await query("SELECT 1");
    log.info("postgres ok");
  } catch (e) {
    log.error("postgres connection failed", { error: e.message });
    throw e;
  }

  // Start background poller only after dependencies are ready
  startHNPoller();
}

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error("unhandled error", { error: err?.message, path: req.path });
  res.status(500).json({ error: "internal_error" });
});

module.exports = app;
module.exports.initApp = initApp;
