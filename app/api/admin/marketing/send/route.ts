// POST /api/admin/marketing/send — Send marketing SMS to one or more numbers
// Sends up to 2 messages per recipient: text message + link (each optional, at least one required)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sendSms } from '@/lib/sms/textbee';

interface Recipient {
  phone: string;
  name?: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const { recipients, message, link } = await req.json() as {
      recipients: Recipient[];
      message?: string;
      link?: string;
    };

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
          eventType: 'marketing',
          market: 'atl',
        });
        if (result.success) recipientSent++;
        else recipientError = result.error || 'Failed';
      }

      // Send link as separate SMS
      if (hasLink && !recipientError) {
        // Small delay between the two messages so they arrive in order
        if (hasMessage) await new Promise(r => setTimeout(r, 800));

        const result = await sendSms(phone, link!.trim(), {
          eventType: 'marketing_link',
          market: 'atl',
        });
        if (result.success) recipientSent++;
        else recipientError = result.error || 'Link send failed';
      }

      const expectedCount = (hasMessage ? 1 : 0) + (hasLink ? 1 : 0);
      const status = recipientError ? (recipientSent > 0 ? 'partial' : 'failed') : 'sent';

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
