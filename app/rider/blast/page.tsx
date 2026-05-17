// /rider/blast — "My Blasts" entry point.
// If the rider has an active blast, redirect straight to its swipe deck.
// Otherwise show a nudge to send one.

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MyBlastsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in?redirect_url=/rider/blast');

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const riderId = (userRows[0] as { id: string }).id;

  // Active blast — redirect to swipe deck.
  const activeRows = await sql`
    SELECT time_window->>'shortcode' AS shortcode
    FROM hmu_posts
    WHERE user_id = ${riderId}
      AND post_type = 'blast'
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (activeRows.length) {
    const sc = (activeRows[0] as { shortcode: string }).shortcode;
    redirect(`/rider/blast/${sc}`);
  }

  // Recent blasts for history.
  const recentRows = await sql`
    SELECT
      id,
      time_window->>'shortcode' AS shortcode,
      price,
      status,
      pickup_address,
      dropoff_address,
      created_at,
      expires_at
    FROM hmu_posts
    WHERE user_id = ${riderId}
      AND post_type = 'blast'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const recent = recentRows as Array<{
    id: string;
    shortcode: string;
    price: number;
    status: string;
    pickup_address: string | null;
    dropoff_address: string | null;
    created_at: string;
    expires_at: string;
  }>;

  return (
    <div
      className="min-h-screen bg-black text-white pb-20"
      style={{ paddingTop: 'var(--header-height)' }}
    >
      <div className="px-4 pt-6">
        <h1
          className="text-3xl text-white mb-1"
          style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', letterSpacing: '1px' }}
        >
          My Blasts
        </h1>
        <p className="text-sm text-neutral-400 mb-6">Your ride requests</p>

        <Link
          href="/rider/blast/new"
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#00E676] text-black text-base font-bold py-4 mb-8"
          style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', letterSpacing: '1px' }}
        >
          ⚡ Send a Blast
        </Link>

        {recent.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-500 text-sm">No blasts yet.</p>
            <p className="text-neutral-600 text-xs mt-1">Tap above to blast your ride request to nearby drivers.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {recent.map((b) => {
              const isExpired = b.status !== 'active' || new Date(b.expires_at) < new Date();
              const pickup = b.pickup_address?.split(',')[0] ?? '?';
              const dropoff = b.dropoff_address?.split(',')[0] ?? '?';
              return (
                <li key={b.id}>
                  <Link
                    href={isExpired ? `/rider/blast/${b.shortcode}/status` : `/rider/blast/${b.shortcode}`}
                    className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        ${b.price} · {pickup} → {dropoff}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          b.status === 'active' ? 'bg-[#00E676]' :
                          b.status === 'matched' ? 'bg-blue-400' :
                          'bg-neutral-600'
                        }`} />
                        {b.status === 'active' ? 'Active' : b.status === 'matched' ? 'Matched' : b.status === 'cancelled' ? 'Cancelled' : 'Expired'}
                        <span>·</span>
                        <span>{new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                    <span className="text-neutral-600 text-sm">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
