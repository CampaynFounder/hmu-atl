import { neon } from '@neondatabase/serverless';
import type { Ride, RideStatus, Transaction, TransactionType, TransactionStatus } from './types';

function sql() {
  return neon(process.env.DATABASE_URL!);
}

export async function getRideById(rideId: string): Promise<Ride | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  return (rows[0] as Ride) ?? null;
}

export async function updateRideStatus(
  rideId: string,
  status: RideStatus,
): Promise<Ride> {
  const db = sql();
  const now = new Date().toISOString();

  const timestampField: Record<string, string> = {
    driver_arrived: 'driver_arrived_at',
    in_progress: 'started_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
  };

  const field = timestampField[status];

  let rows;
  if (field === 'driver_arrived_at') {
    rows = await db`
      UPDATE rides
      SET status = ${status}, driver_arrived_at = ${now}, updated_at = ${now}
      WHERE id = ${rideId}
      RETURNING *
    `;
  } else if (field === 'started_at') {
    rows = await db`
      UPDATE rides
      SET status = ${status}, started_at = ${now}, updated_at = ${now}
      WHERE id = ${rideId}
      RETURNING *
    `;
  } else if (field === 'completed_at') {
    rows = await db`
      UPDATE rides
      SET status = ${status}, completed_at = ${now}, updated_at = ${now}
      WHERE id = ${rideId}
      RETURNING *
    `;
  } else {
    rows = await db`
      UPDATE rides
      SET status = ${status}, updated_at = ${now}
      WHERE id = ${rideId}
      RETURNING *
    `;
  }

  return rows[0] as Ride;
}

export async function updateRideCancelled(
  rideId: string,
  cancelledBy: string,
  reason: string
): Promise<Ride> {
  const db = sql();
  const now = new Date();
  const rows = await db`
    UPDATE rides
    SET status = 'cancelled',
        cancelled_at = ${now.toISOString()},
        cancelled_by = ${cancelledBy},
        cancellation_reason = ${reason},
        updated_at = ${now.toISOString()}
    WHERE id = ${rideId}
    RETURNING *
  `;
  return rows[0] as Ride;
}

export async function createTransaction(params: {
  userId: string;
  rideId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
}): Promise<Transaction> {
  const db = sql();
  const now = new Date();
  const rows = await db`
    INSERT INTO transactions (
      id, user_id, ride_id, transaction_type, amount, currency,
      status, description, created_at
    ) VALUES (
      gen_random_uuid(),
      ${params.userId},
      ${params.rideId},
      ${params.type},
      ${params.amount},
      'USD',
      ${params.status},
      ${params.description},
      ${now.toISOString()}
    )
    RETURNING *
  `;
  return rows[0] as Transaction;
}

export interface GpsPoint {
  ride_id: string;
  latitude: number;
  longitude: number;
  recorded_at: Date;
  heading?: number;
  speed_kmh?: number;
}

export async function insertGpsPoint(point: GpsPoint): Promise<void> {
  const db = sql();
  await db`
    INSERT INTO ride_gps_points (
      id, ride_id, latitude, longitude, recorded_at, heading, speed_kmh, created_at
    ) VALUES (
      gen_random_uuid(),
      ${point.ride_id},
      ${point.latitude},
      ${point.longitude},
      ${point.recorded_at.toISOString()},
      ${point.heading ?? null},
      ${point.speed_kmh ?? null},
      NOW()
    )
  `;
}
