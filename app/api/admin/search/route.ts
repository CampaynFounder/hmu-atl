// GET /api/admin/search?q=… — fuzzy search across the admin manifest, scoped
// to the caller's permissions. Filters BEFORE the fuzzy match so a non-super
// admin's bundle never carries the existence of restricted routes back to the
// client.
//
// Response: { results: [{ id, label, href, section, icon }, ...] } — top 8.
// Empty `q` returns a curated default list (visible items, alphabetical by
// section + label) so the palette has something to show on first focus.

import { NextRequest, NextResponse } from 'next/server';
import Fuse from 'fuse.js';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import { ADMIN_SEARCH_MANIFEST, type AdminSearchItem } from '@/lib/admin/search-manifest';

const MAX_RESULTS = 8;

// Server-shape we return — strip `keywords` and `permission` so we don't leak
// internal slugs to the client. (Permission is already used to filter; the
// list the client gets is by definition the items they can see.)
interface ApiResultItem {
  id: string;
  label: string;
  description: string;
  href: string;
  section: string;
  icon: string;
}

function toApi(item: AdminSearchItem): ApiResultItem {
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    href: item.href,
    section: item.section,
    icon: item.icon,
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  // Permission filter first: items without a `permission` are visible to all
  // admins; items with one require `permission + '.view'` (matches the
  // sidebar's gating exactly so search ⇄ sidebar stay in sync).
  const visible = ADMIN_SEARCH_MANIFEST.filter((item) =>
    !item.permission || hasPermission(admin, `${item.permission}.view`),
  );

  if (!q) {
    // No query — return the visible set sorted by section then label so the
    // palette can show a useful "browse" view on first focus.
    const sectionOrder: Record<string, number> = {
      Monitor: 0, Act: 1, Grow: 2, Raise: 3, System: 4,
    };
    const sorted = [...visible].sort((a, b) => {
      const s = sectionOrder[a.section] - sectionOrder[b.section];
      return s !== 0 ? s : a.label.localeCompare(b.label);
    });
    return NextResponse.json({ results: sorted.map(toApi) });
  }

  // Fuse weights: label dominates, then keywords, then section. Threshold
  // tuned for an inventory of ~30 items — too tight and "outreach" doesn't
  // match "marketing"; too loose and short queries hit too much.
  const fuse = new Fuse(visible, {
    keys: [
      { name: 'label', weight: 0.6 },
      { name: 'keywords', weight: 0.35 },
      { name: 'section', weight: 0.05 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(q).slice(0, MAX_RESULTS).map((r) => toApi(r.item));
  return NextResponse.json({ results });
}
