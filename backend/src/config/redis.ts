import Redis from 'ioredis';
import { config } from './index.js';

// Check if Redis URL is valid (not internal Railway URL when running outside Railway)
const isValidRedisUrl = config.redisUrl &&
  !config.redisUrl.includes('.railway.internal') &&
  config.redisUrl !== 'redis://localhost:6379';

// Create a mock Redis client for when Redis is not available
class MockRedis {
  async get() { return null; }
  async set() { return 'OK'; }
  async del() { return 1; }
  async setex() { return 'OK'; }
  async expire() { return 1; }
  async quit() { return 'OK'; }
  on() { return this; }
}

export const redis: Redis | MockRedis = isValidRedisUrl
  ? new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    })
  : new MockRedis();

if (isValidRedisUrl && redis instanceof Redis) {
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected');
  });
} else {
  console.log('Redis not configured - using in-memory fallback');
}
