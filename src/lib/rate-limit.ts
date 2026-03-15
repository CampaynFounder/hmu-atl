import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// 5 POSTs per 60 seconds per user
export const postRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'rl:post',
});

// 30 GETs per 60 seconds per user
export const feedRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'rl:feed',
});

// Dispute agent rate limit (Agent 10): 10 dispute-related requests per minute
export const disputeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'rl:disputes',
});
