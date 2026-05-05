'use client';

// Builder form for creating or editing a dashboard. Same component for both
// — pass `mode='create'` or `mode='edit'` plus optional initial values. No
// drag-and-drop in v1 (Phase 3); reorder via up/down buttons. No schema-aware
// config UI; per-block config is a JSON textarea seeded with defaultConfig.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BlockMetadata {
  key: string;
  label: string;
  description: string;
  scope: 'user' | 'market' | 'global';
  marketAware: boolean;
  marketScope: 'viewed_user' | 'admin_active' | 'admin_all_allowed';
  defaultConfig: unknown;
  deprecated: boolean;
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

interface BlockRow {
  block_key: string;
  config: string;       // JSON string for the textarea
  col_span: number;
}

export interface DashboardFormInitial {
  id?: string;
  slug?: string;
  label?: string;
  description?: string | null;
  scope?: 'user_detail' | 'market_overview';
  market_id?: string | null;
  blocks?: BlockRow[];
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
  const [scope, setScope] = useState<'user_detail' | 'market_overview'>(initial?.scope ?? 'user_detail');
  const [marketId, setMarketId] = useState<string | null>(initial?.market_id ?? null);
  const [blocks, setBlocks] = useState<BlockRow[]>(initial?.blocks ?? []);
  const [roleIds, setRoleIds] = useState<string[]>(initial?.role_ids ?? []);

  const [registry, setRegistry] = useState<BlockMetadata[]>([]);
  const [markets, setMarkets] = useState<MarketLite[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [adding, setAdding] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/dashboards/blocks').then((r) => r.ok ? r.json() : { blocks: [] }),
      fetch('/api/admin/markets').then((r) => r.ok ? r.json() : { markets: [] }),
      fetch('/api/admin/roles').then((r) => r.ok ? r.json() : { roles: [] }),
    ]).then(([b, m, ro]) => {
      setRegistry(b.blocks ?? []);
      setMarkets(m.markets ?? []);
      setRoles((ro.roles ?? []).filter((r: RoleLite) => !r.is_super));
    });
  }, []);

  const eligibleRegistry = useMemo(() => {
    const wantScope = scope === 'user_detail' ? 'user' : 'market';
    return registry.filter((b) => !b.deprecated && (b.scope === wantScope || b.scope === 'global'));
  }, [registry, scope]);

  function addBlock() {
    if (!adding) return;
    const def = registry.find((b) => b.key === adding);
    if (!def) return;
    setBlocks([
      ...blocks,
      { block_key: def.key, config: JSON.stringify(def.defaultConfig ?? {}, null, 2), col_span: 12 },
    ]);
    setAdding('');
  }

  function moveBlock(idx: number, delta: -1 | 1) {
    const next = [...blocks];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
  }

  function removeBlock(idx: number) {
    setBlocks(blocks.filter((_, i) => i !== idx));
  }

  function patchBlock(idx: number, patch: Partial<BlockRow>) {
    setBlocks(blocks.map((b, i) => i === idx ? { ...b, ...patch } : b));
  }

  function toggleRole(id: string) {
    setRoleIds(roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id]);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    // Parse each block's config from JSON. Surface the first parse failure.
    const parsedBlocks: { block_key: string; config: Record<string, unknown>; col_span: number }[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      try {
        const cfg = b.config.trim() === '' ? {} : JSON.parse(b.config);
        parsedBlocks.push({ block_key: b.block_key, config: cfg, col_span: b.col_span });
      } catch (e) {
        setSubmitting(false);
        setError(`Block #${i + 1} (${b.block_key}) config is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    const body: Record<string, unknown> = {
      label,
      description: description || null,
      market_id: marketId || null,
      blocks: parsedBlocks,
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
      router.push('/admin/dashboards');
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
      {/* Identity */}
      <Section title="Identity">
        <Field label="Label">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Support: user overview"
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
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
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
          />
        </Field>
        <Field label="Scope" hint={mode === 'edit' ? 'scope is fixed once created' : undefined}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            disabled={mode === 'edit'}
            className="w-full text-sm px-2 py-1.5 rounded outline-none disabled:opacity-50"
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
          >
            <option value="user_detail">user_detail (bound to one user)</option>
            <option value="market_overview">market_overview (aggregate)</option>
          </select>
        </Field>
        <Field label="Market binding" hint="Leave blank to make available across all markets.">
          <select
            value={marketId ?? ''}
            onChange={(e) => setMarketId(e.target.value || null)}
            className="w-full text-sm px-2 py-1.5 rounded outline-none"
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
          >
            <option value="">All markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Blocks */}
      <Section title={`Blocks (${blocks.length})`}>
        {blocks.length === 0 && (
          <p className="text-xs mb-3" style={{ color: 'var(--admin-text-muted)' }}>
            Add at least one block. Order here is the render order.
          </p>
        )}
        <div className="space-y-2 mb-3">
          {blocks.map((b, i) => {
            const def = registry.find((d) => d.key === b.block_key);
            return (
              <div
                key={i}
                className="rounded p-3"
                style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-bg)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--admin-text)' }}>
                    {i + 1}. {def?.label ?? b.block_key}
                  </span>
                  <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {b.block_key}
                  </code>
                  <div className="flex-1" />
                  <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0}
                          className="text-xs px-1.5 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}
                          className="text-xs px-1.5 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeBlock(i)}
                          className="text-xs px-1.5" style={{ color: '#f87171' }}>remove</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
                      col_span
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={b.col_span}
                      onChange={(e) => patchBlock(i, { col_span: Math.max(1, Math.min(12, Number(e.target.value) || 12)) })}
                      className="w-full text-xs px-2 py-1 rounded outline-none"
                      style={{
                        background: 'var(--admin-bg-elevated)',
                        color: 'var(--admin-text)',
                        border: '1px solid var(--admin-border)',
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--admin-text-muted)' }}>
                      config (JSON)
                    </label>
                    <textarea
                      rows={3}
                      value={b.config}
                      onChange={(e) => patchBlock(i, { config: e.target.value })}
                      className="w-full text-[11px] font-mono px-2 py-1 rounded outline-none"
                      style={{
                        background: 'var(--admin-bg-elevated)',
                        color: 'var(--admin-text)',
                        border: '1px solid var(--admin-border)',
                      }}
                    />
                  </div>
                </div>
                {def?.description && (
                  <p className="text-[10px] mt-2" style={{ color: 'var(--admin-text-muted)' }}>
                    {def.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded outline-none"
            style={{
              background: 'var(--admin-bg)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
          >
            <option value="">Add block…</option>
            {eligibleRegistry.map((b) => (
              <option key={b.key} value={b.key}>{b.label} ({b.key})</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addBlock}
            disabled={!adding}
            className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
            style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            Add
          </button>
        </div>
      </Section>

      {/* Role grants */}
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

      {/* Submit / delete */}
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
          disabled={submitting || !label || (mode === 'create' && !slug) || blocks.length === 0}
          className="text-sm px-4 py-2 rounded font-medium disabled:opacity-50"
          style={{ background: '#60a5fa', color: 'white' }}
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create dashboard' : 'Save changes'}
        </button>
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
