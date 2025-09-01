const Redis = require("ioredis");
const { createLogger } = require("../utils/logger");

let redis = null;
let log = createLogger("queue");

function initQueue(redisUrl, logger = log) {
  if (!redisUrl) throw new Error("REDIS_URL is required");
  log = logger.child ? logger.child("queue") : createLogger("queue");
  redis = new Redis(redisUrl);
  redis.on("connect", () => {
    log.info("redis connected");
  });
  redis.on("error", (err) => {
    log.error("redis error", { error: err.message });
  });
  return redis;
}

function getRedis() {
  if (!redis) throw new Error("queue not initialized (call initQueue first)");
  return redis;
}

async function enqueue(queueName, payload, jobKey) {
  const keySet = `jobs:published`;
  let shouldPublish = true;
  if (jobKey) {
    const added = await getRedis().sadd(keySet, jobKey);
    shouldPublish = added === 1;
  }
  if (shouldPublish) {
    await getRedis().lpush(`queue:${queueName}`, JSON.stringify(payload));
    log.debug(`enqueued ${queueName}`, { jobKey: jobKey || null, payload });
  } else {
    log.debug(`skipped duplicate ${queueName}`, { jobKey });
  }
  return shouldPublish;
}

// New function to enqueue messages in scraper-py compatible format
async function enqueueToScraper(story, attempt = 0) {
  const payload = {
    trace_id: `ingest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    story: {
      id: story.id,
      hn_id: story.hn_id,
      source: story.source,
      title: story.title,
      url: story.url,
      domain: story.domain,
      author: story.author,
      created_at: story.created_at,
    },
    attempt: attempt,
    schema_version: 1,
  };

  await getRedis().lpush("ingest:out", JSON.stringify(payload));
  log.debug("enqueued to scraper", { story_id: story.id, url: story.url });
  return payload.trace_id;
}

module.exports = { initQueue, getRedis, enqueue, enqueueToScraper };
