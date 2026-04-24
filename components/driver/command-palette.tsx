'use client';

// Cmd+K / "?" command palette for drivers.
// Client-side substring ranking (no extra dep). Good enough for <200 items.
// Items: playbook section anchors + FB groups. Fetched once on open.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';

export interface PaletteItem {
  id: string;
  kind: 'playbook' | 'fb_group' | 'faq';
  title: string;
  subtitle?: string | null;
  href: string;
  tags?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function rank(query: string, item: PaletteItem): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = item.title.toLowerCase();
  const s = (item.subtitle || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 60;
  if (tags.includes(q)) return 40;
  if (s.includes(q)) return 20;
  return 0;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await fetch('/api/driver/playbook/search-index');
        if (cancelled) return;
        const data = r.ok ? await r.json() : { items: [] };
        if (cancelled) return;
        setItems(data.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!query) return items;
    return items
      .map(i => ({ i, r: rank(query, i) }))
      .filter(x => x.r > 0)
      .sort((a, b) => b.r - a.r)
      .map(x => x.i);
  }, [items, query]);

  function handleItemClick(item: PaletteItem) {
    posthog.capture('driver_palette_selected', { kind: item.kind, id: item.id, title: item.title });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-0 sm:p-4 sm:pt-[10vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ y: 40, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[90vh] sm:max-h-[70vh] flex flex-col"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — mobile-only affordance signaling the sheet is dismissible */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-10 h-1.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              />
            </div>

            {/* Input + close */}
            <div
              className="p-4 border-b flex items-center gap-3"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search playbook, groups, tips…"
                className="flex-1 min-w-0 bg-transparent outline-none text-white placeholder-white/30 text-base"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', fontSize: 18, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading && (
                <p className="px-4 py-6 text-center text-sm text-white/40">Loading…</p>
              )}
              {!loading && filtered.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-white/40">
                  {query ? 'No matches' : 'Type to search'}
                </p>
              )}
              {filtered.map(item => (
                <a
                  key={`${item.kind}:${item.id}`}
                  href={item.href}
                  target={item.kind === 'fb_group' ? '_blank' : undefined}
                  rel={item.kind === 'fb_group' ? 'noopener noreferrer' : undefined}
                  onClick={() => handleItemClick(item)}
                  className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg shrink-0" aria-hidden>
                    {item.kind === 'playbook' ? '📖' : item.kind === 'fb_group' ? '👥' : '❓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-white/50 truncate">{item.subtitle}</p>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-white/30 shrink-0 self-center">
                    {item.kind === 'playbook' ? 'GUIDE' : item.kind === 'fb_group' ? 'GROUP' : 'FAQ'}
                  </span>
                </a>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-4 py-2 text-[10px] text-white/30 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="hidden sm:inline">Esc to close</span>
              <span className="sm:hidden">Tap × to close</span>
              <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
