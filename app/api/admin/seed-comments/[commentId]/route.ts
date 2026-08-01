// DELETE /api/admin/seed-comments/[commentId] — remove a single seed comment.
// Super-admin only; guarded by is_seed so real comments can't be deleted here.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { deleteSeedComment } from '@/lib/db/seed-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const R2_PUBLIC_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { commentId } = await params;

  const removed = await deleteSeedComment(commentId);
  if (!removed) return NextResponse.json({ error: 'Seed comment not found' }, { status: 404 });

  // Best-effort R2 cleanup of the seed avatar.
  try {
    if (removed.avatar_url && removed.avatar_url.startsWith(R2_PUBLIC_URL)) {
      const { env } = getCloudflareContext();
      const bucket = (env as Record<string, unknown>).MEDIA_BUCKET as
        | { delete: (key: string) => Promise<unknown> } | undefined;
      if (bucket) await bucket.delete(removed.avatar_url.slice(R2_PUBLIC_URL.length + 1)).catch(() => {});
    }
  } catch { /* best-effort */ }

  await logAdminAction(admin.id, 'seed_comment.delete', 'comment', commentId);
  return NextResponse.json({ ok: true });
}
