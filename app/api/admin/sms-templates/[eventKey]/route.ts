import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, checkPermission, logAdminAction } from '@/lib/admin/helpers';
import { updateTemplate, SMS_EVENT_KEYS, type SmsEventKey, type TemplateUpdate } from '@/lib/sms/templates';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventKey: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!checkPermission(admin, 'admin.smstemplates.edit')) return unauthorizedResponse();

  const { eventKey } = await params;
  if (!(SMS_EVENT_KEYS as readonly string[]).includes(eventKey)) {
    return NextResponse.json({ error: `unknown event_key: ${eventKey}` }, { status: 404 });
  }
  const typedEventKey = eventKey as SmsEventKey;
  const body = await req.json() as Partial<TemplateUpdate>;

  if (typeof body.body !== 'string' || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'body must be a non-empty string' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 });
  }
  if (body.body.length > 155) {
    return NextResponse.json(
      { error: `body is ${body.body.length} chars (with variables unsubstituted). VoIP.ms caps at 155 chars; long messages will be truncated at send time.` },
      { status: 400 },
    );
  }

  const update: TemplateUpdate = { body: body.body, enabled: body.enabled };

  try {
    const template = await updateTemplate(typedEventKey, update, admin.id);
    await logAdminAction(admin.id, 'sms_template.update', 'sms_template', typedEventKey, { ...update });
    return NextResponse.json({ template });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
