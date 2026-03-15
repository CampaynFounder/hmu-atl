import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

export const DRIVER_POST_PREFIX = 'post:driver:';
export const RIDER_POST_PREFIX = 'post:rider:';
export const AREA_DRIVERS_PREFIX = 'area:drivers:';
export const AREA_RIDERS_PREFIX = 'area:riders:';

// Dispute agent constants (Agent 10)
export const DISPUTE_TIMER_PREFIX = 'dispute:timer:';
export const DISPUTE_WINDOW_SECONDS = 45 * 60; // 45 minutes
