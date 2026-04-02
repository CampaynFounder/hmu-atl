import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { generateContent, type GenerateRequest } from '@/lib/content/claude';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const body = (await req.json()) as GenerateRequest;

    // Validate required fields
    if (!body.type || !['prompt', 'trend-hijack', 'hook-only'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be prompt, trend-hijack, or hook-only.' },
        { status: 400 }
      );
    }

    const result = await generateContent(body);

    // Save to database
    await sql`
      INSERT INTO content_prompts (
        created_by, type, inputs, gemini_prompt, timing_sheet, hook_text,
        trend_context, status
      ) VALUES (
        ${admin.clerk_id},
        ${body.type},
        ${JSON.stringify(body)},
        ${result.fullText || null},
        ${result.timingSheet || null},
        ${result.hookText || null},
        ${body.trendDescription || null},
        'generated'
      )
    `;

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('Content generation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
