import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// POST: Rollback a variant to a specific version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id: variantId } = await params;
  const body = await request.json();
  const { version_number } = body;

  if (!version_number) {
    return NextResponse.json({ error: 'version_number required' }, { status: 400 });
  }

  // Find the version to rollback to
  const versions = await sql`
    SELECT content, status FROM content_versions
    WHERE variant_id = ${variantId} AND version_number = ${version_number}
  `;

  if (versions.length === 0) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const targetVersion = versions[0];

  // Update variant content
  await sql`
    UPDATE content_variants
    SET content = ${JSON.stringify(targetVersion.content)},
        updated_by = ${admin.id},
        updated_at = NOW()
    WHERE id = ${variantId}
  `;

  // Create a new version marking the rollback
  const maxRows = await sql`
    SELECT COALESCE(MAX(version_number), 0) as max_ver
    FROM content_versions WHERE variant_id = ${variantId}
  `;
  const nextVersion = (maxRows[0].max_ver as number) + 1;

  await sql`
    INSERT INTO content_versions (variant_id, version_number, content, status, change_summary, created_by)
    VALUES (${variantId}, ${nextVersion}, ${JSON.stringify(targetVersion.content)}, ${targetVersion.status}, ${`Rollback to version ${version_number}`}, ${admin.id})
  `;

  await logAdminAction(admin.id, 'cms_variant_rollback', 'content_variant', variantId, {
    from_version: nextVersion - 1,
    to_version: version_number,
    new_version: nextVersion,
  });

  return NextResponse.json({ ok: true, new_version: nextVersion });
}
