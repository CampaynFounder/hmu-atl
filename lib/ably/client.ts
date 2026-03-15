/**
 * Server-side Ably REST client (singleton).
 *
 * Use for publishing messages from API routes.
 * Never import this in client components.
 */
import Ably from "ably";

let restClient: Ably.Rest | null = null;

export function getAblyRest(): Ably.Rest {
  if (!restClient) {
    restClient = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  }
  return restClient;
}

export function rideChannel(rideId: string): string {
  return `ride:${rideId}`;
}

export function areaFeedChannel(areaSlug: string): string {
  return `area:${areaSlug}:feed`;
}

export async function publishToChannel(
  channelName: string,
  event: string,
  data: unknown,
): Promise<void> {
  const rest = getAblyRest();
  const channel = rest.channels.get(channelName);
  await channel.publish(event, data);
}
