import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// List saved prompts
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT id, created_at, type, inputs, gemini_prompt, hook_text, status, notes
    FROM content_prompts
    WHERE created_by = ${admin.clerk_id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ prompts: rows });
}

// Save new or update existing
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json();
  const { id, inputs, fullText, narration, notes, status } = body;

  if (id) {
    // Update existing
    if (inputs !== undefined) {
      await sql`UPDATE content_prompts SET inputs = ${JSON.stringify(inputs)} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
    }
    if (fullText !== undefined) {
      await sql`UPDATE content_prompts SET gemini_prompt = ${fullText} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
    }
    if (narration !== undefined) {
      await sql`UPDATE content_prompts SET hook_text = ${narration} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
    }
    if (notes !== undefined) {
      await sql`UPDATE content_prompts SET notes = ${notes} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
    }
    if (status !== undefined) {
      await sql`UPDATE content_prompts SET status = ${status} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
    }
    return NextResponse.json({ success: true, id });
  }

  // Save new (config only, no generation yet)
  const rows = await sql`
    INSERT INTO content_prompts (created_by, type, inputs, gemini_prompt, hook_text, status, notes)
    VALUES (
      ${admin.clerk_id},
      ${body.type || 'prompt'},
      ${JSON.stringify(inputs || {})},
      ${fullText || null},
      ${narration || null},
      ${status || 'draft'},
      ${notes || null}
    )
    RETURNING id
  `;

  return NextResponse.json({ success: true, id: rows[0]?.id });
}

// Update (alias for backwards compat)
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json();
  const { id, inputs, narration, notes, status } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  if (inputs !== undefined) {
    await sql`UPDATE content_prompts SET inputs = ${JSON.stringify(inputs)} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (narration !== undefined) {
    await sql`UPDATE content_prompts SET hook_text = ${narration} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (notes !== undefined) {
    await sql`UPDATE content_prompts SET notes = ${notes} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }
  if (status !== undefined) {
    await sql`UPDATE content_prompts SET status = ${status} WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  }

  return NextResponse.json({ success: true });
}

// Delete
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await sql`DELETE FROM content_prompts WHERE id = ${id} AND created_by = ${admin.clerk_id}`;
  return NextResponse.json({ success: true });
}
