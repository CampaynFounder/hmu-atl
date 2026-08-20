import { notifyUser } from '@/lib/ably/server';
import { sendPushToUser, type PushMessage } from '@/lib/push/send';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Run best-effort notify/push work AFTER the response without dropping it. On
// Cloudflare Workers an un-awaited promise is killed when the isolate is torn
// down after responding, so `x(...).catch(()=>{})` right before `return` never
// actually completes — the push never reaches Expo. Wrap those calls in
// deferPush() so ctx.waitUntil keeps the isolate alive until they finish.
export function deferPush(job: Promise<unknown>): void {
  const guarded = Promise.resolve(job).catch((e) => console.error('[deferPush]', e));
  try {
    getCloudflareContext().ctx.waitUntil(guarded);
  } catch {
    // Local/dev (no CF context) — just let it run.
    void guarded;
  }
}

// Fire an in-app Ably event AND an OS-level push in one call. Pass `push` only
// for events worth waking a backgrounded device for (ride accepted, driver
// arrived, cancellation, a new request a driver must answer) — not for chatty
// updates like add-on/address tweaks. Both legs are best-effort and independent:
// a push failure never blocks the realtime event, and vice versa.
export async function notifyUserWithPush(
  userId: string,
  event: string,
  data: unknown,
  push?: PushMessage,
): Promise<void> {
  await notifyUser(userId, event, data);
  if (push) await sendPushToUser(userId, push);
}
