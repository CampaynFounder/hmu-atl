import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { createActionItem } from '@/lib/admin/action-items';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';

const ALLOWED_ROLES = new Set([
  'Event Organizer / Promoter',
  'Venue Owner / Manager',
  'Booking Agent',
  'Other',
]);

const ALLOWED_ATTENDANCE = new Set([
  'Under 250',
  '250 – 500',
  '500 – 1,000',
  '1,000 – 2,500',
  '2,500+',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);

    // 5 inquiries per IP per hour. Form submissions don't need to be quick.
    const rl = await checkRateLimit({
      key: `events_inquiry:${ip}`,
      limit: 5,
      windowSeconds: 3600,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many submissions. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const name = String(body.name || '').trim();
    const role = String(body.role || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const event_name = String(body.event_name || '').trim();
    const event_date = body.event_date ? String(body.event_date).trim() : null;
    const expected_attendance = String(body.expected_attendance || '').trim();
    const social_handle = body.social_handle ? String(body.social_handle).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!name || name.length > 200) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }
    if (!event_name || event_name.length > 200) {
      return NextResponse.json({ error: 'Event name required.' }, { status: 400 });
    }
    if (!ALLOWED_ATTENDANCE.has(expected_attendance)) {
      return NextResponse.json({ error: 'Invalid attendance bucket.' }, { status: 400 });
    }
    if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return NextResponse.json({ error: 'Invalid event date.' }, { status: 400 });
    }
    if (social_handle && social_handle.length > 200) {
      return NextResponse.json({ error: 'Social handle too long.' }, { status: 400 });
    }
    if (notes && notes.length > 4000) {
      return NextResponse.json({ error: 'Notes too long.' }, { status: 400 });
    }

    const headerSlug = req.headers.get(MARKET_SLUG_HEADER);
    const bodySlug = body.market_slug ? String(body.market_slug).toLowerCase() : null;
    const market_slug = getMarketBranding(headerSlug || bodySlug).slug;

    const userAgent = req.headers.get('user-agent')?.slice(0, 500) || null;

    const rows = await sql`
      INSERT INTO event_inquiries (
        market_slug, name, role, email, phone, social_handle,
        event_name, event_date, expected_attendance, notes,
        ip_address, user_agent
      )
      VALUES (
        ${market_slug}, ${name}, ${role}, ${email}, ${phone}, ${social_handle},
        ${event_name}, ${event_date}, ${expected_attendance}, ${notes},
        ${ip}, ${userAgent}
      )
      RETURNING id
    `;
    const inquiryId = rows[0]?.id as string | undefined;

    if (inquiryId) {
      await createActionItem({
        category: 'events',
        itemType: 'new_event_inquiry',
        referenceId: inquiryId,
        title: `New event inquiry: ${event_name} (${expected_attendance})`,
      });
    }

    return NextResponse.json({ id: inquiryId, stored: true }, { status: 201 });
  } catch (error) {
    console.error('Event inquiry capture error:', error);
    return NextResponse.json({ error: 'Failed to store inquiry' }, { status: 500 });
  }
}
