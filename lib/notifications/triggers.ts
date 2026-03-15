/**
 * Notification trigger stubs for ride tracking events.
 * Full implementation lives in the notification agent branch.
 * These are called fire-and-forget (non-blocking) from ride routes.
 */

export async function notify_driver_otw(rideId: string): Promise<void> {
  void rideId;
  // Implemented by notification agent — safe to call as no-op during integration
}

export async function notify_driver_here(rideId: string): Promise<void> {
  void rideId;
}

export async function notify_ride_ended(rideId: string): Promise<void> {
  void rideId;
}
