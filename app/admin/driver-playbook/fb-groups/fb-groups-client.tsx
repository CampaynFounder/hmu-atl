'use client';

import { useState } from 'react';

interface SerializedGroup {
  id: string;
  market_slug: string;
  name: string;
  url: string;
  audience: string | null;
  suggested_caption: string | null;
  why_this_group: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialGroups: SerializedGroup[];
}

const EMPTY_DRAFT = {
  market_slug: 'atl',
  name: '',
  url: '',
  audience: '',
  suggested_caption: '',
  why_this_group: '',
  sort_order: 0,
  is_active: true,
};

type Draft = typeof EMPTY_DRAFT;

function groupToDraft(g: SerializedGroup): Draft {
  return {
    market_slug: g.market_slug,
    name: g.name,
    url: g.url,
    audience: g.audience ?? '',
    suggested_caption: g.suggested_caption ?? '',
    why_this_group: g.why_this_group ?? '',
    sort_order: g.sort_order,
    is_active: g.is_active,
  };
}

function draftToBody(d: Draft) {
  return {
    market_slug: d.market_slug.trim(),
    name: d.name.trim(),
    url: d.url.trim(),
    audience: d.audience.trim() || null,
    suggested_caption: d.suggested_caption.trim() || null,
    why_this_group: d.why_this_group.trim() || null,
    sort_order: Number(d.sort_order) || 0,
    is_active: d.is_active,
  };
}

export default function FbGroupsClient({ initialGroups }: Props) {
  const [groups, setGroups] = useState<SerializedGroup[]>(initialGroups);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditingId('new');
  }

  function startEdit(g: SerializedGroup) {
    setDraft(groupToDraft(g));
    setEditingId(g.id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    setSaving(true);
    try {
      const body = draftToBody(draft);
      if (!body.market_slug || !body.name || !body.url) {
        setToast('market, name, and URL required');
        setSaving(false);
        return;
      }
      const url = editingId === 'new'
        ? '/api/admin/driver-playbook/fb-groups'
        : `/api/admin/driver-playbook/fb-groups/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        setToast(error || 'Save failed');
        return;
      }
      const { group } = await res.json();
      const serialized: SerializedGroup = {
        ...group,
        created_at: group.created_at,
        updated_at: group.updated_at,
      };
      if (editingId === 'new') {
        setGroups(prev => [...prev, serialized]);
      } else {
        setGroups(prev => prev.map(g => (g.id === editingId ? serialized : g)));
      }
      cancel();
      setToast('Saved');
    } catch {
      setToast('Network error');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2000);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this FB group?')) return;
    const res = await fetch(`/api/admin/driver-playbook/fb-groups/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setGroups(prev => prev.filter(g => g.id !== id));
      setToast('Deleted');
      setTimeout(() => setToast(null), 2000);
    }
  }

  const grouped = groups.reduce((acc, g) => {
    (acc[g.market_slug] ||= []).push(g);
    return acc;
  }, {} as Record<string, SerializedGroup[]>);

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>
            Driver FB Groups
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
            Admin-curated list shown to drivers in the playbook. Per-market.
          </p>
        </div>
        <button
          onClick={startNew}
          disabled={editingId !== null}
          className="px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-40"
          style={{ background: 'var(--admin-accent, #448AFF)', color: 'white' }}
        >
          + New Group
        </button>
      </header>

      {editingId && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        >
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--admin-text)' }}>
            {editingId === 'new' ? 'New FB Group' : 'Edit FB Group'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Market slug">
              <input
                value={draft.market_slug}
                onChange={e => setDraft({ ...draft, market_slug: e.target.value })}
                placeholder="atl"
                className="field-input"
              />
            </Field>
            <Field label="Name">
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="Atlanta Rideshare"
                className="field-input"
              />
            </Field>
            <Field label="URL" full>
              <input
                value={draft.url}
                onChange={e => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://www.facebook.com/groups/..."
                className="field-input"
              />
            </Field>
            <Field label="Audience">
              <input
                value={draft.audience}
                onChange={e => setDraft({ ...draft, audience: e.target.value })}
                placeholder="college, nightlife, neighborhood"
                className="field-input"
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={draft.sort_order}
                onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                className="field-input"
              />
            </Field>
            <Field label="Suggested caption" full>
              <textarea
                value={draft.suggested_caption}
                onChange={e => setDraft({ ...draft, suggested_caption: e.target.value })}
                rows={3}
                placeholder={'"$15 rides from Midtown. HMU with the link below."'}
                className="field-input"
              />
            </Field>
            <Field label="Why this group" full>
              <textarea
                value={draft.why_this_group}
                onChange={e => setDraft({ ...draft, why_this_group: e.target.value })}
                rows={2}
                placeholder="Why this group converts — for driver context"
                className="field-input"
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--admin-text)' }}>
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
              />
              Active
            </label>
            <span className="flex-1" />
            <button onClick={cancel} disabled={saving} className="text-sm text-white/60">Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg"
              style={{ background: '#00E676', color: '#080808' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 && !editingId && (
        <p style={{ color: 'var(--admin-text-secondary)' }}>No groups yet. Tap &quot;New Group&quot; to add one.</p>
      )}

      {Object.entries(grouped).map(([market, list]) => (
        <section key={market} className="mb-8">
          <h2 className="text-[10px] font-bold tracking-[3px] mb-3" style={{ color: 'var(--admin-text-faint)' }}>
            {market.toUpperCase()}
          </h2>
          <div className="space-y-2">
            {list.map(g => (
              <div
                key={g.id}
                className="rounded-lg p-4 flex items-start gap-3"
                style={{
                  background: 'var(--admin-bg-elevated)',
                  border: '1px solid var(--admin-border)',
                  opacity: g.is_active ? 1 : 0.5,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm" style={{ color: 'var(--admin-text)' }}>
                      {g.name}
                    </span>
                    {!g.is_active && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-muted)' }}>
                        Inactive
                      </span>
                    )}
                    {g.audience && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(68,138,255,0.12)', color: '#448AFF' }}>
                        {g.audience}
                      </span>
                    )}
                  </div>
                  <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline truncate block">
                    {g.url}
                  </a>
                  {g.suggested_caption && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--admin-text-secondary)' }}>
                      {g.suggested_caption}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => startEdit(g)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--admin-text-secondary)' }}>Edit</button>
                  <button onClick={() => remove(g.id)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--admin-danger, #FF5252)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        .field-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 14px;
          border-radius: 8px;
          background: var(--admin-bg);
          border: 1px solid var(--admin-border);
          color: var(--admin-text);
          outline: none;
        }
        .field-input:focus {
          border-color: var(--admin-accent, #448AFF);
        }
      `}</style>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}
