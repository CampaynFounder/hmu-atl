// POST /api/admin/marketing/send — Send marketing SMS to one or more numbers
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
      message: string;
      link?: string;
    };

    if (!recipients?.length) {
      return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 });
    }
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Combine message + link and validate total length
    const fullMessage = link ? `${message.trim()} ${link.trim()}` : message.trim();
    if (fullMessage.length > 160) {
      return NextResponse.json({
        error: `Combined message + link is ${fullMessage.length} chars (max 160). Shorten your message.`,
      }, { status: 400 });
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

      // Personalize message if name is available
      let personalizedText = recipient.name
        ? message.replace(/\{name\}/g, recipient.name)
        : message.replace(/\{name\}/g, '');

      const finalMsg = link ? `${personalizedText.trim()} ${link.trim()}` : personalizedText.trim();

      const result = await sendSms(phone, finalMsg, {
        eventType: 'marketing',
        market: 'atl',
      });

      results.push({
        phone: recipient.phone,
        name: recipient.name,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
      });

      if (result.success) sent++;
      else failed++;

      // Small delay between sends to avoid rate limiting
      if (recipients.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await logAdminAction(admin.id, 'marketing_sms', 'campaign', undefined, {
      recipientCount: recipients.length,
      sent,
      failed,
      messagePreview: message.slice(0, 80),
      link,
    });

    return NextResponse.json({ sent, failed, total: recipients.length, results });
  } catch (error) {
    console.error('Marketing send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
