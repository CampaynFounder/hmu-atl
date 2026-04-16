import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { smsLogId, message: overrideMessage } = await req.json();
  if (!smsLogId) {
    return NextResponse.json({ error: 'smsLogId required' }, { status: 400 });
  }

  // Look up the failed message
  const rows = await sql`
    SELECT id, to_phone, message, event_type, market, error
    FROM sms_log
    WHERE id = ${smsLogId} AND status = 'failed'
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Message not found or not failed' }, { status: 404 });
  }

  const msg = rows[0] as { id: string; to_phone: string; message: string; event_type: string; market: string; error: string | null };

  // Use override message if provided (e.g. admin edited to fix length), otherwise use original
  const messageToSend = overrideMessage?.trim() || msg.message;

  console.log('[SMS RETRY] Retrying message', smsLogId, 'to', msg.to_phone, '| chars:', messageToSend.length, '| event_type:', msg.event_type);
  const result = await sendSms(msg.to_phone, messageToSend, {
    eventType: 'retry',
    market: msg.market || 'atl',
  });
  console.log('[SMS RETRY] Result for', smsLogId, ':', result);

  if (result.success) {
    // Mark original as retried so it drops out of the failed list
    await sql`UPDATE sms_log SET status = 'retried' WHERE id = ${smsLogId}`;
  }

  return NextResponse.json({
    success: result.success,
    error: result.error,
    originalId: smsLogId,
  });
}
