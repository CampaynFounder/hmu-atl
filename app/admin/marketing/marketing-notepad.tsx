'use client';

// MarketingNotepad — scratchpad for admins on /admin/marketing.
//
// Mental model: there is exactly ONE "current" note per admin. Typing in the
// textarea autosaves on debounce so there's no Save button and no ambiguity
// about whether work is committed. Hitting Clear archives the current note
// and creates a fresh empty one — work is never destroyed.
//
// Search hits the admin's own active + archived notes; clicking a result
// opens it in a read-only preview with a Restore button that swaps it in as
// the new current note (the previous current note is archived first).
//
// Super admins also get an "All admins" view: collapsible cards grouped by
// admin display name, view-only for everyone else's notes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Note {
  id: string;
  admin_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SearchHit extends Note {
  admin_name: string;
}

interface SuperGroup {
  adminId: string;
  adminName: string;
  notes: Note[];
}

interface Props {
  isSuper: boolean;
  /** The caller's own admin user_id (from useAdminAuth().admin.id). */
  selfAdminId: string;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

export function MarketingNotepad({ isSuper, selfAdminId }: Props) {
  const [current, setCurrent] = useState<Note | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [clearing, setClearing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'mine' | 'all'>('mine');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [previewHit, setPreviewHit] = useState<SearchHit | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [superView, setSuperView] = useState(false);
  const [superGroups, setSuperGroups] = useState<SuperGroup[]>([]);
  const [superLoading, setSuperLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load (or auto-create) the current note on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/marketing/notes');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { note: Note };
        if (cancelled) return;
        setCurrent(data.note);
        setDraft(data.note.body);
      } catch (err) {
        console.error('[notepad] load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Autosave on debounce. Skip if we haven't actually loaded a note yet, or
  // if the draft equals the last-saved body (e.g. mounted from a fetch).
  const lastSavedBodyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!current) return;
    if (lastSavedBodyRef.current === null) {
      lastSavedBodyRef.current = current.body;
      return;
    }
    if (draft === lastSavedBodyRef.current) return;

    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/marketing/notes/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: draft }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { note: Note };
        lastSavedBodyRef.current = data.note.body;
        setCurrent(data.note);
        setSavedAt(new Date(data.note.updated_at));
        setSaveState('saved');
      } catch (err) {
        console.error('[notepad] autosave failed', err);
        setSaveState('error');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, current]);

  // Debounced search.
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url = `/api/admin/marketing/notes/search?q=${encodeURIComponent(searchQuery.trim())}&scope=${searchScope}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { hits: SearchHit[] };
        if (!cancelled) setHits(data.hits);
      } catch (err) {
        if (!cancelled) console.error('[notepad] search failed', err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, searchScope]);

  // Load super-view groups when toggled on.
  useEffect(() => {
    if (!superView) return;
    let cancelled = false;
    setSuperLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/admin/marketing/notes?view=super');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { groups: SuperGroup[] };
        if (!cancelled) setSuperGroups(data.groups);
      } catch (err) {
        if (!cancelled) console.error('[notepad] super view failed', err);
      } finally {
        if (!cancelled) setSuperLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [superView]);

  const handleClear = useCallback(async () => {
    if (!current) return;
    if (!confirm('Archive this note and start a fresh notepad? You can still search archives anytime.')) return;
    setClearing(true);
    try {
      // Archive current, then create a new empty one. Order matters: if the
      // delete fails we keep the old current; if create fails we still have
      // the archived note (search will surface it).
      await fetch(`/api/admin/marketing/notes/${current.id}`, { method: 'DELETE' });
      const res = await fetch('/api/admin/marketing/notes', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { note: Note };
      lastSavedBodyRef.current = data.note.body;
      setCurrent(data.note);
      setDraft(data.note.body);
      setSaveState('idle');
      setSavedAt(null);
    } catch (err) {
      console.error('[notepad] clear failed', err);
      alert('Clear failed — try again');
    } finally {
      setClearing(false);
    }
  }, [current]);

  const handleRestore = useCallback(async (hit: SearchHit) => {
    if (!current) return;
    if (hit.admin_id !== selfAdminId) return; // safety: never restore someone else's
    if (!confirm('Restore this note as your current notepad? Your current note will be archived first.')) return;
    setRestoring(true);
    try {
      // Archive the active one (only if it has content — otherwise it's an
      // empty placeholder we can drop silently to avoid clutter).
      if (current.body.trim().length > 0) {
        await fetch(`/api/admin/marketing/notes/${current.id}`, { method: 'DELETE' });
      } else {
        // No content — also archive so we never have two empty notes lying
        // around. This is the same call regardless of body length; the
        // branch is just a clarity comment.
        await fetch(`/api/admin/marketing/notes/${current.id}`, { method: 'DELETE' });
      }
      const res = await fetch(`/api/admin/marketing/notes/${hit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { note: Note };
      lastSavedBodyRef.current = data.note.body;
      setCurrent(data.note);
      setDraft(data.note.body);
      setPreviewHit(null);
      setSearchQuery('');
      setSaveState('idle');
      setSavedAt(new Date(data.note.updated_at));
    } catch (err) {
      console.error('[notepad] restore failed', err);
      alert('Restore failed — try again');
    } finally {
      setRestoring(false);
    }
  }, [current, selfAdminId]);

  const charCount = draft.length;
  const charLabel = useMemo(() => {
    if (charCount > 45_000) return `${charCount.toLocaleString()} / 50,000 — running low`;
    return `${charCount.toLocaleString()} chars`;
  }, [charCount]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold">Notepad</h3>
          {saveState === 'saving' && (
            <span className="text-[10px] text-neutral-500 inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-neutral-400 animate-pulse" aria-hidden />
              Saving…
            </span>
          )}
          {saveState === 'saved' && savedAt && (
            <span className="text-[10px] text-green-400/80">Saved · {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          )}
          {saveState === 'error' && (
            <span className="text-[10px] text-red-400">Save failed — retrying on next keystroke</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isSuper && (
            <button
              type="button"
              onClick={() => setSuperView((v) => !v)}
              className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded border transition-colors ${
                superView
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                  : 'border-neutral-700 text-neutral-400 hover:text-purple-200 hover:border-purple-500/40'
              }`}
              title="View every admin's active notes"
            >
              {superView ? 'Hide all admins' : 'All admins'}
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || !current || (current?.body ?? '') === ''}
            className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Archive this note and start fresh — searchable later"
          >
            {clearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Active textarea */}
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 50_000))}
          disabled={loading || !current}
          placeholder={loading ? 'Loading notepad…' : 'Jot down anything you want to remember from this campaign — calls back, follow-ups, what worked. Autosaves as you type.'}
          rows={6}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-white placeholder:text-neutral-600 resize-y min-h-[140px] max-h-[420px] font-sans leading-relaxed disabled:opacity-50"
        />
        <p className="text-[10px] text-neutral-600 mt-1">{charLabel}</p>
      </div>

      {/* Search */}
      <div className="pt-2 border-t border-neutral-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes (active + archived)…"
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-neutral-600"
          />
          {isSuper && (
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
              <button
                type="button"
                onClick={() => setSearchScope('mine')}
                className={`px-2 py-1 rounded border ${searchScope === 'mine' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-400 hover:text-white'}`}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => setSearchScope('all')}
                className={`px-2 py-1 rounded border ${searchScope === 'all' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-400 hover:text-white'}`}
              >
                All
              </button>
            </div>
          )}
        </div>
        {searching && <p className="text-[10px] text-neutral-500 mt-2">Searching…</p>}
        {searchQuery.trim().length >= 2 && !searching && hits.length === 0 && (
          <p className="text-[10px] text-neutral-500 mt-2">No matches.</p>
        )}
        {hits.length > 0 && (
          <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
            {hits.map((hit) => {
              const isMine = hit.admin_id === selfAdminId;
              const isArchived = !!hit.archived_at;
              return (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => setPreviewHit(hit)}
                  className={`w-full text-left bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg px-3 py-2 transition-colors ${
                    previewHit?.id === hit.id ? 'border-blue-500/40 bg-neutral-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {!isMine && (
                      <span className="text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        {hit.admin_name}
                      </span>
                    )}
                    {isArchived && (
                      <span className="text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded bg-neutral-700 text-neutral-300">
                        Archived
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-500">
                      {new Date(hit.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 line-clamp-2">{hit.body}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Preview panel */}
        {previewHit && (
          <div className="mt-3 bg-neutral-950 border border-blue-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {previewHit.admin_id !== selfAdminId && (
                  <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {previewHit.admin_name}
                  </span>
                )}
                <span className="text-[10px] text-neutral-500">
                  {new Date(previewHit.updated_at).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewHit(null)}
                className="text-neutral-500 hover:text-white text-sm"
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <pre className="text-xs text-neutral-200 whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">{previewHit.body}</pre>
            {previewHit.admin_id === selfAdminId ? (
              <button
                type="button"
                onClick={() => handleRestore(previewHit)}
                disabled={restoring}
                className="text-[11px] font-semibold px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white"
              >
                {restoring ? 'Restoring…' : 'Restore as current'}
              </button>
            ) : (
              <p className="text-[10px] text-neutral-500 italic">View-only — only the author can restore their own notes.</p>
            )}
          </div>
        )}
      </div>

      {/* Super: All admins panel */}
      {isSuper && superView && (
        <div className="pt-3 border-t border-neutral-800 space-y-2">
          <h4 className="text-xs font-semibold text-purple-200">All admins · active notes</h4>
          {superLoading && <p className="text-[10px] text-neutral-500">Loading…</p>}
          {!superLoading && superGroups.length === 0 && (
            <p className="text-[10px] text-neutral-500">No active notes from other admins.</p>
          )}
          <div className="space-y-1.5">
            {superGroups.map((g) => {
              const open = expanded.has(g.adminId);
              const head = g.notes[0];
              return (
                <div key={g.adminId} className="bg-neutral-800/40 border border-neutral-800 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.adminId)) next.delete(g.adminId);
                      else next.add(g.adminId);
                      return next;
                    })}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-neutral-800/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                        {g.adminName}
                      </span>
                      <span className="text-[10px] text-neutral-500 shrink-0">{g.notes.length} note{g.notes.length !== 1 ? 's' : ''}</span>
                      {!open && head && (
                        <span className="text-[11px] text-neutral-400 truncate">{head.body || <em className="text-neutral-600">(empty)</em>}</span>
                      )}
                    </div>
                    <span className="text-neutral-500 text-sm" aria-hidden>{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-2">
                      {g.notes.map((n, idx) => (
                        <div key={n.id} className="bg-neutral-950 border border-neutral-800 rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            {idx === 0 && (
                              <span className="text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/30">
                                Current
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-500">{new Date(n.updated_at).toLocaleString()}</span>
                          </div>
                          <pre className="text-xs text-neutral-200 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                            {n.body || <em className="text-neutral-600">(empty)</em>}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
