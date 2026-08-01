// DELETE /api/admin/seed-users/[id] — delete a seed driver/rider.
//
// Hard-deletes the seed `users` row (guarded by is_seed=true). ON DELETE CASCADE
// removes the profile row and every comment where the seed is author OR subject
// (nested replies included via parent_id cascade) + comment_reactions. R2 media
// is best-effort removed after the row is gone.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { getSeedUserMediaUrls, deleteSeedUser } from '@/lib/db/seed-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const R2_PUBLIC_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const { id } = await params;

  // Collect media BEFORE the row (and its profile) is gone.
  const mediaUrls = await getSeedUserMediaUrls(id).catch(() => [] as string[]);

  const deleted = await deleteSeedUser(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Seed user not found' }, { status: 404 });
  }

  // Best-effort R2 cleanup — never block the response on it.
  try {
    const { env } = getCloudflareContext();
    const bucket = (env as Record<string, unknown>).MEDIA_BUCKET as
      | { delete: (key: string) => Promise<unknown> }
      | undefined;
    if (bucket) {
      const keys = mediaUrls
        .filter((u) => u.startsWith(R2_PUBLIC_URL))
        .map((u) => u.slice(R2_PUBLIC_URL.length + 1));
      await Promise.all(keys.map((k) => bucket.delete(k).catch(() => {})));
    }
  } catch { /* ignore — media orphaning is acceptable */ }

  await logAdminAction(admin.id, 'seed_user.delete', 'user', id, { mediaRemoved: mediaUrls.length });
  return NextResponse.json({ ok: true });
}
