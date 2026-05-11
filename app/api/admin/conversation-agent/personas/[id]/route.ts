import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { updatePersona, deletePersona, type PersonaInput } from '@/lib/conversation/personas';
import { validatePersona } from '../route';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.convagent.edit')) return unauthorizedResponse();
  const { id } = await params;
  const body = await req.json() as Partial<PersonaInput>;
  const err = validatePersona(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const persona = await updatePersona(id, body as PersonaInput, admin.id);
  if (!persona) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await logAdminAction(admin.id, 'conversation_agent.persona.update', 'conversation_persona', id, { slug: persona.slug });
  return NextResponse.json({ persona });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.convagent.edit')) return unauthorizedResponse();
  const { id } = await params;
  const ok = await deletePersona(id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await logAdminAction(admin.id, 'conversation_agent.persona.delete', 'conversation_persona', id, {});
  return NextResponse.json({ ok: true });
}
