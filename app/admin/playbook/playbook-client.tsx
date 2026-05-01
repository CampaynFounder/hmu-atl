'use client';

import { useEffect, useMemo, useState } from 'react';
import { chunkSms } from '@/lib/sms/chunk';
import type { PlaybookAudience, PlaybookEntry } from '@/lib/admin/playbook';

type AudienceFilter = PlaybookAudience | 'all';
type StatusFilter = 'active' | 'inactive' | 'all';

interface Props {
  initialEntries: PlaybookEntry[];
}

const EMPTY_DRAFT = {
  title: '',
  question_text: '',
  answer_body: '',
  audience: 'any' as PlaybookAudience,
  priority: 0,
  is_active: true,
};

export default function PlaybookClient({ initialEntries }: Props) {
  const [entries, setEntries] = useState<PlaybookEntry[]>(initialEntries);
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PlaybookEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = async (
    next: { audience?: AudienceFilter; status?: StatusFilter; search?: string } = {},
  ) => {
    const params = new URLSearchParams();
    const a = next.audience ?? audience;
    const s = next.status ?? status;
    const q = next.search ?? search;
    if (a !== 'all') params.set('audience', a);
    if (s !== 'all') params.set('status', s);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/admin/playbook?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
    }
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, status]);

  // Debounce search by 200ms — typing one char/refetch is wasteful.
  useEffect(() => {
    const t = setTimeout(() => refetch({ search }), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Response Playbook</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Drives the suggestions admins see inside /admin/messages.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-[#00E676] hover:bg-[#00C864] text-black font-semibold text-sm px-4 py-2 rounded-full transition-colors"
        >
          + New entry
        </button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <Pills
          label="Audience"
          value={audience}
          onChange={(v) => setAudience(v as AudienceFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'driver', label: 'Driver' },
            { value: 'rider', label: 'Rider' },
            { value: 'any', label: 'Any' },
          ]}
        />
        <Pills
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, question, or answer…"
          className="flex-1 min-w-[240px] bg-neutral-900 border border-neutral-800 rounded-full px-4 py-2 text-sm text-white placeholder:text-neutral-600"
        />
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_60px_60px_80px_auto] gap-3 px-4 py-2 border-b border-neutral-800 text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase">
          <div>Title</div>
          <div>Audience</div>
          <div>Chunks</div>
          <div>Used</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            No entries match these filters.
          </div>
        ) : (
          entries.map((e) => {
            const chunkCount = chunkSms(e.answer_body).length;
            return (
              <div
                key={e.id}
                className="grid grid-cols-[1fr_80px_60px_60px_80px_auto] gap-3 px-4 py-3 border-b border-neutral-800/50 hover:bg-white/[0.02] items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{e.title}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{e.question_text}</div>
                </div>
                <div className="text-[11px] text-neutral-400 capitalize">{e.audience}</div>
                <div className="text-[11px] text-neutral-400">{chunkCount} msg{chunkCount === 1 ? '' : 's'}</div>
                <div className="text-[11px] text-neutral-400">{e.usage_count}×</div>
                <div className={`text-[11px] ${e.is_active ? 'text-[#00E676]' : 'text-neutral-600'}`}>
                  {e.is_active ? '✓ Active' : '⊘ Inactive'}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(e)}
                    className="text-[11px] text-neutral-400 hover:text-white px-2 py-1"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(creating || editing) && (
        <Editor
          initial={editing ?? null}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await refetch(); }}
        />
      )}
    </div>
  );
}

function Pills<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`text-[11px] px-2.5 py-1 rounded-full border ${
            value === o.value
              ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
              : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Editor({
  initial,
  onClose,
  onSaved,
}: {
  initial: PlaybookEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(
    initial
      ? {
          title: initial.title,
          question_text: initial.question_text,
          answer_body: initial.answer_body,
          audience: initial.audience,
          priority: initial.priority,
          is_active: initial.is_active,
        }
      : EMPTY_DRAFT,
  );
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chunks = useMemo(() => chunkSms(draft.answer_body), [draft.answer_body]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const url = initial ? `/api/admin/playbook/${initial.id}` : '/api/admin/playbook';
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? 'Save failed');
        setSaving(false);
        return;
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!initial) return;
    if (!confirm(`Archive "${initial.title}"? It'll stop appearing in the picker.`)) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/admin/playbook/${initial.id}`, { method: 'DELETE' });
      if (res.ok) await onSaved();
      else setErr('Archive failed');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-2xl w-full my-8 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{initial ? 'Edit entry' : 'New entry'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">×</button>
        </div>

        <div className="space-y-4">
          <Field label="Title" hint="Internal label admins see in the picker">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="How does it work?"
            />
          </Field>

          <Field label="Question" hint="What the user typically asks (used for search; not sent)">
            <input
              type="text"
              value={draft.question_text}
              onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="how does this app work"
            />
          </Field>

          <Field
            label="Answer body"
            hint={`${draft.answer_body.length} chars · splits into ${chunks.length} SMS`}
          >
            <textarea
              value={draft.answer_body}
              onChange={(e) => setDraft({ ...draft, answer_body: e.target.value })}
              rows={5}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white resize-y"
              placeholder="Local drivers, real cash, no surge…"
            />
          </Field>

          {/* Live chunk preview */}
          {chunks.length > 0 && (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3">
              <div className="text-[10px] font-bold tracking-[2px] text-neutral-600 uppercase mb-2">
                Live chunk preview
              </div>
              <div className="space-y-2">
                {chunks.map((c, i) => (
                  <div key={i} className="bg-neutral-800/50 rounded px-2 py-1.5 text-xs text-neutral-200">
                    <span className="text-[10px] text-neutral-600 font-mono mr-2">[{i + 1}] {c.length}c</span>
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Audience">
              <div className="flex gap-1">
                {(['driver', 'rider', 'any'] as PlaybookAudience[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setDraft({ ...draft, audience: a })}
                    className={`text-[11px] px-3 py-1.5 rounded-full border capitalize ${
                      draft.audience === a
                        ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                        : 'border-neutral-800 text-neutral-500'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Priority" hint="Higher = appears first">
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value, 10) || 0 })}
                className="w-24 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            Active
          </label>

          {err && <div className="text-xs text-red-400">{err}</div>}

          <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
            {initial ? (
              <button
                onClick={archive}
                disabled={archiving}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
              >
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm text-neutral-400 hover:text-white px-4 py-2">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !draft.title.trim() || !draft.question_text.trim() || !draft.answer_body.trim()}
                className="bg-[#00E676] hover:bg-[#00C864] disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold text-sm px-5 py-2 rounded-full"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[10px] font-bold tracking-[2px] text-neutral-500 uppercase">{label}</label>
        {hint && <span className="text-[10px] text-neutral-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
