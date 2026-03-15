import { VehicleType } from '@/../lib/db/types';
import {
  redis,
  DRIVER_POST_PREFIX,
  RIDER_POST_PREFIX,
  AREA_DRIVERS_PREFIX,
  AREA_RIDERS_PREFIX,
} from './redis';

export type PostStatus = 'active' | 'matched' | 'expired';

export interface DriverPost {
  id: string;
  driver_id: string;
  area: string;
  vehicle_type: VehicleType;
  seat_capacity: number;
  price_range_min: number;
  price_range_max: number;
  time_window: number;
  message?: string;
  status: PostStatus;
  created_at: string;
  expires_at: string;
}

export interface RiderPost {
  id: string;
  rider_id: string;
  pickup_area: string;
  dropoff_area: string;
  vehicle_type_requested: VehicleType;
  seat_count: number;
  price_range_min: number;
  price_range_max: number;
  time_window: number;
  message?: string;
  status: PostStatus;
  matched_driver_post_id?: string;
  created_at: string;
  expires_at: string;
}

export interface MatchResult {
  matched: boolean;
  driver_post?: DriverPost;
  rider_post?: RiderPost;
}

function priceRangesOverlap(
  driverMin: number,
  driverMax: number,
  riderMin: number,
  riderMax: number
): boolean {
  return driverMin <= riderMax && riderMin <= driverMax;
}

export async function saveDriverPost(post: DriverPost): Promise<void> {
  const ttlSeconds = post.time_window * 60;
  await redis.set(`${DRIVER_POST_PREFIX}${post.id}`, post, { ex: ttlSeconds });
  const expiryScore = Date.parse(post.expires_at) / 1000;
  await redis.zadd(`${AREA_DRIVERS_PREFIX}${post.area}`, {
    score: expiryScore,
    member: post.id,
  });
}

export async function saveRiderPost(post: RiderPost): Promise<void> {
  const ttlSeconds = post.time_window * 60;
  await redis.set(`${RIDER_POST_PREFIX}${post.id}`, post, { ex: ttlSeconds });
  const expiryScore = Date.parse(post.expires_at) / 1000;
  await redis.zadd(`${AREA_RIDERS_PREFIX}${post.pickup_area}`, {
    score: expiryScore,
    member: post.id,
  });
}

export async function getDriverPost(id: string): Promise<DriverPost | null> {
  return redis.get<DriverPost>(`${DRIVER_POST_PREFIX}${id}`);
}

export async function getRiderPost(id: string): Promise<RiderPost | null> {
  return redis.get<RiderPost>(`${RIDER_POST_PREFIX}${id}`);
}

export async function getActiveDriverPosts(
  area: string,
  priceMin?: number,
  priceMax?: number
): Promise<DriverPost[]> {
  const nowScore = Math.floor(Date.now() / 1000);
  await redis.zremrangebyscore(`${AREA_DRIVERS_PREFIX}${area}`, 0, nowScore);
  const ids = await redis.zrange(`${AREA_DRIVERS_PREFIX}${area}`, 0, -1);
  if (!ids.length) return [];
  const posts = await Promise.all(ids.map((id) => getDriverPost(id as string)));
  return posts.filter((p): p is DriverPost => {
    if (!p || p.status !== 'active') return false;
    if (priceMin !== undefined && p.price_range_max < priceMin) return false;
    if (priceMax !== undefined && p.price_range_min > priceMax) return false;
    return true;
  });
}

export async function getActiveRiderPosts(
  area: string,
  priceMin?: number,
  priceMax?: number
): Promise<RiderPost[]> {
  const nowScore = Math.floor(Date.now() / 1000);
  await redis.zremrangebyscore(`${AREA_RIDERS_PREFIX}${area}`, 0, nowScore);
  const ids = await redis.zrange(`${AREA_RIDERS_PREFIX}${area}`, 0, -1);
  if (!ids.length) return [];
  const posts = await Promise.all(ids.map((id) => getRiderPost(id as string)));
  return posts.filter((p): p is RiderPost => {
    if (!p || p.status !== 'active') return false;
    if (priceMin !== undefined && p.price_range_max < priceMin) return false;
    if (priceMax !== undefined && p.price_range_min > priceMax) return false;
    return true;
  });
}

export async function matchRiderToDriver(riderPost: RiderPost): Promise<MatchResult> {
  const drivers = await getActiveDriverPosts(riderPost.pickup_area);
  for (const driver of drivers) {
    const compatible =
      driver.vehicle_type === riderPost.vehicle_type_requested &&
      driver.seat_capacity >= riderPost.seat_count &&
      priceRangesOverlap(
        driver.price_range_min,
        driver.price_range_max,
        riderPost.price_range_min,
        riderPost.price_range_max
      );
    if (!compatible) continue;
    const updatedDriver: DriverPost = { ...driver, status: 'matched' };
    const updatedRider: RiderPost = {
      ...riderPost,
      status: 'matched',
      matched_driver_post_id: driver.id,
    };
    const driverTtl = Math.max(1, Math.floor((Date.parse(driver.expires_at) - Date.now()) / 1000));
    const riderTtl = Math.max(1, Math.floor((Date.parse(riderPost.expires_at) - Date.now()) / 1000));
    await redis.set(`${DRIVER_POST_PREFIX}${driver.id}`, updatedDriver, { ex: driverTtl });
    await redis.set(`${RIDER_POST_PREFIX}${riderPost.id}`, updatedRider, { ex: riderTtl });
    return { matched: true, driver_post: updatedDriver, rider_post: updatedRider };
  }
  return { matched: false };
}
