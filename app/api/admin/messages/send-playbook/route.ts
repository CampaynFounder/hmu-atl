// Send a Response Playbook entry to a single phone number.
// Long answers are split into ~150-char SMS chunks (lib/sms/chunk.ts) and sent
// with a small stagger so they land like a person texting in bursts.
//
// Two modes:
//   - One-click Send: { playbookId, toPhone } — sends the entry as authored.
//   - Compose: { playbookId, toPhone, overrideText } — admin edited before send;
//     overrideText is what actually goes out, was_edited flag set in audit.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { chunkSms } from '@/lib/sms/chunk';
import { getPlaybook, recordPlaybookSend } from '@/lib/admin/playbook';
import { resolveActionItem } from '@/lib/admin/action-items';

// Stagger between chunks. Long enough that messages arrive in order on the
// recipient's phone; short enough that the admin doesn't twiddle thumbs.
const CHUNK_STAGGER_MS = 800;

async function resolveUserIdByPhone(normalizedPhone: string): Promise<string | null> {
  const rows = await sql`
    SELECT user_id FROM rider_profiles WHERE phone = ${normalizedPhone}
    UNION
    SELECT user_id FROM driver_profiles WHERE phone = ${normalizedPhone}
    LIMIT 1
  `;
  return (rows[0]?.user_id as string) ?? null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = (await req.json()) as {
    playbookId?: string;
    toPhone?: string;
    overrideText?: string;
  };

  const playbookId = body.playbookId?.trim();
  const phoneRaw = body.toPhone?.trim() ?? '';
  const phone = phoneRaw.replace(/\D/g, '');
  if (!playbookId) {
    return NextResponse.json({ error: 'playbookId required' }, { status: 400 });
  }
  if (phone.length < 10) {
    return NextResponse.json({ error: 'toPhone must be at least 10 digits' }, { status: 400 });
  }

  const entry = await getPlaybook(playbookId);
  if (!entry) return NextResponse.json({ error: 'Playbook entry not found' }, { status: 404 });
  if (!entry.is_active) {
    return NextResponse.json({ error: 'Playbook entry is archived' }, { status: 400 });
  }

  const overrideText = body.overrideText?.trim();
  const wasEdited = !!overrideText && overrideText !== entry.answer_body.trim();
  const sourceText = overrideText && overrideText.length ? overrideText : entry.answer_body;

  const chunks = chunkSms(sourceText);
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'Empty message after normalization' }, { status: 400 });
  }

  const recipientId = await resolveUserIdByPhone(phone);
  let sent = 0;
  let lastError: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = await sendSms(phone, chunk, {
      eventType: 'playbook',
      market: 'atl',
      userId: recipientId ?? undefined,
    });
    if (result.success) sent++;
    else { lastError = result.error || 'send failed'; break; }
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, CHUNK_STAGGER_MS));
    }
  }

  // Audit row matches /admin/marketing/send conventions so the existing
  // "have we texted them" surfaces in Live Ops & Growth pick this up.
  if (sent > 0) {
    try {
      await sql`
        INSERT INTO admin_sms_sent (admin_id, recipient_id, recipient_phone, message, status)
        VALUES (${admin.id}, ${recipientId}, ${phone}, ${sourceText},
                ${sent === chunks.length ? 'sent' : 'partial'})
      `;
      if (recipientId) await resolveActionItem('users', recipientId);
    } catch (err) {
      console.error('[PLAYBOOK_SEND] admin_sms_sent insert failed:', err);
    }
  }

  // Playbook-specific audit + usage_count bump. Only record on at-least-partial
  // success so unsent attempts don't inflate the "Used Nx" column.
  if (sent > 0) {
    try {
      await recordPlaybookSend({
        playbook_id: playbookId,
        admin_id: admin.id,
        to_phone: phone,
        recipient_id: recipientId,
        chunk_count: sent,
        was_edited: wasEdited,
      });
    } catch (err) {
      console.error('[PLAYBOOK_SEND] recordPlaybookSend failed:', err);
    }
  }

  await logAdminAction(admin.id, 'playbook_send', 'response_playbook', playbookId, {
    to_phone: phone,
    chunks_sent: sent,
    chunks_total: chunks.length,
    was_edited: wasEdited,
    error: lastError,
  });

  if (sent === 0) {
    return NextResponse.json({ error: lastError ?? 'send failed' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    chunksSent: sent,
    chunksTotal: chunks.length,
    partial: sent < chunks.length,
    error: lastError,
  });
}
