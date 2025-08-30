import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    client = new Redis(url);
  }
  return client;
}

