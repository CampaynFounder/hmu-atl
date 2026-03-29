// VoIP.ms inbound SMS callback
// Handles both GET (query params) and POST (form body or JSON body)
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

async function handleInbound(params: Record<string, string>) {
  const from = params.from ?? '';
  const to = params.to ?? '';
  const message = params.message ?? '';
  const voipmsId = params.id ?? '';

  if (!from || !message) {
    return NextResponse.json({ error: 'Missing from or message' }, { status: 400 });
  }

  const fromPhone = from.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  const toDid = to.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

  try {
    await sql`
      INSERT INTO sms_inbound (from_phone, to_did, message, voipms_id)
      VALUES (${fromPhone}, ${toDid}, ${message}, ${voipmsId || null})
    `;
  } catch (error) {
    console.error('Inbound SMS error:', error);
  }

  return NextResponse.json({ status: 'ok' });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  return handleInbound({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    message: searchParams.get('message') ?? '',
    id: searchParams.get('id') ?? '',
  });
}

export async function POST(req: NextRequest) {
  // Try query params first (some providers send POST with query params)
  const { searchParams } = req.nextUrl;
  if (searchParams.get('from') && searchParams.get('message')) {
    return handleInbound({
      from: searchParams.get('from') ?? '',
      to: searchParams.get('to') ?? '',
      message: searchParams.get('message') ?? '',
      id: searchParams.get('id') ?? '',
    });
  }

  // Try form-encoded body (application/x-www-form-urlencoded)
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('form')) {
    const formData = await req.formData();
    return handleInbound({
      from: formData.get('from')?.toString() ?? '',
      to: formData.get('to')?.toString() ?? '',
      message: formData.get('message')?.toString() ?? '',
      id: formData.get('id')?.toString() ?? '',
    });
  }

  // Try JSON body
  try {
    const body = await req.json();
    return handleInbound({
      from: body.from ?? '',
      to: body.to ?? '',
      message: body.message ?? '',
      id: body.id ?? '',
    });
  } catch {
    // Last resort — try reading as text and parsing
    return NextResponse.json({ status: 'ok' });
  }
}
