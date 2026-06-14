import SystemHealthClient from './system-health-client';

// Access is enforced centrally by app/admin/layout.tsx against the
// `admin.systemhealth` rule in lib/admin/route-permissions.ts (same guard,
// sidebar filter, and search filter every other admin page uses). The page
// itself just renders — no bespoke is_admin check, which previously let any
// admin reach it by URL regardless of role permissions.
export const dynamic = 'force-dynamic';

export default function SystemHealthPage() {
  return <SystemHealthClient />;
}
