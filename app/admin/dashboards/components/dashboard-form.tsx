'use client';

// Builder for creating or editing a dashboard. Same component for both —
// pass `mode='create'` or `mode='edit'` plus optional initial values.
//
// Composition model: a dashboard has 1..n sections; each section has a
// label, col_span, and an ordered list of field keys picked from a
// searchable palette. Engineers register fields in
// lib/admin/dashboards/fields/registry.ts; superadmin assembles them here.
// No drag-and-drop in v1 (Phase 3); reorder via up/down buttons.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GridColumnBuilder } from './grid-column-builder';

interface FieldMetadata {
  key: string;
  label: string;
  category: string;
  description?: string;
  applies_to: ('rider' | 'driver' | 'admin' | 'any')[];
  render: 'stat' | 'badge' | 'flag' | 'list';
  marketAware: boolean;
  deprecated: boolean;
  gridable: boolean;
}

interface MarketLite {
  id: string;
  name: string;
  status: string;
}

interface RoleLite {
  id: string;
  slug: string;
  label: string;
  is_super: boolean;
}

interface SectionRow {
  label: string;
  field_keys: string[];
  col_span: number;
}

export interface DashboardFormInitial {
  id?: string;
  slug?: string;
  label?: string;
  description?: string | null;
  scope?: 'user_detail' | 'market_overview' | 'user_grid';
  market_id?: string | null;
  sections?: SectionRow[];
  role_ids?: string[];
}

export function DashboardForm({
  mode,
  initial,
}: {
  mode: 'create' | 'edit';
  initial?: DashboardFormInitial;
}) {
  const router = useRouter();

  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<'user_detail' | 'market_overview' | 'user_grid'>(initial?.scope ?? 'user_grid');
  const [marketId, setMarketId] = useState<string | null>(initial?.market_id ?? null);
  const [sections, setSections] = useState<SectionRow[]>(
    initial?.sections ?? [{ label: '', field_keys: [], col_span: 12 }],
  );
  const [roleIds, setRoleIds] = useState<string[]>(initial?.role_ids ?? []);

  const [fieldRegistry, setFieldRegistry] = useState<FieldMetadata[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [markets, setMarkets] = useState<MarketLite[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-save status (edit mode only).
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/dashboards/fields').then((r) => r.ok ? r.json() : { fields: [], categories: [] }),
      fetch('/api/admin/markets').then((r) => r.ok ? r.json() : { markets: [] }),
      fetch('/api/admin/roles').then((r) => r.ok ? r.json() : { roles: [] }),
    ]).then(([f, m, ro]) => {
      setFieldRegistry(f.fields ?? []);
      setCategoryOrder(f.categories ?? []);
      setMarkets(m.markets ?? []);
      setRoles((ro.roles ?? []).filter((r: RoleLite) => !r.is_super));
    });
  }, []);

  // Quick lookup for rendering field labels in the section editor.
  const fieldByKey = useMemo(() => {
    const map = new Map<string, FieldMetadata>();
    for (const f of fieldRegistry) map.set(f.key, f);
    return map;
  }, [fieldRegistry]);

  // ─── Auto-save (edit mode only) ────────────────────────────────────────
  // Skip the very first effect run so loading the initial values doesn't
  // immediately PATCH the dashboard. After that, debounce 500ms and PATCH
  // whenever any persisted field changes (label, description, market_id,
  // sections, role_ids). Slug + scope are immutable post-create.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveSkipFirst = useRef(true);
  useEffect(() => {
    if (mode !== 'edit' || !initial?.id) return;
    if (autoSaveSkipFirst.current) {
      autoSaveSkipFirst.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveState('saving');
    autoSaveTimer.current = setTimeout(async () => {
      // Skip if any section is empty — server rejects, and the user is
      // probably mid-edit. Surface as 'idle' to avoid alarm.
      if (sections.some((s) => s.field_keys.length === 0)) {
        setAutoSaveState('idle');
        return;
      }
      try {
        const res = await fetch(`/api/admin/dashboards/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label,
            description: description || null,
            market_id: marketId || null,
            sections: sections.map((s) => ({
              label: s.label.trim() === '' ? null : s.label,
              field_keys: s.field_keys,
              col_span: s.col_span,
            })),
            role_ids: roleIds,
          }),
        });
        setAutoSaveState(res.ok ? 'saved' : 'error');
        // Reset to idle after a moment so the badge isn't permanently green.
        if (res.ok) setTimeout(() => setAutoSaveState('idle'), 1200);
      } catch {
        setAutoSaveState('error');
      }
    }, 500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, description, marketId, sections, roleIds]);

  function addSection() {
    setSections([...sections, { label: '', field_keys: [], col_span: 12 }]);
  }

  function moveSection(idx: number, delta: -1 | 1) {
    const next = [...sections];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
  }

  function removeSection(idx: number) {
    setSections(sections.filter((_, i) => i !== idx));
  }

  function patchSection(idx: number, patch: Partial<SectionRow>) {
    setSections(sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function toggleFieldInSection(idx: number, key: string) {
    const s = sections[idx];
    const has = s.field_keys.includes(key);
    patchSection(idx, {
      field_keys: has ? s.field_keys.filter((k) => k !== key) : [...s.field_keys, key],
    });
  }

  function moveFieldInSection(idx: number, fieldIdx: number, delta: -1 | 1) {
    const s = sections[idx];
    const next = [...s.field_keys];
    const target = fieldIdx + delta;
    if (target < 0 || target >= next.length) return;
    [next[fieldIdx], next[target]] = [next[target], next[fieldIdx]];
    patchSection(idx, { field_keys: next });
  }

  function toggleRole(id: string) {
    setRoleIds(roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id]);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    if (sections.some((s) => s.field_keys.length === 0)) {
      setSubmitting(false);
      setError(scope === 'user_grid' ? 'Add at least one column.' : 'Each section needs at least one field.');
      return;
    }

    const body: Record<string, unknown> = {
      label,
      description: description || null,
      market_id: marketId || null,
      sections: sections.map((s) => ({
        label: s.label.trim() === '' ? null : s.label,
        field_keys: s.field_keys,
        col_span: s.col_span,
      })),
      role_ids: roleIds,
    };
    if (mode === 'create') {
      body.slug = slug;
      body.scope = scope;
    }

    const url = mode === 'create' ? '/api/admin/dashboards' : `/api/admin/dashboards/${initial?.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      router.push('/admin/dashboards/manage');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  async function deleteDashboard() {
    if (mode !== 'edit' || !initial?.id) return;
    if (!confirm('Delete this dashboard? This cannot be undone.')) return;
    setSubmitting(true);
    const res = await fetch(`/api/admin/dashboards/${initial.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Delete failed (${res.status})`);
      setSubmitting(false);
      return;
    }
    router.push('/admin/dashboards');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="Identity">
        <Field label="Label">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Support: user overview"
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={inputStyle}
          />
        </Field>
        <Field label="Slug" hint={mode === 'edit' ? 'slug is fixed once created' : 'kebab-case, 3–64 chars'}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={mode === 'edit'}
            placeholder="support-user-overview"
            className="w-full text-sm px-2 py-1.5 rounded outline-none disabled:opacity-50"
            style={inputStyle}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={inputStyle}
          />
        </Field>
        <Field label="Scope" hint={mode === 'edit' ? 'scope is fixed once created' : undefined}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            disabled={mode === 'edit'}
            className="w-full text-sm px-2 py-1.5 rounded outline-none disabled:opacity-50"
            style={inputStyle}
          >
            <option value="user_grid">user_grid (table — rows of users, columns of fields)</option>
            <option value="user_detail">user_detail (one user, fact sheet)</option>
            <option value="market_overview">market_overview (aggregate)</option>
          </select>
        </Field>
        <Field label="Market binding" hint="Leave blank to make available across all markets.">
          <select
            value={marketId ?? ''}
            onChange={(e) => setMarketId(e.target.value || null)}
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={inputStyle}
          >
            <option value="">All markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
            ))}
          </select>
        </Field>
      </Section>

      {scope === 'user_grid' ? (
        <GridColumnBuilder
          fieldKeys={sections[0]?.field_keys ?? []}
          onChange={(next) => {
            // Grid stores everything in a single section; collapse if more than 1.
            setSections([{ label: sections[0]?.label ?? '', field_keys: next, col_span: 12 }]);
          }}
          registry={fieldRegistry}
          categoryOrder={categoryOrder}
        />
      ) : (
        <Section title={`Sections (${sections.length})`}>
          <p className="text-xs mb-3" style={{ color: 'var(--admin-text-muted)' }}>
            A section groups fields under one label. Pick fields from the palette below each section.
          </p>
          <div className="space-y-3 mb-3">
            {sections.map((s, i) => (
              <SectionEditor
                key={i}
                index={i}
                section={s}
                registry={fieldRegistry}
                categoryOrder={categoryOrder}
                fieldByKey={fieldByKey}
                isFirst={i === 0}
                isLast={i === sections.length - 1}
                scope={scope}
                onMove={(d) => moveSection(i, d)}
                onRemove={() => removeSection(i)}
                onPatch={(p) => patchSection(i, p)}
                onToggleField={(k) => toggleFieldInSection(i, k)}
                onMoveField={(fi, d) => moveFieldInSection(i, fi, d)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addSection}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            + Add section
          </button>
        </Section>
      )}

      <Section title={`Role grants (${roleIds.length})`}>
        <p className="text-xs mb-3" style={{ color: 'var(--admin-text-muted)' }}>
          Super admins always see every dashboard. Pick which non-super roles can view this one.
        </p>
        {roles.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>No non-super roles defined.</p>
        )}
        <div className="space-y-1.5">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={roleIds.includes(r.id)}
                onChange={() => toggleRole(r.id)}
              />
              <span style={{ color: 'var(--admin-text)' }}>{r.label}</span>
              <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{r.slug}</code>
            </label>
          ))}
        </div>
      </Section>

      {error && (
        <div
          className="rounded p-3 text-xs"
          style={{ background: 'rgba(248, 113, 113, 0.08)', color: '#f87171', border: '1px solid var(--admin-border)' }}
        >
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !label || (mode === 'create' && !slug) || sections.length === 0}
          className="text-sm px-4 py-2 rounded font-medium disabled:opacity-50"
          style={{ background: '#60a5fa', color: 'white' }}
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create dashboard' : 'Done'}
        </button>
        {mode === 'edit' && <AutoSaveBadge state={autoSaveState} />}
        <div className="flex-1" />
        {mode === 'edit' && (
          <button
            type="button"
            onClick={deleteDashboard}
            disabled={submitting}
            className="text-xs px-3 py-2 rounded"
            style={{ color: '#f87171', border: '1px solid var(--admin-border)' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function SectionEditor({
  index,
  section,
  registry,
  categoryOrder,
  fieldByKey,
  isFirst,
  isLast,
  scope,
  onMove,
  onRemove,
  onPatch,
  onToggleField,
  onMoveField,
}: {
  index: number;
  section: SectionRow;
  registry: FieldMetadata[];
  categoryOrder: string[];
  fieldByKey: Map<string, FieldMetadata>;
  isFirst: boolean;
  isLast: boolean;
  scope: 'user_detail' | 'market_overview' | 'user_grid';
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (patch: Partial<SectionRow>) => void;
  onToggleField: (key: string) => void;
  onMoveField: (fieldIdx: number, delta: -1 | 1) => void;
}) {
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = registry.filter((f) => {
      if (f.deprecated) return false;
      if (scope === 'user_grid' && !f.gridable) return false;
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q)
      );
    });
    const byCat = new Map<string, FieldMetadata[]>();
    for (const f of filtered) {
      const arr = byCat.get(f.category) ?? [];
      arr.push(f);
      byCat.set(f.category, arr);
    }
    const order = categoryOrder.length > 0 ? categoryOrder : Array.from(byCat.keys());
    return order
      .filter((c) => byCat.has(c))
      .map((c) => ({ category: c, fields: byCat.get(c)! }));
  }, [registry, categoryOrder, search, scope]);

  const selected = new Set(section.field_keys);

  return (
    <div
      className="rounded p-3"
      style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-bg)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--admin-text)' }}>
          {index + 1}. Section
        </span>
        <div className="flex-1" />
        <button type="button" onClick={() => onMove(-1)} disabled={isFirst}
                className="text-xs px-1.5 disabled:opacity-30">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={isLast}
                className="text-xs px-1.5 disabled:opacity-30">↓</button>
        <button type="button" onClick={onRemove}
                className="text-xs px-1.5" style={{ color: '#f87171' }}>remove</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
            label
          </label>
          <input
            type="text"
            value={section.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="(optional, e.g. Identity)"
            className="w-full text-sm px-2 py-1 rounded outline-none"
            style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          />
        </div>
        <div className="sm:col-span-1">
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
            col_span (1–12)
          </label>
          <input
            type="number"
            min={1}
            max={12}
            value={section.col_span}
            onChange={(e) => onPatch({ col_span: Math.max(1, Math.min(12, Number(e.target.value) || 12)) })}
            className="w-full text-sm px-2 py-1 rounded outline-none"
            style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          />
        </div>
      </div>

      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
          fields ({section.field_keys.length})
        </label>
        {section.field_keys.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
            No fields yet — pick from the palette below.
          </p>
        ) : (
          <ul className="space-y-1">
            {section.field_keys.map((key, fi) => {
              const f = fieldByKey.get(key);
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  <span className="opacity-50 w-4">{fi + 1}.</span>
                  <span style={{ color: 'var(--admin-text)' }}>{f?.label ?? key}</span>
                  <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{key}</code>
                  <div className="flex-1" />
                  <button type="button" onClick={() => onMoveField(fi, -1)} disabled={fi === 0}
                          className="px-1.5 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => onMoveField(fi, 1)} disabled={fi === section.field_keys.length - 1}
                          className="px-1.5 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => onToggleField(key)}
                          className="px-1.5" style={{ color: '#f87171' }}>×</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="rounded p-2"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fields by name, key, or category…"
          className="w-full text-xs px-2 py-1 rounded outline-none mb-2"
          style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
        />
        <div className="max-h-60 overflow-y-auto space-y-3">
          {grouped.map(({ category, fields }) => (
            <div key={category}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
                {category}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {fields.map((f) => {
                  const checked = selected.has(f.key);
                  return (
                    <label
                      key={f.key}
                      className="flex items-start gap-2 text-[11px] cursor-pointer rounded px-1.5 py-1 hover:bg-black/5"
                      title={f.description}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleField(f.key)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div style={{ color: 'var(--admin-text)' }}>{f.label}</div>
                        <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{f.key}</code>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
              No fields match.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--admin-bg)',
  color: 'var(--admin-text)',
  border: '1px solid var(--admin-border)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
    >
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--admin-text)' }}>{title}</h2>
      {children}
    </div>
  );
}

function AutoSaveBadge({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const map = {
    saving: { text: 'Saving…', color: 'var(--admin-text-muted)' },
    saved:  { text: 'Saved',   color: '#4ade80' },
    error:  { text: 'Save failed', color: '#f87171' },
  } as const;
  const { text, color } = map[state];
  return (
    <span className="text-[11px]" style={{ color }}>
      {text}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] mt-1" style={{ color: 'var(--admin-text-muted)' }}>{hint}</p>
      )}
    </div>
  );
}
