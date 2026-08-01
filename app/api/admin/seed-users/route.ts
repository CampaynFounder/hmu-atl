// GET  /api/admin/seed-users  — list all seed drivers + riders
// POST /api/admin/seed-users  — create a seed driver or rider
//
// Super-admin only. Seed users are demo profiles that populate the native
// browse feeds; they are excluded from real dispatch in code.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import {
  listSeedUsers,
  createSeedDriver,
  createSeedRider,
} from '@/lib/db/seed-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const users = await listSeedUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const role = body.role;
  if (role !== 'driver' && role !== 'rider') {
    return NextResponse.json({ error: "role must be 'driver' or 'rider'" }, { status: 400 });
  }
  const handle = typeof body.handle === 'string' ? body.handle : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!handle.trim()) return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: 'display_name is required' }, { status: 400 });

  const common = {
    handle,
    display_name: displayName,
    gender: typeof body.gender === 'string' ? body.gender : undefined,
    market_id: typeof body.market_id === 'string' && body.market_id ? body.market_id : null,
    lgbtq_friendly: body.lgbtq_friendly === true,
    video_url: typeof body.video_url === 'string' ? body.video_url : undefined,
    photo_url: typeof body.photo_url === 'string' ? body.photo_url : undefined,
  };

  try {
    let created: { id: string; handle: string };
    if (role === 'driver') {
      created = await createSeedDriver({
        ...common,
        area_slugs: Array.isArray(body.area_slugs) ? (body.area_slugs as string[]) : [],
        min_price: typeof body.min_price === 'number' ? body.min_price : undefined,
        vehicle: (body.vehicle && typeof body.vehicle === 'object')
          ? (body.vehicle as Record<string, unknown>)
          : undefined,
      });
    } else {
      created = await createSeedRider({
        ...common,
        home_area_slug: typeof body.home_area_slug === 'string' ? body.home_area_slug : null,
      });
    }

    await logAdminAction(admin.id, 'seed_user.create', 'user', created.id, { role, handle: created.handle });
    return NextResponse.json({ id: created.id, handle: created.handle }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
