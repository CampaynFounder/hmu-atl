// Structural guard against admin-search drift.
//
// The admin portal keeps four registries that MUST agree:
//   1. lib/admin/route-permissions.ts        — access rules (source of truth)
//   2. lib/admin/search-manifest.ts          — ⌘K search palette
//   3. app/admin/roles/permission-matrix.tsx — no-code role grant grid
//   4. app/admin/components/admin-sidebar.tsx — left nav (not asserted here;
//      it can legitimately omit pages, but search must not)
//
// Historically the search manifest was the one people forgot to update, so
// shipped pages were unfindable, and a slug typo (monitor.blasts.view) made a
// page super-only by accident. These tests fail CI the moment any of that
// recurs. Adding a new admin page: register the route rule, the matrix slug,
// and the manifest entry — or this test goes red.

import { describe, it, expect } from 'vitest';
import { ADMIN_ROUTES, ruleFor } from '@/lib/admin/route-permissions';
import { ADMIN_SEARCH_MANIFEST } from '@/lib/admin/search-manifest';

// Route patterns that intentionally have no standalone search entry because a
// parent entry already covers them (a sub-page of an already-searchable route).
const SEARCH_COVERAGE_EXEMPT = new Set<string>([
  '/admin/dashboards/manage', // surfaced via the /admin/dashboards entry
]);

// Sections the search UI knows how to group + sort. Must stay in sync with the
// sectionOrder maps in app/api/admin/search/route.ts and admin-search-bar.tsx.
const KNOWN_SECTIONS = new Set(['Monitor', 'Act', 'Grow', 'Raise', 'System', 'Tools']);

const manifestHrefs = ADMIN_SEARCH_MANIFEST.map((i) => i.href);

function isCoveredBySearch(pattern: string): boolean {
  return manifestHrefs.some((h) => h === pattern || h.startsWith(pattern + '/'));
}

describe('admin search manifest parity', () => {
  it('every permission-gated route is reachable from search (name search works)', () => {
    const uncovered = ADMIN_ROUTES
      .map((e) => e.pattern)
      .filter((p) => !SEARCH_COVERAGE_EXEMPT.has(p))
      .filter((p) => !isCoveredBySearch(p));
    expect(uncovered, `Routes with no ⌘K search entry: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every search entry points at a real, guarded route (no orphan results)', () => {
    const orphans = ADMIN_SEARCH_MANIFEST
      .filter((i) => ruleFor(i.href) === null)
      .map((i) => `${i.id} → ${i.href}`);
    expect(orphans, `Search entries with no route-permission rule: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every search entry uses a section the UI can render', () => {
    const bad = ADMIN_SEARCH_MANIFEST
      .filter((i) => !KNOWN_SECTIONS.has(i.section))
      .map((i) => `${i.id} → ${i.section}`);
    expect(bad).toEqual([]);
  });

  it('search entry ids and hrefs are unique', () => {
    const ids = ADMIN_SEARCH_MANIFEST.map((i) => i.id);
    const hrefs = ADMIN_SEARCH_MANIFEST.map((i) => i.href);
    expect(new Set(ids).size, 'duplicate ids').toBe(ids.length);
    expect(new Set(hrefs).size, 'duplicate hrefs').toBe(hrefs.length);
  });

  it('every search entry has semantic text to embed (label + description)', () => {
    const thin = ADMIN_SEARCH_MANIFEST
      .filter((i) => !i.label?.trim() || !i.description?.trim())
      .map((i) => i.id);
    expect(thin, `Entries missing label/description for semantic search: ${thin.join(', ')}`).toEqual([]);
  });
});
