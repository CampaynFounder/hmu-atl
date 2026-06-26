// RIDE STAGE PARITY CONTRACT — single source of truth for "both sides progress
// in parallel". For every stage of a direct ride, this declares:
//   - which Ably events BOTH the rider and the driver must receive, and
//   - what realtime surface each side must be able to see about the other party.
//
// Routes publish through `publishRideTransition` (lib/ably/server.ts), which
// reads nothing from here directly — but this file is the spec that the parity
// test (lib/rides/__tests__/stage-parity.test.ts) asserts against, and the
// reference any new transition route must satisfy. If you add a stage or a
// transition, add it here first, then make the route + both clients match.
//
// WHY THIS EXISTS: asymmetries (e.g. COO notifying only the driver) crept in
// because each route hand-rolled its publishes with no shared definition of
// "done". This contract makes parallel-notification a checked invariant, not a
// per-route judgement call.

export type RideParty = 'rider' | 'driver';

/**
 * A logical stage of the direct-ride flow. Note `inbound` is NOT a DB status —
 * it's `status='matched'` with `coo_at` set (the rider has pulled up and the
 * driver is heading over). We model it as its own stage because the surface
 * area and notifications differ from pre-COO `matched`.
 */
export type RideStage =
  | 'matched'      // driver accepted, rider has NOT pulled up yet
  | 'inbound'      // rider pulled up (COO) — driver en route, both see live map
  | 'otw'          // driver tapped OTW
  | 'here'         // driver arrived
  | 'confirming'   // driver tapped Start Ride, rider must tap "I'm In"
  | 'active'       // ride underway
  | 'ended';       // ride closed

export interface StageContract {
  stage: RideStage;
  /** Who triggers the transition INTO this stage. */
  triggeredBy: RideParty;
  /** Ably event name broadcast on `ride:{id}` for this transition. */
  rideEvent: string;
  /**
   * Parties that MUST receive a `user:{id}:notify` push for this transition.
   * This is the parallel-notification guarantee: a stage that lists both
   * parties cannot ship having notified only one. The triggering party is
   * included because their other devices/surfaces must stay in sync too.
   */
  notifies: RideParty[];
  /** What the RIDER must be able to see about the driver at this stage. */
  riderSurface: string[];
  /** What the DRIVER must be able to see about the rider at this stage. */
  driverSurface: string[];
}

export const STAGE_CONTRACT: Record<RideStage, StageContract> = {
  matched: {
    stage: 'matched',
    triggeredBy: 'driver',
    rideEvent: 'status_change',
    notifies: ['rider', 'driver'],
    riderSurface: ['driver identity', 'agreed price', 'route'],
    driverSurface: ['rider identity', 'agreed price', 'route'],
  },
  inbound: {
    stage: 'inbound',
    triggeredBy: 'rider',
    rideEvent: 'coo',
    notifies: ['rider', 'driver'],
    riderSurface: ['live driver location', 'driver ETA to pickup', 'payment authorized'],
    driverSurface: ['rider pickup location', 'rider live location + ETA (when shared)', 'payment ready'],
  },
  otw: {
    stage: 'otw',
    triggeredBy: 'driver',
    rideEvent: 'status_change',
    notifies: ['rider', 'driver'],
    riderSurface: ['live driver location', 'driver ETA to pickup'],
    driverSurface: ['rider pickup location', 'navigation to pickup'],
  },
  here: {
    stage: 'here',
    triggeredBy: 'driver',
    rideEvent: 'status_change',
    notifies: ['rider', 'driver'],
    riderSurface: ['driver is HERE', 'live driver location', 'wait timer'],
    driverSurface: ['rider pickup location', 'wait timer'],
  },
  confirming: {
    stage: 'confirming',
    triggeredBy: 'driver',
    rideEvent: 'confirm_start',
    notifies: ['rider', 'driver'],
    riderSurface: ["I'm In — Pay $X prompt", 'confirm deadline'],
    driverSurface: ['rider confirming status'],
  },
  active: {
    stage: 'active',
    triggeredBy: 'rider',
    rideEvent: 'status_change',
    notifies: ['rider', 'driver'],
    riderSurface: ['live driver location', 'ETA to dropoff'],
    driverSurface: ['route to dropoff', 'navigation'],
  },
  ended: {
    stage: 'ended',
    triggeredBy: 'driver',
    rideEvent: 'status_change',
    notifies: ['rider', 'driver'],
    riderSurface: ['fare breakdown', 'rate driver'],
    driverSurface: ['payout', 'rate rider'],
  },
};

/** Resolve the logical stage from the DB status + whether COO has been sent. */
export function resolveStage(status: string, cooSent: boolean): RideStage | null {
  if (status === 'matched') return cooSent ? 'inbound' : 'matched';
  if (status === 'otw') return 'otw';
  if (status === 'here') return 'here';
  if (status === 'confirming') return 'confirming';
  if (status === 'active' || status === 'in_progress') return 'active';
  if (status === 'ended' || status === 'completed') return 'ended';
  return null;
}

/**
 * True once the rider has pulled up — i.e. both sides should be showing the
 * live map with the other party's position/ETA. Shared by the surface-area
 * gating on both clients (see mobile/components/ride/ride-status.ts) so the two
 * sides cannot drift on when tracking turns on.
 */
export function isInboundOrLater(status: string, cooSent: boolean): boolean {
  if (cooSent && status === 'matched') return true;
  return ['otw', 'here', 'confirming', 'active', 'in_progress'].includes(status);
}
