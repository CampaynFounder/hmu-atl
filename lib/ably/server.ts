function getAblyApiKey(): string {
  return process.env.ABLY_API_KEY || '';
}

export async function publishToChannel(
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  const apiKey = getAblyApiKey();
  if (!apiKey) {
    console.warn('Ably not configured — skipping publish');
    return;
  }

  const [keyId, keySecret] = apiKey.split(':');
  const authHeader = btoa(`${keyId}:${keySecret}`);

  const res = await fetch(`https://rest.ably.io/channels/${encodeURIComponent(channel)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authHeader}`,
    },
    body: JSON.stringify({ name: event, data }),
  });

  if (!res.ok) {
    console.error(`Ably publish failed for ${channel}:${event}:`, await res.text());
  }
}

export async function publishRideUpdate(
  rideId: string,
  event: string,
  data: unknown
): Promise<void> {
  await publishToChannel(`ride:${rideId}`, event, data);
}

export async function notifyUser(
  userId: string,
  event: string,
  data: unknown
): Promise<void> {
  await publishToChannel(`user:${userId}:notify`, event, data);
}

export async function publishAdminEvent(
  event: string,
  data: unknown
): Promise<void> {
  await publishToChannel('admin:feed', event, data);
}

/**
 * Symmetric ride transition broadcast — the structural guarantee that BOTH
 * parties progress in parallel. Fans out to:
 *   - `ride:{rideId}`          (live ride channel both clients subscribe to)
 *   - `user:{riderId}:notify`  (rider's personal push channel)
 *   - `user:{driverId}:notify` (driver's personal push channel)
 *   - `admin:feed`             (ops monitoring)
 *
 * Use this for every state transition / cross-party signal instead of
 * hand-picking which side to notify. A transition routed through here CANNOT
 * reach only one party — which is exactly the asymmetry class that previously
 * crept in (e.g. COO notifying only the driver). The personal-notify payload
 * carries `rideId` + `status` so a backgrounded app can route to the ride.
 *
 * `notify` defaults to both parties; pass a subset only when a signal is
 * genuinely one-directional (rare). Every channel is best-effort (`.catch`) so
 * one slow channel never blocks the transition — Neon remains the source of
 * truth per the realtime contract.
 */
export async function publishRideTransition(
  ride: { rideId: string; riderId: string | null; driverId: string | null },
  event: string,
  data: Record<string, unknown>,
  opts: { notify?: RideParty[]; admin?: boolean } = {}
): Promise<void> {
  const { rideId, riderId, driverId } = ride;
  const notify = opts.notify ?? ['rider', 'driver'];
  const notifyPayload = { rideId, ...data };

  const jobs: Promise<void>[] = [
    publishRideUpdate(rideId, event, data).catch((e) =>
      console.error(`publishRideTransition ride:${rideId} ${event} failed:`, e)
    ),
  ];
  if (notify.includes('rider') && riderId) {
    jobs.push(notifyUser(riderId, event, notifyPayload).catch(() => {}));
  }
  if (notify.includes('driver') && driverId) {
    jobs.push(notifyUser(driverId, event, notifyPayload).catch(() => {}));
  }
  if (opts.admin !== false) {
    jobs.push(publishAdminEvent(event, notifyPayload).catch(() => {}));
  }
  await Promise.all(jobs);
}

type RideParty = 'rider' | 'driver';

// Check whether a given clientId is currently in presence on a channel via Ably REST.
// Returns false if Ably is not configured (degrade open in dev where keys may be absent).
export async function isClientInPresence(channel: string, clientId: string): Promise<boolean> {
  const apiKey = getAblyApiKey();
  if (!apiKey) return false;

  const [keyId, keySecret] = apiKey.split(':');
  const authHeader = btoa(`${keyId}:${keySecret}`);

  const res = await fetch(
    `https://rest.ably.io/channels/${encodeURIComponent(channel)}/presence?clientId=${encodeURIComponent(clientId)}&limit=1`,
    {
      method: 'GET',
      headers: { 'Authorization': `Basic ${authHeader}` },
    },
  );
  if (!res.ok) {
    console.error(`Ably presence check failed for ${channel}/${clientId}:`, await res.text());
    return false;
  }
  const members = await res.json() as Array<{ clientId?: string }>;
  return Array.isArray(members) && members.some((m) => m.clientId === clientId);
}
