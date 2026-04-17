import { NextRequest, NextResponse } from 'next/server';
import {
  requireAdmin,
  unauthorizedResponse,
  logAdminAction,
} from '@/lib/admin/helpers';
import {
  getDataRoomAccessCodeMeta,
  setDataRoomAccessCode,
} from '@/lib/data-room/access-code';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const meta = await getDataRoomAccessCodeMeta();
  return NextResponse.json(meta);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (code.length < 4) {
    return NextResponse.json(
      { error: 'Access code must be at least 4 characters' },
      { status: 400 }
    );
  }
  if (code.length > 128) {
    return NextResponse.json(
      { error: 'Access code must be 128 characters or fewer' },
      { status: 400 }
    );
  }

  await setDataRoomAccessCode(code, admin.clerk_id);
  await logAdminAction(admin.id, 'data_room.access_code.updated', 'platform_config', 'data_room_access_code', {
    codeLength: code.length,
  });

  const meta = await getDataRoomAccessCodeMeta();
  return NextResponse.json(meta);
}
