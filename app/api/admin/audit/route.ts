import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';

// GET: Paginated, filterable audit log
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.audit.view')) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const action = searchParams.get('action') || null;
  const targetType = searchParams.get('target_type') || null;
  const adminId = searchParams.get('admin_id') || null;
  const from = searchParams.get('from') || null;
  const to = searchParams.get('to') || null;

  const rows = await sql`
    SELECT
      al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
      dp.display_name as admin_name, dp.email as admin_email
    FROM admin_audit_log al
    LEFT JOIN users u ON u.id = al.admin_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE 1=1
      ${action ? sql`AND al.action LIKE ${`%${action}%`}` : sql``}
      ${targetType ? sql`AND al.target_type = ${targetType}` : sql``}
      ${adminId ? sql`AND al.admin_id = ${adminId}` : sql``}
      ${from ? sql`AND al.created_at >= ${from}` : sql``}
      ${to ? sql`AND al.created_at <= ${to}` : sql``}
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) as total FROM admin_audit_log al
    WHERE 1=1
      ${action ? sql`AND al.action LIKE ${`%${action}%`}` : sql``}
      ${targetType ? sql`AND al.target_type = ${targetType}` : sql``}
      ${adminId ? sql`AND al.admin_id = ${adminId}` : sql``}
      ${from ? sql`AND al.created_at >= ${from}` : sql``}
      ${to ? sql`AND al.created_at <= ${to}` : sql``}
  `;

  return NextResponse.json({
    entries: rows,
    total: parseInt(countRows[0].total as string),
    page,
    limit,
  });
}
