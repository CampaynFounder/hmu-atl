// Single source of truth for which permission gates which admin route.
//
// Every admin page is enforced server-side in `app/admin/layout.tsx` against
// this map. The sidebar and search palette derive their visibility filters
// from the same rules, so a non-super admin who navigates directly to a URL
// they shouldn't see gets the same answer the sidebar would have given them.
//
// Adding a new admin route: append one entry here. That covers server-side
// access enforcement, sidebar filtering, and search filtering. Sidebar/search
// still own their own labels/icons/keywords — only the access rule lives here.
//
// Rule kinds (strict default-deny — no `public` escape hatch):
//   { kind: 'permission'; slug: 'x.y' }   → requires hasPermission('x.y.view')
//                                           (the matrix's `x.y.edit` and
//                                           `x.y.publish` imply view)
//   { kind: 'super' }                     → super admins only
//
// Route matching: longest-pattern-wins. `/admin/safety/archive` matches
// `/admin/safety` before `/admin`. Unknown routes default-deny (super only),
// so forgetting an entry fails closed, never open.
//
// `/admin` itself is super-only by rule, but the layout exempts it from the
// route guard so non-super admins can still reach the page-level dispatcher
// in `app/admin/page.tsx`, which redirects them to the first nav route their
// role can access (or shows an empty state if zero permissions are granted).

// IMPORTANT: this file must stay client-safe — it's imported by
// `app/admin/components/admin-sidebar.tsx` (a client component). Don't import
// from `./helpers`, `./preview-role`, or anything that transitively pulls in
// `next/headers`, the Neon client, or Clerk server SDKs. Server-side callers
// can compose `canAccess` with `hasPermission` from helpers themselves —
// see `app/admin/layout.tsx` and `app/api/admin/search/route.ts`.

export type AdminRouteRule =
  | { kind: 'permission'; slug: string }
  | { kind: 'super' };

export interface AdminRouteEntry {
  pattern: string;
  rule: AdminRouteRule;
}

export const ADMIN_ROUTES: AdminRouteEntry[] = [
  // ── MONITOR ─────────────────────────────────────────────────────────
  { pattern: '/admin',                     rule: { kind: 'super' } }, // Live Ops — super only. Layout exempts /admin from the guard so non-super admins land and dispatch via app/admin/page.tsx.
  { pattern: '/admin/growth',              rule: { kind: 'permission', slug: 'monitor.liveops' } },
  { pattern: '/admin/money',               rule: { kind: 'permission', slug: 'monitor.revenue' } },
  { pattern: '/admin/pricing',             rule: { kind: 'permission', slug: 'monitor.pricing' } },
  { pattern: '/admin/schedule',            rule: { kind: 'permission', slug: 'monitor.schedules' } },

  // ── ACT ─────────────────────────────────────────────────────────────
  { pattern: '/admin/support',             rule: { kind: 'permission', slug: 'act.support' } },
  { pattern: '/admin/notifications',       rule: { kind: 'permission', slug: 'act.notifications' } },
  { pattern: '/admin/disputes',            rule: { kind: 'permission', slug: 'act.disputes' } },
  { pattern: '/admin/safety',              rule: { kind: 'permission', slug: 'act.safety' } }, // includes /admin/safety/archive, /admin/safety/test
  { pattern: '/admin/users',               rule: { kind: 'permission', slug: 'act.users' } },
  { pattern: '/admin/ride-requests',       rule: { kind: 'permission', slug: 'act.rides' } },
  { pattern: '/admin/hmus',                rule: { kind: 'permission', slug: 'act.hmus' } },
  { pattern: '/admin/suspect-usage',       rule: { kind: 'permission', slug: 'act.suspect' } },

  // ── GROW ────────────────────────────────────────────────────────────
  { pattern: '/admin/activation',          rule: { kind: 'permission', slug: 'grow.activation' } },
  { pattern: '/admin/marketing',           rule: { kind: 'permission', slug: 'grow.outreach' } },
  { pattern: '/admin/messages',            rule: { kind: 'permission', slug: 'grow.messages' } },
  { pattern: '/admin/playbook',            rule: { kind: 'permission', slug: 'grow.playbook' } },
  { pattern: '/admin/leads',               rule: { kind: 'permission', slug: 'grow.leads' } },
  { pattern: '/admin/events',              rule: { kind: 'permission', slug: 'grow.events' } },
  { pattern: '/admin/content',             rule: { kind: 'permission', slug: 'grow.content' } }, // includes /calendar, /reference, /trends
  { pattern: '/admin/funnel',              rule: { kind: 'permission', slug: 'grow.funnel' } }, // includes [pageSlug], stages, personas, experiments, flags
  { pattern: '/admin/driver-playbook',     rule: { kind: 'permission', slug: 'grow.fbgroups' } }, // /fb-groups
  { pattern: '/admin/conversation-agent',  rule: { kind: 'permission', slug: 'grow.convagent' } },
  { pattern: '/admin/chat-booking',        rule: { kind: 'permission', slug: 'grow.chatbooking' } },

  // ── RAISE ───────────────────────────────────────────────────────────
  { pattern: '/admin/data-room',           rule: { kind: 'permission', slug: 'raise.dataroom' } },
  { pattern: '/admin/pitch-videos',        rule: { kind: 'permission', slug: 'raise.pitch' } },
  { pattern: '/admin/videos',              rule: { kind: 'permission', slug: 'raise.videos' } },
  { pattern: '/admin/docs',                rule: { kind: 'permission', slug: 'raise.docs' } },

  // ── SYSTEM ──────────────────────────────────────────────────────────
  { pattern: '/admin/roles',               rule: { kind: 'permission', slug: 'admin.roles' } },
  { pattern: '/admin/audit',               rule: { kind: 'permission', slug: 'admin.audit' } },
  { pattern: '/admin/dashboards/manage',   rule: { kind: 'permission', slug: 'admin.dashboards' } }, // builder list — .view sees the list read-only; .edit can create/update/delete (enforced server-side + at the page level)
  { pattern: '/admin/dashboards',          rule: { kind: 'permission', slug: 'admin.dashboards' } }, // viewer landing + /[id]/view grid pages. Per-dashboard grant check happens inside the page.
  { pattern: '/admin/markets',             rule: { kind: 'permission', slug: 'admin.markets' } },
  { pattern: '/admin/feature-flags',       rule: { kind: 'permission', slug: 'admin.flags' } },
  { pattern: '/admin/hmu-config',          rule: { kind: 'permission', slug: 'admin.hmuconfig' } },
  { pattern: '/admin/blast-config',        rule: { kind: 'permission', slug: 'admin.blastconfig' } },
  { pattern: '/admin/onboarding-config',   rule: { kind: 'permission', slug: 'admin.onboarding' } },
  { pattern: '/admin/realtime-notifications', rule: { kind: 'permission', slug: 'admin.banners' } },
  { pattern: '/admin/rider-browse-banner',  rule: { kind: 'permission', slug: 'admin.browsebanner' } },
  { pattern: '/admin/maintenance',         rule: { kind: 'permission', slug: 'admin.maintenance' } },
  { pattern: '/admin/voip-debug',          rule: { kind: 'permission', slug: 'admin.voip' } },
  { pattern: '/admin/sms-templates',       rule: { kind: 'permission', slug: 'admin.smstemplates' } },
  { pattern: '/admin/chill-config',        rule: { kind: 'super' } },

  // ── TOOLS ───────────────────────────────────────────────────────────
  { pattern: '/admin/flows',               rule: { kind: 'permission', slug: 'tools.flows' } }, // includes all flow subroutes

  // /admin/login and /admin/sign-up intentionally omitted: post-auth they
  // shouldn't be navigable, so default-deny is correct. Pre-auth requests
  // never hit this guard (layout redirects to /admin-login).
];

const SORTED_ROUTES = [...ADMIN_ROUTES].sort((a, b) => b.pattern.length - a.pattern.length);

/**
 * Look up the rule for a pathname. Longest-pattern-wins.
 * Returns null for unknown routes (caller decides default-deny semantics).
 */
export function ruleFor(pathname: string): AdminRouteRule | null {
  for (const entry of SORTED_ROUTES) {
    if (pathname === entry.pattern || pathname.startsWith(entry.pattern + '/')) {
      return entry.rule;
    }
  }
  return null;
}

/**
 * Return the permission slug (e.g. `act.support`) gating this href, or null
 * if the route is public, super-only, or unmapped. Used by the sidebar and
 * search palette to display permission badges and to filter visible items.
 */
export function permissionSlugForHref(href: string): string | null {
  const rule = ruleFor(href);
  if (!rule || rule.kind !== 'permission') return null;
  return rule.slug;
}

/**
 * Generic access check. Caller provides isSuper + a hasPermission function so
 * this works in both server (lib/admin/helpers.ts) and client (auth context)
 * contexts. Unknown routes fail closed — only super admins can reach them,
 * which is intentional: forgetting to register a route never silently exposes
 * it to the wrong role.
 */
export function canAccess(
  pathname: string,
  isSuper: boolean,
  hasPerm: (perm: string) => boolean,
): boolean {
  // Super always wins — they see every admin route regardless of rule.
  if (isSuper) return true;
  const rule = ruleFor(pathname);
  // Unknown route → default-deny (only super reaches this branch is_super
  // = false here so we return false). Forgetting an entry fails closed.
  if (!rule) return false;
  if (rule.kind === 'super') return false;
  return hasPerm(`${rule.slug}.view`);
}
