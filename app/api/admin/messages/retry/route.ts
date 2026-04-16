import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { smsLogId } = await req.json();
  if (!smsLogId) {
    return NextResponse.json({ error: 'smsLogId required' }, { status: 400 });
  }

  // Look up the failed message
  const rows = await sql`
    SELECT id, to_phone, message, event_type, market
    FROM sms_log
    WHERE id = ${smsLogId} AND status = 'failed'
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Message not found or not failed' }, { status: 404 });
  }

  const msg = rows[0] as { id: string; to_phone: string; message: string; event_type: string; market: string };

  // Retry the send
  const result = await sendSms(msg.to_phone, msg.message, {
    eventType: msg.event_type || 'retry',
    market: msg.market || 'atl',
  });

  if (result.success) {
    // Mark original as retried
    await sql`UPDATE sms_log SET status = 'retried' WHERE id = ${smsLogId}`;
  }

  return NextResponse.json({
    success: result.success,
    error: result.error,
    originalId: smsLogId,
  });
}
