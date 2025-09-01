const config = {
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  pollIntervalSec: parseInt(process.env.HN_POLL_INTERVAL_SEC || "0", 10),
  logLevel: process.env.LOG_LEVEL || "info",
  // Queue names to match scraper-py expectations
  ingestOutQueue: process.env.INGEST_OUT_QUEUE || "ingest:out",
  summarizerInQueue: process.env.SUMMARIZER_IN_QUEUE || "summarizer:in",
  retryQueue: process.env.RETRY_QUEUE || "ingest:retry",
  dlq: process.env.DLQ || "ingest:dlq",
};

module.exports = config;
