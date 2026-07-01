// Cross a matched blast onto the canonical ride realtime rails.
//
// The blast lifecycle publishes on a parallel `blast:{blastId}` board channel
// plus driver-only `user:{driverId}:notify` events. At the moment a blast
// becomes a real `rides` row (select + pull-up), it must ALSO publish the two
// rails the rest of the ride lifecycle — and the mobile app — depend on, exactly
// the way direct booking does:
//
//   1. ride:{rideId} `status_change` {status:'matched'} — contract parity with
//      direct booking (mirrors app/api/rides/[id]/otw|here|start). Reaches any
//      client already subscribed to the ride channel.
//   2. user:{riderId}:notify `ride_update` {rideId,status:'matched'} + an OS push
//      — the rider's APP-WIDE rail. Without it, a rider who navigated away from
//      the offer board never learns the match happened: their ActiveRideBar
//      stays dark and /rides/active is never reconciled. On mobile the in-app
//      leg drives refreshActiveRide(); the push wakes a backgrounded/closed
//      device (past the 2m Ably rewind window) and `routeFromPush`'s `ride_update`
//      case taps straight into the active ride. This mirrors direct booking,
//      which pushes `booking_accepted` at the equivalent moment. `rideId` is
//      camelCase to match every direct ride route's ride_update payload.
//
// `riderId` MUST be the Neon users.id (the notify channel is keyed on the DB id,
// never the Clerk id).
//
// Callers MUST await this: Cloudflare Workers kill unawaited promises once the
// response returns (the same reason the blast loser FOMO SMS is awaited).
// Promise.allSettled so one rail failing never blocks the other or the response.

import { publishRideUpdate } from '@/lib/ably/server';
import { notifyUserWithPush } from '@/lib/notify';

export async function publishRideMatched(rideId: string, riderId: string): Promise<void> {
  await Promise.allSettled([
    publishRideUpdate(rideId, 'status_change', { status: 'matched' }),
    notifyUserWithPush(
      riderId,
      'ride_update',
      { rideId, status: 'matched' },
      {
        title: "You're matched! 🚗",
        body: "Your driver's locked in — tap to open your ride.",
        data: { type: 'ride_update', rideId, status: 'matched' },
      },
    ),
  ]);
}
