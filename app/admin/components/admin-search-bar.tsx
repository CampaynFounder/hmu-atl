'use client';

// Sticky top search bar mounted by AdminMain. Always visible at the top of
// the admin content area; Cmd+K (or Ctrl+K) focuses it from anywhere.
//
// Results are fetched from /api/admin/search which already filters by the
// caller's permissions. Empty query returns a "browse all" list so the
// dropdown has something useful on first focus.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  label: string;
  href: string;
  section: string;
  icon: string;
}

export function AdminSearchBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Debounced fetch. 120ms keeps it snappy without spamming on fast typing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { results: SearchResult[] };
        if (cancelled) return;
        setResults(data.results || []);
        setActiveIndex(0);
      } catch { /* leave previous results */ }
      finally { if (!cancelled) setLoading(false); }
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  // Cmd+K / Ctrl+K → focus the search input from anywhere in the admin app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close when click lands outside the search container.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  }, [router]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex].href);
    }
  };

  // Group results by section for the dropdown layout.
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.section] = acc[r.section] || []).push(r);
    return acc;
  }, {});
  const sectionOrder = ['Monitor', 'Act', 'Grow', 'Raise', 'System'];
  const orderedSections = sectionOrder.filter((s) => grouped[s]?.length);

  return (
    <div
      ref={containerRef}
      className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 py-2 mb-3 backdrop-blur-md"
      style={{
        background: 'color-mix(in oklab, var(--admin-bg) 85%, transparent)',
        borderBottom: open ? '1px solid var(--admin-border)' : '1px solid transparent',
      }}
    >
      <div className="relative max-w-2xl mx-auto">
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
            placeholder="Search admin… (⌘K)"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--admin-text)' }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-xs px-1.5 py-0.5 rounded hover:opacity-70"
              style={{ color: 'var(--admin-text-muted)' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
          <kbd
            className="hidden sm:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--admin-bg)',
              border: '1px solid var(--admin-border)',
              color: 'var(--admin-text-muted)',
            }}
          >
            ⌘K
          </kbd>
        </div>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg"
            style={{
              background: 'var(--admin-bg-elevated)',
              border: '1px solid var(--admin-border)',
              maxHeight: 'min(70vh, 480px)',
              overflowY: 'auto',
            }}
          >
            {loading && results.length === 0 && (
              <div className="px-4 py-3 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
                Searching…
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="px-4 py-3 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
                No matches{query ? ` for "${query}"` : ''}.
              </div>
            )}

            {results.length > 0 && (
              <div role="listbox">
                {orderedSections.map((section) => (
                  <div key={section}>
                    <div
                      className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider uppercase"
                      style={{ color: 'var(--admin-text-muted)' }}
                    >
                      {section}
                    </div>
                    {grouped[section].map((r) => {
                      const flatIndex = results.indexOf(r);
                      const active = flatIndex === activeIndex;
                      return (
                        <button
                          key={r.id}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => navigate(r.href)}
                          className="w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors"
                          style={{
                            background: active ? 'var(--admin-bg)' : 'transparent',
                            color: 'var(--admin-text)',
                          }}
                        >
                          <span className="text-base" aria-hidden>{r.icon}</span>
                          <span className="flex-1">{r.label}</span>
                          <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                            {r.href}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
