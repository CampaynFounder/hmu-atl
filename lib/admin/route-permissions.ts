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
// Rule kinds:
//   { kind: 'public' }                    → any admin
//   { kind: 'permission'; slug: 'x.y' }   → requires hasPermission('x.y.view')
//                                           (the matrix's `x.y.edit` and
//                                           `x.y.publish` imply view)
//   { kind: 'super' }                     → super admins only
//
// Route matching: longest-pattern-wins. `/admin/safety/archive` matches
// `/admin/safety` before `/admin`. Unknown routes default-deny (super only),
// so forgetting an entry fails closed, never open.

import type { AdminUser } from './helpers';
import { hasPermission } from './helpers';

export type AdminRouteRule =
  | { kind: 'public' }
  | { kind: 'permission'; slug: string }
  | { kind: 'super' };

export interface AdminRouteEntry {
  pattern: string;
  rule: AdminRouteRule;
}

export const ADMIN_ROUTES: AdminRouteEntry[] = [
  // ── MONITOR ─────────────────────────────────────────────────────────
  { pattern: '/admin',                     rule: { kind: 'public' } }, // live ops home
  { pattern: '/admin/growth',              rule: { kind: 'permission', slug: 'monitor.liveops' } },
  { pattern: '/admin/money',               rule: { kind: 'permission', slug: 'monitor.revenue' } },
  { pattern: '/admin/pricing',             rule: { kind: 'permission', slug: 'monitor.pricing' } },
  { pattern: '/admin/schedule',            rule: { kind: 'permission', slug: 'monitor.schedules' } },

  // ── ACT ─────────────────────────────────────────────────────────────
  { pattern: '/admin/support',             rule: { kind: 'permission', slug: 'act.support' } },
  { pattern: '/admin/notifications',       rule: { kind: 'permission', slug: 'act.notifications' } },
  { pattern: '/admin/disputes',            rule: { kind: 'permission', slug: 'act.disputes' } },
  { pattern: '/admin/safety',              rule: { kind: 'super' } }, // includes /admin/safety/archive, /admin/safety/test
  { pattern: '/admin/users',               rule: { kind: 'permission', slug: 'act.users' } },
  { pattern: '/admin/ride-requests',       rule: { kind: 'super' } },
  { pattern: '/admin/hmus',                rule: { kind: 'super' } },
  { pattern: '/admin/suspect-usage',       rule: { kind: 'permission', slug: 'act.suspect' } },

  // ── GROW ────────────────────────────────────────────────────────────
  { pattern: '/admin/activation',          rule: { kind: 'public' } },
  { pattern: '/admin/marketing',           rule: { kind: 'permission', slug: 'grow.outreach' } },
  { pattern: '/admin/messages',            rule: { kind: 'permission', slug: 'grow.messages' } },
  { pattern: '/admin/playbook',            rule: { kind: 'permission', slug: 'grow.playbook' } },
  { pattern: '/admin/leads',               rule: { kind: 'permission', slug: 'grow.leads' } },
  { pattern: '/admin/content',             rule: { kind: 'permission', slug: 'grow.content' } }, // includes /calendar, /reference, /trends
  { pattern: '/admin/funnel',              rule: { kind: 'permission', slug: 'grow.funnel' } }, // includes [pageSlug], stages, personas, experiments, flags
  { pattern: '/admin/driver-playbook',     rule: { kind: 'super' } }, // /fb-groups
  { pattern: '/admin/conversation-agent',  rule: { kind: 'super' } },
  { pattern: '/admin/chat-booking',        rule: { kind: 'super' } },

  // ── RAISE ───────────────────────────────────────────────────────────
  { pattern: '/admin/data-room',           rule: { kind: 'permission', slug: 'raise.dataroom' } },
  { pattern: '/admin/pitch-videos',        rule: { kind: 'permission', slug: 'raise.pitch' } },
  { pattern: '/admin/videos',              rule: { kind: 'permission', slug: 'raise.videos' } },
  { pattern: '/admin/docs',                rule: { kind: 'permission', slug: 'raise.docs' } },

  // ── SYSTEM ──────────────────────────────────────────────────────────
  { pattern: '/admin/roles',               rule: { kind: 'permission', slug: 'admin.roles' } },
  { pattern: '/admin/audit',               rule: { kind: 'permission', slug: 'admin.audit' } },
  { pattern: '/admin/markets',             rule: { kind: 'super' } },
  { pattern: '/admin/feature-flags',       rule: { kind: 'super' } },
  { pattern: '/admin/hmu-config',          rule: { kind: 'super' } },
  { pattern: '/admin/onboarding-config',   rule: { kind: 'super' } },
  { pattern: '/admin/realtime-notifications', rule: { kind: 'super' } },
  { pattern: '/admin/maintenance',         rule: { kind: 'super' } },
  { pattern: '/admin/voip-debug',          rule: { kind: 'super' } },
  { pattern: '/admin/chill-config',        rule: { kind: 'super' } },

  // ── TOOLS ───────────────────────────────────────────────────────────
  { pattern: '/admin/flows',               rule: { kind: 'permission', slug: 'tools.flows' } }, // includes all flow subroutes

  // Auth pages — reachable only after the layout's is_admin gate, so safe
  // to leave open to any admin.
  { pattern: '/admin/login',               rule: { kind: 'public' } },
  { pattern: '/admin/sign-up',             rule: { kind: 'public' } },
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
  const rule = ruleFor(pathname);
  if (!rule) return isSuper;
  if (rule.kind === 'public') return true;
  if (rule.kind === 'super') return isSuper;
  return hasPerm(`${rule.slug}.view`);
}

/**
 * Server-side wrapper around `canAccess`. Pass an `AdminUser` (the swapped
 * effective identity from `applyPreviewSwap`, not the real one).
 */
export function canAccessRoute(admin: AdminUser, pathname: string): boolean {
  return canAccess(pathname, admin.is_super, (p) => hasPermission(admin, p));
}
