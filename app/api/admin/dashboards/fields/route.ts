// /api/admin/dashboards/fields
//
// Returns the field registry as builder-friendly metadata. Used by the
// dashboard builder form to populate the searchable field palette. Super
// only — no need to expose the registry shape to non-builders.
//
// Includes the category order so the UI can group consistently.

import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import {
  listFieldMetadata,
  FIELD_CATEGORY_ORDER,
} from '@/lib/admin/dashboards/fields/registry';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.view')) {
    return NextResponse.json({ error: 'admin.dashboards.view required' }, { status: 403 });
  }

  return NextResponse.json({
    fields: listFieldMetadata(),
    categories: FIELD_CATEGORY_ORDER,
  });
}
