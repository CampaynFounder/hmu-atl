import { neon } from '@neondatabase/serverless';
import { sendPush } from './webpush';
import { sendSMS } from './sms';
import { storeNotification } from './store';

const getSQL = () => neon(process.env.DATABASE_URL!);
interface RideParties { riderId: string; driverId: string; }

async function getRideParties(rideId: string): Promise<RideParties> {
  const sql = getSQL();
  const rows = await sql`SELECT rider_id, driver_id FROM rides WHERE id = ${rideId} LIMIT 1`;
  if (!rows.length) throw new Error(`Ride ${rideId} not found`);
  return { riderId: rows[0].rider_id as string, driverId: rows[0].driver_id as string };
}

export async function notify_ride_matched(rideId: string): Promise<void> {
  const { riderId, driverId } = await getRideParties(rideId);
  const riderTitle = "You've been matched! 🚗"; const riderBody = "Your driver is confirmed. They're on the way.";
  const driverTitle = 'New ride matched! 🔥'; const driverBody = "You've been matched with a rider. Head to pickup.";
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'ride_accepted', title: riderTitle, message: riderBody, priority: 'high', relatedEntityType: 'ride', relatedEntityId: rideId }),
    storeNotification({ userId: driverId, notificationType: 'ride_accepted', title: driverTitle, message: driverBody, priority: 'high', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title: riderTitle, body: riderBody, tag: `ride-matched-${rideId}` }),
    sendPush(driverId, { title: driverTitle, body: driverBody, tag: `ride-matched-${rideId}` }),
  ]);
}

export async function notify_driver_otw(rideId: string): Promise<void> {
  const { riderId } = await getRideParties(rideId);
  const title = 'Driver OTW 🚗'; const body = 'Your driver is OTW 🚗';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'ride_accepted', title, message: body, priority: 'high', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title, body, tag: `driver-otw-${rideId}` }),
  ]);
}

export async function notify_driver_here(rideId: string): Promise<void> {
  const { riderId } = await getRideParties(rideId);
  const title = 'Your driver is HERE 📍'; const body = 'Your driver is HERE. Come outside. 👀';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'driver_arrived', title, message: body, priority: 'urgent', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title, body, tag: `driver-here-${rideId}` }),
    sendSMS(riderId, `HMU-ATL: ${body}`),
  ]);
}

export async function notify_ride_ended(rideId: string): Promise<void> {
  const { riderId } = await getRideParties(rideId);
  const title = 'Ride ended ✅'; const body = 'Ride ended — you have 45 mins to dispute. Tap to review.';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'ride_completed', title, message: body, priority: 'normal', relatedEntityType: 'ride', relatedEntityId: rideId, metadata: { escrow_release_minutes: 45 } }),
    sendPush(riderId, { title, body, tag: `ride-ended-${rideId}` }),
  ]);
}

export async function notify_dispute_warning(rideId: string): Promise<void> {
  const { riderId } = await getRideParties(rideId);
  const title = '⚠️ Last chance to dispute'; const body = 'Last chance — 10 mins left to dispute this ride. Tap now.';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'dispute_update', title, message: body, priority: 'high', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title, body, tag: `dispute-warning-${rideId}` }),
  ]);
}

export async function notify_auto_release(rideId: string): Promise<void> {
  const { riderId } = await getRideParties(rideId);
  const title = 'Ride closed 💸'; const body = 'All good — ride closed. Rate your driver.';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'payment_received', title, message: body, priority: 'normal', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title, body, tag: `auto-release-${rideId}` }),
  ]);
}

export async function notify_og_unlocked(userId: string): Promise<void> {
  const title = "You're OG now 🔥"; const body = "You're OG now 🔥 You can see what drivers really think.";
  await Promise.all([
    storeNotification({ userId, notificationType: 'promotion', title, message: body, priority: 'high', relatedEntityType: 'user', relatedEntityId: userId }),
    sendPush(userId, { title, body, tag: `og-unlocked-${userId}` }),
  ]);
}

export async function notify_dispute_filed(rideId: string): Promise<void> {
  const { riderId, driverId } = await getRideParties(rideId);
  const title = 'Dispute filed 🚨'; const body = 'Dispute opened — funds held. Admin will resolve in 24hrs.';
  await Promise.all([
    storeNotification({ userId: riderId, notificationType: 'dispute_update', title, message: body, priority: 'urgent', relatedEntityType: 'ride', relatedEntityId: rideId }),
    storeNotification({ userId: driverId, notificationType: 'dispute_update', title, message: body, priority: 'urgent', relatedEntityType: 'ride', relatedEntityId: rideId }),
    sendPush(riderId, { title, body, tag: `dispute-filed-${rideId}` }),
    sendPush(driverId, { title, body, tag: `dispute-filed-${rideId}` }),
    sendSMS(riderId, `HMU-ATL: ${body}`),
    sendSMS(driverId, `HMU-ATL: ${body}`),
  ]);
}
