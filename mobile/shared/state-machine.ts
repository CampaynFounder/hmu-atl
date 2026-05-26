// Pure ride state machine — no server dependencies.

export type RideStatus =
  | 'matched' | 'otw' | 'here' | 'confirming'
  | 'active' | 'ended' | 'completed' | 'disputed'
  | 'cancelled' | 'refunded';

const VALID_TRANSITIONS: Record<string, string[]> = {
  matched: ['otw', 'cancelled'],
  otw: ['here', 'cancelled'],
  here: ['confirming', 'ended', 'cancelled'],
  confirming: ['active', 'here', 'ended', 'cancelled'],
  active: ['ended'],
  ended: ['completed', 'disputed'],
  disputed: ['completed', 'refunded'],
};

export function validateTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return !!(allowed && allowed.includes(to));
}

export function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    matched: 'Matched with driver',
    otw: 'Driver is on the way',
    here: 'Driver has arrived',
    confirming: 'Confirming ride start',
    active: 'Ride in progress',
    ended: 'Ride ended',
    completed: 'Ride completed',
    disputed: 'Under review',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };
  return messages[status] ?? status;
}

export function isActiveRide(status: string): boolean {
  return ['otw', 'here', 'confirming', 'active'].includes(status);
}
