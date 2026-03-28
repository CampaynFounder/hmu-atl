// POST /api/admin/switch-role — Switch own profile_type (admin only)
// Only allows switching between 'admin', 'driver', 'rider', 'both'
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be an admin
  const userRows = await sql`
    SELECT id, profile_type, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const user = userRows[0];
  if (!user.is_admin) {
    return NextResponse.json({ error: 'Only admins can switch roles' }, { status: 403 });
  }

  const { role } = await req.json();
  const allowed = ['driver', 'rider'];
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Use: ${allowed.join(', ')}` }, { status: 400 });
  }

  await sql`
    UPDATE users SET profile_type = ${role}, updated_at = NOW()
    WHERE id = ${user.id}
  `;

  return NextResponse.json({ success: true, role });
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ role: rows[0].profile_type });
}
