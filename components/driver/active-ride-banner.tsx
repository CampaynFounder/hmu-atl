import Link from 'next/link';
import { sql } from '@/lib/db/client';

// Server-resolved active-ride banner for driver discovery surfaces
// (/driver/find-riders and /driver/feed). Renders only when the driver has
// an in-progress ride; otherwise returns null and the page renders normally.
// Uses the same status list as /api/rides/active so the two stay in sync.

const ACTIVE_STATUSES = ['accepted', 'matched', 'otw', 'here', 'active', 'in_progress'];

export default async function ActiveRideBanner({ userId }: { userId: string }) {
  const rows = await sql`
    SELECT id, status
    FROM rides
    WHERE driver_id = ${userId}
      AND status = ANY(${ACTIVE_STATUSES}::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;

  const ride = rows[0] as { id: string; status: string };
  const statusLabel: Record<string, string> = {
    accepted: 'Accepted',
    matched: 'Matched',
    otw: 'OTW',
    here: 'Here',
    active: 'In progress',
    in_progress: 'In progress',
  };

  return (
    <Link
      href={`/ride/${ride.id}`}
      style={{
        display: 'block',
        background: 'rgba(0,230,118,0.08)',
        border: '1px solid rgba(0,230,118,0.25)',
        borderRadius: 16,
        padding: '14px 18px',
        marginBottom: 16,
        textDecoration: 'none',
        color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: '#00E676', marginBottom: 4 }}>
        You have an active ride — {statusLabel[ride.status] || ride.status}
      </div>
      <div style={{ fontSize: 13, color: '#bbb' }}>
        Tap to open the ride →
      </div>
    </Link>
  );
}
