// POST /api/search/track — Track search behavior for analytics
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ ok: true }); // Silent fail for unauthenticated

    const body = await req.json();
    const { event, query, resultCount, topResult, noResults, selectedLabel, selectedHref, selectedBreadcrumb } = body;

    // Get user id
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    const userId = userRows[0]?.id ?? null;

    await sql`
      INSERT INTO search_events (user_id, event, query, result_count, top_result, no_results, selected_label, selected_href, selected_breadcrumb)
      VALUES (${userId}, ${event}, ${query ?? null}, ${resultCount ?? null}, ${topResult ?? null}, ${noResults ?? false}, ${selectedLabel ?? null}, ${selectedHref ?? null}, ${selectedBreadcrumb ?? null})
    `;

    return NextResponse.json({ ok: true });
  } catch {
    // Never fail — tracking is non-critical
    return NextResponse.json({ ok: true });
  }
}
