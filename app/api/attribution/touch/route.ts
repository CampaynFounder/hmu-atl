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

  // Direct/organic visitors are first-class: a row with all-null UTMs is the
  // "no campaign" bucket, queryable as utm_campaign IS NULL. Don't reject
  // signal-less touches — that's the whole point. ON CONFLICT (cookie_id)
  // DO NOTHING in recordFirstTouch handles dedupe.
  try {
    await recordFirstTouch(cookieId, body);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[attribution/touch] failed:', err);
    return NextResponse.json({ ok: false, reason: 'db-error' }, { status: 200 });
  }
}
