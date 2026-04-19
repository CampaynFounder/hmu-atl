import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { listPersonas, createPersona, type PersonaInput } from '@/lib/conversation/personas';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const personas = await listPersonas();
  return NextResponse.json({ personas });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json() as Partial<PersonaInput>;
  const err = validatePersona(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const persona = await createPersona(body as PersonaInput, admin.id);
  await logAdminAction(admin.id, 'conversation_agent.persona.create', 'conversation_persona', persona.id, { slug: persona.slug });
  return NextResponse.json({ persona });
}

export function validatePersona(body: Partial<PersonaInput>): string | null {
  if (!body.slug) return 'slug required';
  if (!body.display_name) return 'display_name required';
  if (!['female', 'male', 'nonbinary', 'any'].includes(body.gender_match as string)) return 'invalid gender_match';
  if (!['driver', 'rider', 'any'].includes(body.user_type_match as string)) return 'invalid user_type_match';
  if (!body.greeting_template) return 'greeting_template required';
  if (!body.system_prompt) return 'system_prompt required';
  if (typeof body.max_messages_per_thread !== 'number' || body.max_messages_per_thread < 1) return 'max_messages_per_thread must be >= 1';
  if (!body.quiet_hours_start || !body.quiet_hours_end) return 'quiet_hours required';
  if (!Array.isArray(body.follow_up_schedule_hours)) return 'follow_up_schedule_hours must be array';
  return null;
}
