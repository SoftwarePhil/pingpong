import { ENV_PREFIX, getRedisClient } from './data';

/**
 * Counts an attempt against `key` and says whether it's within `limit` per
 * `windowSeconds`. The window starts at the first attempt (fixed window).
 */
export async function allowAttempt(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redis = await getRedisClient();
  const redisKey = `${ENV_PREFIX}:pingpong:ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSeconds);
  return count <= limit;
}
