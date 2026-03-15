import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

// Dispute timer key prefix and window (Agent 10)
export const DISPUTE_TIMER_PREFIX = 'dispute:timer:';
export const DISPUTE_WINDOW_SECONDS = 45 * 60; // 45 minutes
