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
