// /api/admin/dashboards/fields
//
// Returns the field registry as builder-friendly metadata. Used by the
// dashboard builder form to populate the searchable field palette. Super
// only — no need to expose the registry shape to non-builders.
//
// Includes the category order so the UI can group consistently.

import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import {
  listFieldMetadata,
  FIELD_CATEGORY_ORDER,
} from '@/lib/admin/dashboards/fields/registry';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });

  return NextResponse.json({
    fields: listFieldMetadata(),
    categories: FIELD_CATEGORY_ORDER,
  });
}
