/**
 * Server-side Ably Presence helpers.
 *
 * Ably REST does not support native Presence; presence requires a Realtime
 * connection. These helpers publish presence-like events on the area feed
 * channel so that clients can observe driver/rider availability.
 *
 * For true Presence (visible via channel.presence.get()), the client should
 * connect with its own Ably token and call presence.enter() client-side.
 */
import { areaFeedChannel, publishToChannel } from "./client";

export interface PresenceData {
  userId: string;
  postId: string;
  postType: "driver_offering" | "rider_requesting";
  price: number;
  areas: string[];
}

/**
 * Announce availability on each area feed channel.
 * Called when a new HMU post is created.
 */
export async function enterAreaPresence(data: PresenceData): Promise<void> {
  await Promise.all(
    data.areas.map((area) =>
      publishToChannel(areaFeedChannel(area), "presence.enter", data),
    ),
  );
}

/**
 * Announce departure from area feed channels.
 * Called when a post expires, is matched, or is cancelled.
 */
export async function leaveAreaPresence(
  areas: string[],
  postId: string,
  userId: string,
): Promise<void> {
  await Promise.all(
    areas.map((area) =>
      publishToChannel(areaFeedChannel(area), "presence.leave", { postId, userId }),
    ),
  );
}
