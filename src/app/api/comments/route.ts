import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import sql from '../../../../lib/db/client';
import { ratelimit } from '../../../../lib/ratelimit';
import posthog from '../../../../lib/posthog';
import type { RiderProfile, DriverProfile, User } from '../../../../lib/db/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tiers that control visibility
type UserTier = 'standard' | 'hmufirst' | 'og';

// Sentiment flag categories that trigger auto-hide
const AUTO_HIDE_FLAGS = new Set(['threatening', 'slur', 'personal_info']);

interface SentimentResult {
  flags: string[];
  safe: boolean;
}

async function analyzeComment(text: string): Promise<SentimentResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a content moderation assistant. Analyze the comment for harmful content.
Return a JSON object with:
- "flags": array of applicable flags from: ["threatening", "slur", "personal_info", "spam", "harassment"]
- "safe": boolean (true if flags array is empty)

Respond ONLY with valid JSON, no markdown.`,
      },
      { role: 'user', content: text },
    ],
  });

  try {
    const raw = response.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw) as { flags?: string[]; safe?: boolean };
    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    return { flags, safe: flags.length === 0 };
  } catch {
    return { flags: [], safe: true };
  }
}

async function getUserTier(dbUserId: string): Promise<UserTier> {
  // Check OG status from rider_profiles
  const rows = await sql`
    SELECT og_status, completed_rides
    FROM rider_profiles
    WHERE user_id = ${dbUserId}
    LIMIT 1
  `.catch(() => []);

  if (rows.length) {
    const profile = rows[0] as { og_status?: boolean; completed_rides?: number };
    if (profile.og_status) return 'og';
  }

  // Check driver HMU First status
  const driverRows = await sql`
    SELECT hmu_first FROM driver_profiles
    WHERE user_id = ${dbUserId}
    LIMIT 1
  `.catch(() => []);

  if (driverRows.length) {
    const dp = driverRows[0] as { hmu_first?: boolean };
    if (dp.hmu_first) return 'hmufirst';
  }

  return 'standard';
}

export async function POST(req: NextRequest) {
  // Clerk auth
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const { success } = await ratelimit.limit(`comments:${userId}`);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { ride_id: string; target_user_id: string; text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ride_id, target_user_id, text } = body;

  if (!ride_id || !target_user_id || !text?.trim()) {
    return NextResponse.json(
      { error: 'ride_id, target_user_id, and text are required' },
      { status: 400 }
    );
  }

  if (text.length > 500) {
    return NextResponse.json({ error: 'Comment too long (max 500 chars)' }, { status: 400 });
  }

  // Resolve internal DB user id
  const raterRows = await sql`
    SELECT id FROM users WHERE auth_provider_id = ${userId} LIMIT 1
  `;
  if (!raterRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const authorDbId = raterRows[0].id as string;

  // GPT-4o-mini sentiment check BEFORE saving
  const sentiment = await analyzeComment(text);

  const shouldHide = sentiment.flags.some((f) => AUTO_HIDE_FLAGS.has(f));

  if (shouldHide) {
    // Save to comments as hidden and queue for admin review
    await sql`
      INSERT INTO comments
        (ride_id, author_id, target_user_id, text, is_hidden, sentiment_flags, created_at)
      VALUES
        (${ride_id}, ${authorDbId}, ${target_user_id},
         ${text}, true, ${JSON.stringify(sentiment.flags)}, NOW())
    `.catch(() => null);

    // Send to admin queue
    await sql`
      INSERT INTO admin_comment_queue (ride_id, author_id, target_user_id, text, flags, created_at)
      VALUES (${ride_id}, ${authorDbId}, ${target_user_id}, ${text}, ${JSON.stringify(sentiment.flags)}, NOW())
      ON CONFLICT DO NOTHING
    `.catch(() => null);

    // Still return success — don't reveal moderation outcome
    return NextResponse.json(
      { message: 'Comment submitted for review' },
      { status: 202 }
    );
  }

  // Insert visible comment
  const inserted = await sql`
    INSERT INTO comments
      (ride_id, author_id, target_user_id, text, is_hidden, sentiment_flags, created_at)
    VALUES
      (${ride_id}, ${authorDbId}, ${target_user_id},
       ${text}, false, ${JSON.stringify(sentiment.flags)}, NOW())
    RETURNING *
  `;
  const comment = inserted[0];

  // PostHog event
  posthog.capture({
    distinctId: userId,
    event: 'comment_posted',
    properties: {
      ride_id,
      target_user_id,
      comment_id: comment?.id,
      auto_flagged: false,
      flag_count: sentiment.flags.length,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ comment }, { status: 201 });
}
