// Public endpoint — join the "notify me when back" waitlist during maintenance.
// No auth; idempotent on phone.

import { NextRequest, NextResponse } from 'next/server';
import { joinWaitlist } from '@/lib/maintenance';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { phone?: string };
  if (!body.phone || body.phone.length < 7) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 });
  }
  const result = await joinWaitlist(body.phone);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
