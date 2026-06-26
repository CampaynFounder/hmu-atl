import { notifyUser } from '@/lib/ably/server';
import { sendPushToUser, type PushMessage } from '@/lib/push/send';

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
