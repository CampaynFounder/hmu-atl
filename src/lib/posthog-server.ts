import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getPostHogClient(): PostHog {
  if (!_client) {
    _client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

export function captureEvent(
  userId: string,
  event: string,
  properties: Record<string, unknown>
) {
  const client = getPostHogClient();
  client.capture({ distinctId: userId, event, properties });
}
