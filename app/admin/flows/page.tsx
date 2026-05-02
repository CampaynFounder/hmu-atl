// /admin/flows — read-only walkthrough of every user-facing onboarding/use
// flow, rendered with the same components production uses. Wrapped in
// OnboardingPreviewProvider so writes (profile saves, uploads, OS prompts)
// no-op. Admin-only; server-gated by `tools.flows.view`.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';

export const dynamic = 'force-dynamic';

const FLOWS: Array<{
  href: string;
  title: string;
  blurb: string;
  status: 'live' | 'planned';
}> = [
  {
    href: '/admin/flows/driver-express',
    title: 'Driver — Express Onboarding',
    blurb: 'Lower-friction signup for drivers coming through /driver/express. Admin-tunable at /admin/onboarding-config.',
    status: 'live',
  },
  {
    href: '/admin/flows/rider',
    title: 'Rider — Standard Sign-up',
    blurb: 'Production rider funnel: full RiderOnboarding, then the FirstTimePaymentBlocker on /rider/browse before any drivers are visible.',
    status: 'live',
  },
  {
    href: '/admin/flows/driver',
    title: 'Driver — Standard Onboarding',
    blurb: 'Full signup with vehicle, schedule, video intro, areas, and rider preferences.',
    status: 'planned',
  },
  {
    href: '/admin/flows/rider-express',
    title: 'Rider — Chat Booking (legacy variant)',
    blurb: 'Minimal-fields rider signup that runs only when arriving from a driver share link (/d/{handle}). Inline payment + media.',
    status: 'live',
  },
];

export default async function FlowsIndexPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin');
  if (!hasPermission(admin, 'tools.flows.view')) redirect('/admin');

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 6 }}>
          Flows
        </h1>
        <p style={{ fontSize: 14, color: 'var(--admin-text-faint)', lineHeight: 1.55, maxWidth: 640 }}>
          Read-only training views of every user-facing flow. Same components as production —
          no saves, no uploads, no analytics. Use these to onboard staff or rehearse a release.
        </p>
      </header>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {FLOWS.map((f) => {
          const isLive = f.status === 'live';
          // Tile is a real <Link> only when the target exists. "Planned" rows
          // render as a plain <div> with disabled styling — passing onClick
          // from this server component to <Link> (a client component) would
          // crash with "Functions cannot be passed to Client Components".
          const tileBody = (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)' }}>{f.title}</div>
                <span
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 4,
                    background: isLive ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.06)',
                    color: isLive ? '#00E676' : 'var(--admin-text-faint)',
                    border: `1px solid ${isLive ? 'rgba(0,230,118,0.3)' : 'var(--admin-border)'}`,
                  }}
                >
                  {isLive ? 'Live' : 'Planned'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--admin-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{f.blurb}</p>
            </>
          );
          const tileStyle = {
            display: 'block',
            padding: '16px 20px',
            borderRadius: 12,
            background: 'var(--admin-card)',
            border: '1px solid var(--admin-border)',
            textDecoration: 'none',
            color: 'inherit',
            opacity: isLive ? 1 : 0.55,
            cursor: isLive ? 'pointer' : 'not-allowed',
            transition: 'border-color .15s, transform .15s',
          } as const;
          return (
            <li key={f.href}>
              {isLive ? (
                <Link href={f.href} style={tileStyle}>{tileBody}</Link>
              ) : (
                <div style={tileStyle} aria-disabled>{tileBody}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
