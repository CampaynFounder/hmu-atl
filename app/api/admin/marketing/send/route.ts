// POST /api/admin/marketing/send — Send marketing SMS to one or more numbers
// Sends up to 2 messages per recipient: text message + link (each optional, at least one required)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sendSms } from '@/lib/sms/textbee';
import { sql } from '@/lib/db/client';
import { resolveActionItem } from '@/lib/admin/action-items';
import { wasRecentlySent, DEFAULT_DEDUP_WINDOW_HOURS } from '@/lib/sms/dedup';

interface Recipient {
  phone: string;
  name?: string;
  // Optional Neon user id — when provided, the admin_sms_sent audit row links
  // directly to the recipient. When absent, we best-effort resolve from phone.
  userId?: string;
}

// Resolve a phone number to a Neon user_id by checking both profile tables.
async function resolveUserIdByPhone(normalizedPhone: string): Promise<string | null> {
  const rows = await sql`
    SELECT user_id FROM rider_profiles WHERE phone = ${normalizedPhone}
    UNION
    SELECT user_id FROM driver_profiles WHERE phone = ${normalizedPhone}
    LIMIT 1
  `;
  return rows[0]?.user_id || null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const { recipients, message, link, eventType, dedup } = await req.json() as {
      recipients: Recipient[];
      message?: string;
      link?: string;
      // Optional override — activation nudges pass `activation_nudge:{checkKey}`
      // so sms_log can be sliced by check. Defaults to 'marketing'.
      eventType?: string;
      // Dedup is opt-in per request because manual marketing campaigns may
      // intentionally re-blast. Activation flows pass dedup={ enabled: true }
      // so the nudge-button can prompt the admin if a duplicate would result.
      // ackDuplicate=true bypasses the 409 (admin saw the warning + said send).
      dedup?: { enabled?: boolean; windowHours?: number; ackDuplicate?: boolean };
    };
    const messageEventType = eventType || 'marketing';
    const linkEventType = eventType ? `${eventType}_link` : 'marketing_link';

    // Dedup check — single recipient flows only. For multi-recipient bulk sends,
    // dedup belongs at the cohort-builder level (see /api/admin/activation/bulk-nudge).
    if (dedup?.enabled && recipients?.length === 1 && recipients[0].userId && !dedup.ackDuplicate) {
      const windowHours = dedup.windowHours ?? DEFAULT_DEDUP_WINDOW_HOURS;
      const check = await wasRecentlySent({
        userId: recipients[0].userId,
        eventType: messageEventType,
        windowHours,
      });
      if (check.recentlySent) {
        return NextResponse.json({
          error: 'duplicate_within_window',
          lastSentAt: check.lastSentAt,
          windowHours,
        }, { status: 409 });
      }
    }

    if (!recipients?.length) {
      return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 });
    }

    const hasMessage = !!message?.trim();
    const hasLink = !!link?.trim();

    if (!hasMessage && !hasLink) {
      return NextResponse.json({ error: 'Enter a message, a link, or both' }, { status: 400 });
    }
    if (hasMessage && message!.length > 160) {
      return NextResponse.json({ error: `Message is ${message!.length} chars (max 160)` }, { status: 400 });
    }
    if (hasLink && link!.length > 160) {
      return NextResponse.json({ error: `Link is ${link!.length} chars (max 160)` }, { status: 400 });
    }

    const results = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const phone = recipient.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        results.push({ phone: recipient.phone, name: recipient.name, status: 'skipped', error: 'Invalid number' });
        failed++;
        continue;
      }

      let recipientSent = 0;
      let recipientError = '';

      // Send message text
      if (hasMessage) {
        const personalizedMsg = recipient.name
          ? message!.replace(/\{name\}/g, recipient.name)
          : message!.replace(/\{name\}/g, '');

        const result = await sendSms(phone, personalizedMsg.trim(), {
          eventType: messageEventType,
          market: 'atl',
          userId: recipient.userId,
        });
        if (result.success) recipientSent++;
        else recipientError = result.error || 'Failed';
      }

      // Send link as separate SMS
      if (hasLink && !recipientError) {
        // Small delay between the two messages so they arrive in order
        if (hasMessage) await new Promise(r => setTimeout(r, 800));

        const result = await sendSms(phone, link!.trim(), {
          eventType: linkEventType,
          market: 'atl',
          userId: recipient.userId,
        });
        if (result.success) recipientSent++;
        else recipientError = result.error || 'Link send failed';
      }

      const expectedCount = (hasMessage ? 1 : 0) + (hasLink ? 1 : 0);
      const status = recipientError ? (recipientSent > 0 ? 'partial' : 'failed') : 'sent';

      // Audit log row for admin drill-ins ("have we texted them Y/N + when").
      // Non-blocking: failures here must not break the send flow.
      if (recipientSent > 0) {
        try {
          const recipientId = recipient.userId || await resolveUserIdByPhone(phone);
          const auditMessage = [hasMessage ? message!.trim() : null, hasLink ? link!.trim() : null]
            .filter(Boolean)
            .join('\n');
          await sql`
            INSERT INTO admin_sms_sent (admin_id, recipient_id, recipient_phone, message, status)
            VALUES (${admin.id}, ${recipientId}, ${phone}, ${auditMessage}, ${status})
          `;
          // Resolve action item when admin contacts a user
          if (recipientId) {
            await resolveActionItem('users', recipientId);
          }
        } catch (auditErr) {
          console.error('[ADMIN_SMS_AUDIT] failed:', auditErr);
        }
      }

      results.push({
        phone: recipient.phone,
        name: recipient.name,
        status,
        messagesSent: recipientSent,
        messagesExpected: expectedCount,
        error: recipientError || undefined,
      });

      if (status === 'sent') sent++;
      else failed++;

      // Delay between recipients
      if (recipients.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await logAdminAction(admin.id, 'marketing_sms', 'campaign', undefined, {
      recipientCount: recipients.length,
      sent,
      failed,
      hasMessage,
      hasLink,
      messagePreview: message?.slice(0, 80),
      link,
    });

    return NextResponse.json({ sent, failed, total: recipients.length, results });
  } catch (error) {
    console.error('Marketing send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
