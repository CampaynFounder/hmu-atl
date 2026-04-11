// Run async work after the response has been sent to the client.
// On Cloudflare Workers this uses ctx.waitUntil() so the runtime keeps the
// isolate alive until the promise resolves. Outside the Worker runtime
// (local dev, tests), it falls back to a detached promise.
//
// Use this for side effects that shouldn't block the HTTP response:
// welcome SMS, third-party analytics, Clerk metadata sync, etc.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export function afterResponse(fn: () => Promise<void>): void {
  try {
    const { ctx } = getCloudflareContext();
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(fn().catch((err) => {
        console.error('[afterResponse] task failed:', err);
      }));
      return;
    }
  } catch {
    // getCloudflareContext throws outside the Worker runtime — fall through.
  }
  // Fallback: detached promise. Works in Node/dev, may be abandoned on Workers.
  void fn().catch((err) => {
    console.error('[afterResponse] task failed (detached):', err);
  });
}
