const Redis = require("ioredis");
const config = require("../config");

const redis = new Redis(config.redisUrl);

async function enqueue(queueName, payload, jobKey) {
  const keySet = `jobs:published`;
  let shouldPublish = true;
  if (jobKey) {
    const added = await redis.sadd(keySet, jobKey);
    shouldPublish = added === 1;
  }
  if (shouldPublish) {
    await redis.lpush(`queue:${queueName}`, JSON.stringify(payload));
  }
  return shouldPublish;
}

module.exports = { redis, enqueue };

