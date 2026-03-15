import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/src/lib/redis';

// 120 requests per minute per admin user
export const adminRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '1 m'),
  prefix: 'rl:admin',
});
