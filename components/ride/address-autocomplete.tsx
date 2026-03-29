'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ValidatedAddress } from '@/lib/db/types';

interface Suggestion {
  name: string;
  full_address: string;
  mapbox_id: string;
}

interface AddressAutocompleteProps {
  label: string;
  placeholder?: string;
  onSelect: (address: ValidatedAddress) => void;
  onClear?: () => void;
  proximity?: { lat: number; lng: number };
  required?: boolean;
  value?: ValidatedAddress | null;
}

const MAPBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';
const ATLANTA_BBOX = '-84.8,33.5,-84.1,34.1';

export function AddressAutocomplete({
  label,
  placeholder = 'Search address or landmark...',
  onSelect,
  onClear,
  proximity,
  required = false,
  value,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value?.name || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const sessionTokenRef = useRef(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside tap
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return;

      const params = new URLSearchParams({
        q,
        access_token: token,
        session_token: sessionTokenRef.current,
        country: 'us',
        bbox: ATLANTA_BBOX,
        limit: '6',
        types: 'address,poi,place,neighborhood,locality',
        language: 'en',
      });

      if (proximity) {
        params.set('proximity', `${proximity.lng},${proximity.lat}`);
      }

      const res = await fetch(`${MAPBOX_BASE}/suggest?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      const results = (data.suggestions || []).map((s: Record<string, unknown>) => ({
        name: s.name as string,
        full_address: (s.full_address as string) || (s.place_formatted as string) || '',
        mapbox_id: s.mapbox_id as string,
      }));

      setSuggestions(results);
      setIsOpen(results.length > 0);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, [proximity]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setSelected(false);
    if (onClear) onClear();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    setQuery(suggestion.name);
    setIsOpen(false);
    setLoading(true);

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return;

      const params = new URLSearchParams({
        access_token: token,
        session_token: sessionTokenRef.current,
      });

      const res = await fetch(`${MAPBOX_BASE}/retrieve/${suggestion.mapbox_id}?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) return;

      const [longitude, latitude] = feature.geometry.coordinates as [number, number];

      const validated: ValidatedAddress = {
        name: suggestion.name,
        address: suggestion.full_address,
        latitude,
        longitude,
        mapbox_id: suggestion.mapbox_id,
      };

      setSelected(true);
      // New session token for next search interaction
      sessionTokenRef.current = crypto.randomUUID();
      onSelect(validated);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <label
        style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 600,
          color: '#a1a1aa',
          marginBottom: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
        {required && <span style={{ color: '#f87171' }}> *</span>}
      </label>

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0 && !selected) setIsOpen(true); }}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '12px 14px',
            paddingRight: loading ? '40px' : '14px',
            borderRadius: '10px',
            border: selected ? '1.5px solid #22c55e' : '1.5px solid #27272a',
            background: '#18181b',
            color: '#fafafa',
            fontSize: '15px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
        {loading && (
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '18px',
              height: '18px',
              border: '2px solid #3f3f46',
              borderTopColor: '#a1a1aa',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        {selected && !loading && (
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#22c55e',
              fontSize: '16px',
            }}
          >
            ✓
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: '4px',
            padding: '4px 0',
            borderRadius: '10px',
            border: '1px solid #27272a',
            background: '#1c1c1e',
            listStyle: 'none',
            maxHeight: '240px',
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {suggestions.map((s) => (
            <li
              key={s.mapbox_id}
              onClick={() => handleSelect(s)}
              style={{
                padding: '12px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #27272a',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#27272a'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#fafafa' }}>
                {s.name}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                {s.full_address}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOpen && suggestions.length === 0 && query.length >= 2 && !loading && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: '4px',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid #27272a',
            background: '#1c1c1e',
            color: '#71717a',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          No results found
        </div>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}
