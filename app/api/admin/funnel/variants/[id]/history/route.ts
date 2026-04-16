import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

// GET: Version history for a variant
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id: variantId } = await params;

  const versions = await sql`
    SELECT cv.*, u.clerk_id as created_by_clerk
    FROM content_versions cv
    LEFT JOIN users u ON u.id = cv.created_by
    WHERE cv.variant_id = ${variantId}
    ORDER BY cv.version_number DESC
  `;

  return NextResponse.json({ versions });
}
