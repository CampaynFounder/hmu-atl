import Ably from 'ably';

let _client: Ably.Rest | null = null;

function getAblyClient(): Ably.Rest {
  if (!_client) {
    _client = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  }
  return _client;
}

export async function publishDriverPresence(
  area: string,
  driverId: string,
  postId: string,
  event: 'enter' | 'leave',
  data?: Record<string, unknown>
) {
  const client = getAblyClient();
  const channel = client.channels.get(`hmu:area:${area}`);
  await channel.publish(`driver:${event}`, {
    driver_id: driverId,
    post_id: postId,
    area,
    ...data,
  });
}

export async function publishMatch(
  area: string,
  driverPostId: string,
  riderPostId: string,
  driverId: string,
  riderId: string
) {
  const client = getAblyClient();
  const channel = client.channels.get(`hmu:area:${area}`);
  await channel.publish('match:made', {
    driver_post_id: driverPostId,
    rider_post_id: riderPostId,
    driver_id: driverId,
    rider_id: riderId,
    area,
  });
}
