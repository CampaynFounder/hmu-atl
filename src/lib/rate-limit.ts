import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// Dispute routes: 10 requests per 60 seconds per user (Agent 10)
export const disputeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  analytics: true,
  prefix: 'rl:disputes',
});
