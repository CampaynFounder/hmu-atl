const ABLY_API_KEY = process.env.ABLY_API_KEY || '';

export async function publishToChannel(
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  if (!ABLY_API_KEY) {
    console.warn('Ably not configured — skipping publish');
    return;
  }

  const [keyId, keySecret] = ABLY_API_KEY.split(':');
  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

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
