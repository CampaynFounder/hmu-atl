import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { getConfig, updateConfig, type ConfigUpdate } from '@/lib/conversation/config';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const config = await getConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json() as Partial<ConfigUpdate>;

  const required: (keyof ConfigUpdate)[] = [
    'first_message_delay_minutes', 'quiet_hours_start', 'quiet_hours_end',
    'quiet_hours_enforced', 'opt_in_required', 'opt_in_disclosure_text',
    'stop_acknowledgment_text', 'vision_trigger', 'rider_narrative_style',
    'claude_model', 'max_inbound_per_thread', 'claude_rate_limit_seconds',
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }

  const update: ConfigUpdate = {
    first_message_delay_minutes: Number(body.first_message_delay_minutes),
    quiet_hours_start: String(body.quiet_hours_start),
    quiet_hours_end: String(body.quiet_hours_end),
    quiet_hours_enforced: Boolean(body.quiet_hours_enforced),
    opt_in_required: Boolean(body.opt_in_required),
    opt_in_disclosure_text: String(body.opt_in_disclosure_text),
    stop_acknowledgment_text: String(body.stop_acknowledgment_text),
    vision_trigger: body.vision_trigger as ConfigUpdate['vision_trigger'],
    rider_narrative_style: body.rider_narrative_style as ConfigUpdate['rider_narrative_style'],
    claude_model: String(body.claude_model),
    max_inbound_per_thread: Number(body.max_inbound_per_thread),
    claude_rate_limit_seconds: Number(body.claude_rate_limit_seconds),
    daily_spend_cap_cents: body.daily_spend_cap_cents == null ? null : Number(body.daily_spend_cap_cents),
  };

  const config = await updateConfig(update, admin.id);
  await logAdminAction(admin.id, 'conversation_agent.config.update', 'conversation_agent_config', '1', { ...update });
  return NextResponse.json({ config });
}
