// Admin action — SMS every unnotified waitlister that the app is back live.
// Uses the existing VoIP.ms sendSms helper. Admin-authed + audit-logged.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { listUnnotified, markNotified } from '@/lib/maintenance';
import { sendSms } from '@/lib/sms/textbee';
import { renderTemplate } from '@/lib/sms/templates';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as { message?: string };
  // Admin may type a custom message; otherwise use the admin-editable default
  // template, falling back to the literal if the row is missing/disabled.
  const customMessage = body.message?.trim();
  const fallback = 'HMU ATL is back live — open the app and run it up. atl.hmucashride.com';
  const message =
    customMessage ||
    (await renderTemplate('maintenance_back_live', {})) ||
    fallback;
  if (message.length > 155) {
    return NextResponse.json({ error: 'message over 155 chars — would be split' }, { status: 400 });
  }

  const targets = await listUnnotified();
  const sentIds: string[] = [];
  let failed = 0;

  for (const t of targets) {
    try {
      const res = await sendSms(t.phone, message, {
        eventType: 'maintenance_back_live',
        market: 'atl',
      });
      if (res.success) sentIds.push(t.id);
      else failed++;
    } catch {
      failed++;
    }
  }

  const marked = sentIds.length > 0 ? await markNotified(sentIds) : 0;

  await logAdminAction(admin.id, 'maintenance.waitlist.notify', 'maintenance_waitlist', undefined, {
    scanned: targets.length,
    sent: sentIds.length,
    failed,
    marked,
    message,
  });

  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    sent: sentIds.length,
    failed,
  });
}
