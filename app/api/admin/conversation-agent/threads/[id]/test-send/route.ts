// Test-send — fires a persona template (greeting / follow_up / vision) to an
// arbitrary phone so admins can preview what the SMS looks like.
//
// Intentionally does NOT write to conversation_messages (this is test traffic;
// it should not pollute analytics or real thread state). Goes through the
// standard sendSms() path so it still hits sms_log for deliverability tracking.
//
// Path param `id` is ignored — kept for route symmetry with the other thread
// actions. The admin picks the target persona + phone in the body.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { getPersonaById } from '@/lib/conversation/personas';
import { sendSms } from '@/lib/sms/textbee';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.convagent.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    personaId?: string;
    kind?: 'greeting' | 'follow_up' | 'vision';
    toPhone?: string;
    market?: string;
  };

  if (!body.personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 });
  if (!body.toPhone) return NextResponse.json({ error: 'toPhone required' }, { status: 400 });
  const kind = body.kind ?? 'greeting';
  if (!['greeting', 'follow_up', 'vision'].includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const persona = await getPersonaById(body.personaId);
  if (!persona) return NextResponse.json({ error: 'persona not found' }, { status: 404 });

  const template =
    kind === 'greeting'  ? persona.greeting_template :
    kind === 'follow_up' ? (persona.follow_up_template || persona.greeting_template) :
                           (persona.vision_template || '');
  if (!template) return NextResponse.json({ error: `persona has no ${kind} template` }, { status: 400 });

  const result = await sendSms(body.toPhone, `[TEST] ${template}`, {
    userId: admin.id,
    eventType: 'conversation_test_send',
    market: body.market || 'atl',
  });

  await logAdminAction(admin.id, 'conversation_agent.test_send', 'conversation_persona', persona.id, {
    to: body.toPhone,
    kind,
    success: result.success,
    error: result.error ?? null,
  });

  return NextResponse.json({ ok: result.success, error: result.error ?? null, sent_body: template });
}
