'use client';

// Reusable user picker for admin pages. Calls /api/admin/users/search with a
// 120ms debounce, renders a keyboard-navigable result list, and fires
// onSelect(result) when the admin picks one. Used by the dashboards Phase 0
// scaffolding and reusable for any other admin surface that needs to bind to
// a user (impersonation, manual matching, etc.).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AdminUserSearchResult } from '@/lib/db/types';

interface UserSearchPickerProps {
  onSelect: (user: AdminUserSearchResult) => void;
  placeholder?: string;
  profileType?: 'driver' | 'rider';
  marketId?: string | null;
  autoFocus?: boolean;
  // Pre-fill the input — useful when you want to render the currently-selected
  // user's display name, then let the admin type to swap it.
  initialQuery?: string;
}

const DEBOUNCE_MS = 120;
const MIN_QUERY_LENGTH = 2;

export function UserSearchPicker({
  onSelect,
  placeholder = 'Search users by name, handle, or phone…',
  profileType,
  marketId,
  autoFocus = false,
  initialQuery = '',
}: UserSearchPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AdminUserSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (profileType) params.set('profile_type', profileType);
        if (marketId) params.set('market_id', marketId);
        const res = await fetch(`/api/admin/users/search?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { results: AdminUserSearchResult[] };
        if (cancelled) return;
        setResults(data.results || []);
        setActiveIndex(0);
      } catch { /* leave previous results */ }
      finally { if (!cancelled) setLoading(false); }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, profileType, marketId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const choose = useCallback((user: AdminUserSearchResult) => {
    onSelect(user);
    setOpen(false);
  }, [onSelect]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showEmpty = open && !loading && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH;
  const showHint = open && query.trim().length < MIN_QUERY_LENGTH;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          background: 'var(--admin-bg-elevated)',
          border: '1px solid var(--admin-border)',
        }}
      >
        <span className="text-base" style={{ color: 'var(--admin-text-muted)' }} aria-hidden>
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--admin-text)' }}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="text-xs px-1.5 py-0.5 rounded hover:opacity-70"
            style={{ color: 'var(--admin-text-muted)' }}
            aria-label="Clear search"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg z-20"
          style={{
            background: 'var(--admin-bg-elevated)',
            border: '1px solid var(--admin-border)',
            maxHeight: 'min(70vh, 420px)',
            overflowY: 'auto',
          }}
        >
          {showHint && (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
              Type at least {MIN_QUERY_LENGTH} characters…
            </div>
          )}

          {loading && (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
              Searching…
            </div>
          )}

          {showEmpty && (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
              No users match &quot;{query.trim()}&quot;.
            </div>
          )}

          {results.length > 0 && (
            <div role="listbox">
              {results.map((user, idx) => {
                const active = idx === activeIndex;
                const name = user.display_name || user.handle || 'Unnamed';
                return (
                  <button
                    key={user.id}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => choose(user)}
                    type="button"
                    className="w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors"
                    style={{
                      background: active ? 'var(--admin-bg)' : 'transparent',
                      color: 'var(--admin-text)',
                    }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: 'var(--admin-bg)',
                        color: 'var(--admin-text-muted)',
                        border: '1px solid var(--admin-border)',
                      }}
                    >
                      {user.profile_type}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{name}</span>
                      {user.handle && user.handle !== name && (
                        <span className="ml-2 text-[12px]" style={{ color: 'var(--admin-text-muted)' }}>
                          @{user.handle}
                        </span>
                      )}
                      {user.phone && (
                        <span className="ml-2 text-[12px]" style={{ color: 'var(--admin-text-muted)' }}>
                          {user.phone}
                        </span>
                      )}
                    </span>
                    <span
                      className="hidden sm:inline text-[10px] shrink-0"
                      style={{ color: 'var(--admin-text-muted)' }}
                    >
                      {user.market_label ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
