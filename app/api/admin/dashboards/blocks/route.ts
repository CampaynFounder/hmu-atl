// /api/admin/dashboards/blocks
//
// Returns the block registry as builder-friendly metadata. Used by the
// dashboard builder form to populate the "add block" picker. Super only —
// no need to expose the registry shape to non-builders.

import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { listBlocks, blockMetadata } from '@/lib/admin/dashboards/blocks/registry';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });

  return NextResponse.json({
    blocks: listBlocks().map(blockMetadata),
  });
}
