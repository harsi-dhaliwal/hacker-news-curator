const config = {
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  pollIntervalSec: parseInt(process.env.HN_POLL_INTERVAL_SEC || "0", 10),
  logLevel: process.env.LOG_LEVEL || "info",
};

module.exports = config;

