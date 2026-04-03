import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// List saved prompts
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT id, created_at, type, inputs, gemini_prompt, timing_sheet, hook_text,
           trend_context, status, platform, posted_at, notes
    FROM content_prompts
    WHERE created_by = ${admin.clerk_id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ prompts: rows });
}

// Update a saved prompt
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id, inputs, gemini_prompt, notes, status, narration } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Build dynamic update
  const updates: string[] = [];
  const values: Record<string, unknown> = {};

  if (inputs !== undefined) {
    await sql`UPDATE content_prompts SET inputs = ${JSON.stringify(inputs)} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (gemini_prompt !== undefined) {
    await sql`UPDATE content_prompts SET gemini_prompt = ${gemini_prompt} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (notes !== undefined) {
    await sql`UPDATE content_prompts SET notes = ${notes} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (status !== undefined) {
    await sql`UPDATE content_prompts SET status = ${status} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (narration !== undefined) {
    await sql`UPDATE content_prompts SET hook_text = ${narration} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }

  return NextResponse.json({ success: true });
}

// Delete a saved prompt
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await sql`DELETE FROM content_prompts WHERE id = ${id} AND created_by = ${admin.clerk_id}`;

  return NextResponse.json({ success: true });
}
