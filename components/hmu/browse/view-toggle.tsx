'use client';

import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'feed' | 'grid';

/**
 * sessionStorage-backed view toggle. SSR renders `defaultView` (no flash for the
 * default case); after mount we read the persisted value and flip if it differs.
 * The hydrated flag lets the toggle UI fade in once we know which mode is active.
 */
export function useViewMode(storageKey: string, defaultView: ViewMode = 'feed') {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'feed' || saved === 'grid') setView(saved);
    } catch {
      // storage disabled — keep default
    }
    setHydrated(true);
  }, [storageKey]);

  const updateView = useCallback((next: ViewMode) => {
    setView(next);
    try { sessionStorage.setItem(storageKey, next); } catch { /* silent */ }
  }, [storageKey]);

  return { view, setView: updateView, hydrated };
}

interface ToggleProps {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  hydrated: boolean;
}

export default function ViewToggle({ view, onChange, hydrated }: ToggleProps) {
  const btn = (mode: ViewMode, label: string, icon: string) => (
    <button
      type="button"
      onClick={() => onChange(mode)}
      aria-label={`${label} view`}
      aria-pressed={view === mode}
      style={{
        padding: '6px 10px',
        borderRadius: 100,
        border: 'none',
        background: view === mode ? 'rgba(0,230,118,0.15)' : 'transparent',
        color: view === mode ? '#00E676' : '#888',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
        opacity: hydrated ? 1 : 0,
        transition: 'opacity 0.15s, background 0.15s, color 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {icon}
    </button>
  );
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 100, padding: 2,
    }}>
      {btn('feed', 'Feed', '▤')}
      {btn('grid', 'Grid', '▦')}
    </div>
  );
}
