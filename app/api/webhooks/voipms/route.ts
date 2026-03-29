// GET /api/webhooks/voipms — VoIP.ms inbound SMS callback
// VoIP.ms sends inbound SMS as GET requests with query params:
// ?from=14045551234&to=14049137292&message=Hello&id=12345&date=2026-03-28
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const message = searchParams.get('message') ?? '';
  const voipmsId = searchParams.get('id') ?? '';

  if (!from || !message) {
    return NextResponse.json({ error: 'Missing from or message' }, { status: 400 });
  }

  // Normalize phone — strip +1 prefix
  const fromPhone = from.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  const toDid = to.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

  try {
    await sql`
      INSERT INTO sms_inbound (from_phone, to_did, message, voipms_id)
      VALUES (${fromPhone}, ${toDid}, ${message}, ${voipmsId || null})
    `;

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Inbound SMS error:', error);
    return NextResponse.json({ status: 'ok' }); // Always return 200 to VoIP.ms
  }
}

// Also handle POST in case VoIP.ms sends POST
export async function POST(req: NextRequest) {
  return GET(req);
}
