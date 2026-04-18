import { NextRequest, NextResponse } from 'next/server';
import { ATTRIB_COOKIE, recordFirstTouch, type AttributionTouch } from '@/lib/attribution';

export async function POST(req: NextRequest) {
  const cookieId = req.cookies.get(ATTRIB_COOKIE)?.value;
  if (!cookieId) {
    return NextResponse.json({ ok: false, reason: 'no-cookie' }, { status: 200 });
  }

  let body: Partial<AttributionTouch> = {};
  try {
    body = await req.json() as Partial<AttributionTouch>;
  } catch {
    body = {};
  }

  const hasAnySignal =
    body.utm_source || body.utm_medium || body.utm_campaign ||
    body.utm_content || body.utm_term || body.referrer || body.landing_path;
  if (!hasAnySignal) {
    return NextResponse.json({ ok: false, reason: 'no-signal' }, { status: 200 });
  }

  try {
    await recordFirstTouch(cookieId, body);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[attribution/touch] failed:', err);
    return NextResponse.json({ ok: false, reason: 'db-error' }, { status: 200 });
  }
}
