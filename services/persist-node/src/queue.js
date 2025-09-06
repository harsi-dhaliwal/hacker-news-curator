import Redis from 'ioredis';

let redis = null;

export function initQueue(redisUrl) {
  if (!redisUrl) throw new Error('REDIS_URL is required');
  redis = new Redis(redisUrl);
  redis.on('connect', () => console.log(JSON.stringify({ level: 'info', component: 'queue', msg: 'redis connected' })));
  redis.on('error', (err) => console.error(JSON.stringify({ level: 'error', component: 'queue', msg: 'redis error', meta: { error: err.message } })));
  return redis;
}

export function getRedis() {
  if (!redis) throw new Error('queue not initialized');
  return redis;
}

export async function popOne(queue) {
  // Non-blocking pop from right (matches lpush writer)
  return await getRedis().rpop(queue);
}

export async function peekTail(queue) {
  // Read last element without removal
  return await getRedis().lindex(queue, -1);
}
