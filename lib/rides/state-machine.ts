import { sql } from '@/lib/db/client';

export type RideStatus = 'matched' | 'otw' | 'here' | 'confirming' | 'active' | 'ended' | 'completed' | 'disputed' | 'cancelled' | 'refunded';

const VALID_TRANSITIONS: Record<string, string[]> = {
  matched: ['otw', 'cancelled'],
  otw: ['here', 'cancelled'],
  here: ['confirming', 'cancelled'],
  confirming: ['active', 'here', 'ended', 'cancelled'],  // active=confirmed, here=timeout/reject, ended=no-show
  active: ['ended'],
  ended: ['completed', 'disputed'],
  disputed: ['completed', 'refunded'],
};

export function validateTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return !!(allowed && allowed.includes(to));
}

export async function getRide(rideId: string) {
  const rows = await sql`SELECT * FROM rides WHERE id = ${rideId} LIMIT 1`;
  if (!rows.length) throw new Error('Ride not found');
  return rows[0] as Record<string, unknown>;
}

// Backwards compat for old routes
export const RideStateMachine = {
  validateTransition,
  transition: async (rideId: string, to: string) => {
    const ride = await getRide(rideId);
    if (!validateTransition(ride.status as string, to)) {
      throw new Error(`Invalid transition: ${ride.status} → ${to}`);
    }
    await sql`UPDATE rides SET status = ${to}, updated_at = NOW() WHERE id = ${rideId}`;
    return { ...ride, status: to };
  },
  getStatusMessage: (status: string) => {
    const messages: Record<string, string> = {
      matched: 'Matched with driver', otw: 'Driver is on the way',
      here: 'Driver has arrived', confirming: 'Confirming ride start',
      active: 'Ride in progress',
      ended: 'Ride ended', completed: 'Ride completed',
      disputed: 'Under review', cancelled: 'Cancelled', refunded: 'Refunded',
    };
    return messages[status] || status;
  },
  isActive: (status: string) => ['otw', 'here', 'confirming', 'active'].includes(status),
};

export async function getRideForUser(rideId: string, userId: string) {
  const rows = await sql`
    SELECT * FROM rides
    WHERE id = ${rideId} AND (driver_id = ${userId} OR rider_id = ${userId})
    LIMIT 1
  `;
  if (!rows.length) throw new Error('Ride not found or unauthorized');
  return rows[0] as Record<string, unknown>;
}
