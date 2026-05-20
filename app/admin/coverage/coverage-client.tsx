'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMarket } from '@/app/admin/components/market-context';

interface DriverCoverage {
  userId: string;
  driverId: string;
  name: string;
  phone: string | null;
  handle: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
  homeUpdatedAt: string | null;
  paymentReady: boolean;
  profileVisible: boolean;
  marketId: string | null;
  marketSlug: string;
  completedRides: number;
  accountStatus: string;
}

type Filter = 'all' | 'home_set' | 'no_home' | 'payment_ready' | 'not_ready';

interface PendingSave {
  userId: string;
  name: string;
  phone: string | null;
  lat: number;
  lng: number;
  label: string;
  market: string;
  paymentReady: boolean;
}

const READY_COLOR  = '#22c55e';
const PENDING_COLOR = '#f59e0b';
const PLACE_COLOR  = '#3b82f6';

async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=neighborhood,locality,place&limit=1`,
    );
    const data = await res.json() as { features?: Array<{ text?: string }> };
    return data?.features?.[0]?.text ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function DriverRow({
  driver,
  isPlacing,
  onPlace,
  onFocus,
}: {
  driver: DriverCoverage;
  isPlacing: boolean;
  onPlace: () => void;
  onFocus: () => void;
}) {
  const hasHome = driver.homeLat != null;
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 border-b border-neutral-800 hover:bg-neutral-800/40 transition-colors cursor-pointer"
      onClick={hasHome ? onFocus : undefined}
    >
      {/* Payment badge */}
      <div
        className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: driver.paymentReady ? READY_COLOR : PENDING_COLOR }}
        title={driver.paymentReady ? 'Payment ready' : 'Stripe not complete'}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-white truncate">{driver.name}</span>
          {driver.handle && (
            <span className="text-[10px] text-neutral-500 truncate">@{driver.handle}</span>
          )}
        </div>
        {hasHome ? (
          <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
            📍 {driver.homeLabel ?? `${driver.homeLat!.toFixed(3)}, ${driver.homeLng!.toFixed(3)}`}
          </div>
        ) : (
          <div className="text-[10px] text-neutral-600 mt-0.5">No home set</div>
        )}
      </div>

      {!hasHome && (
        <button
          onClick={(e) => { e.stopPropagation(); onPlace(); }}
          className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
          style={{
            background: isPlacing ? `${PLACE_COLOR}25` : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isPlacing ? PLACE_COLOR : 'rgba(255,255,255,0.1)'}`,
            color: isPlacing ? PLACE_COLOR : '#aaa',
          }}
        >
          {isPlacing ? 'Placing…' : 'Place'}
        </button>
      )}
    </div>
  );
}

export default function CoverageClient() {
  const { selectedMarket } = useMarket();

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Map<string, unknown>>(new Map());
  const ghostMarkerRef = useRef<unknown>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  const [drivers, setDrivers] = useState<DriverCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [placeMode, setPlaceMode] = useState<{
    userId: string;
    name: string;
    phone: string | null;
    paymentReady: boolean;
  } | null>(null);
  const placeModeRef = useRef(placeMode);
  placeModeRef.current = placeMode;

  const marketSlugRef = useRef<string>('atl');

  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savingLabel, setSavingLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Load drivers when market changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = selectedMarket?.id ? `?marketId=${selectedMarket.id}` : '';
    fetch(`/api/admin/coverage/drivers${params}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { drivers?: DriverCoverage[] } | null) => {
        if (cancelled || !data) return;
        setDrivers(data.drivers ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedMarket?.id]);

  // Init Mapbox
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { setMapError(true); return; }

    const load = async () => {
      try {
        if (!document.getElementById('mapbox-coverage-css')) {
          const link = document.createElement('link');
          link.id = 'mapbox-coverage-css';
          link.rel = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css';
          document.head.appendChild(link);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).mapboxgl) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js';
            script.onload = () => resolve();
            script.onerror = () => reject();
            document.head.appendChild(script);
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapboxgl = (window as any).mapboxgl;
        mapboxgl.accessToken = token;
        const centerLat = (selectedMarket as { centerLat?: number | null } | null)?.centerLat ?? 33.749;
        const centerLng = (selectedMarket as { centerLng?: number | null } | null)?.centerLng ?? -84.388;
        const map = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [Number(centerLng), Number(centerLat)],
          zoom: 11,
        });
        map.on('load', () => setMapLoaded(true));
        mapRef.current = map;
      } catch {
        setMapError(true);
      }
    };

    load();
    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to market on switch
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !selectedMarket) return;
    const m = selectedMarket as { centerLat?: number | null; centerLng?: number | null };
    if (m.centerLat == null || m.centerLng == null) return;
    (mapRef.current as {
      flyTo(opts: { center: [number, number]; zoom?: number; duration?: number }): void;
    }).flyTo({ center: [Number(m.centerLng), Number(m.centerLat)], zoom: 11, duration: 1200 });
  }, [selectedMarket, mapLoaded]);

  // Sync home-location markers whenever drivers list or map changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    const marketSlug = (selectedMarket as { slug?: string } | null)?.slug ?? 'atl';

    const activeIds = new Set<string>();

    for (const driver of drivers) {
      if (driver.homeLat == null || driver.homeLng == null) continue;
      activeIds.add(driver.userId);

      const color = driver.paymentReady ? READY_COLOR : PENDING_COLOR;
      const icon = driver.paymentReady ? '✓' : '🚗';
      const existing = markersRef.current.get(driver.userId);

      if (existing) {
        (existing as { setLngLat(c: [number, number]): void }).setLngLat([driver.homeLng, driver.homeLat]);
        const el = (existing as { getElement(): HTMLDivElement }).getElement();
        el.style.background = color;
        el.style.boxShadow = `0 0 10px ${color}55`;
        el.textContent = icon;
      } else {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 30px; height: 30px; border-radius: 50%;
          background: ${color}; border: 2.5px solid rgba(255,255,255,0.8);
          cursor: grab; box-shadow: 0 0 10px ${color}55;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; line-height: 1;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        `;
        el.textContent = icon;
        el.title = `${driver.name}${driver.homeLabel ? ` — ${driver.homeLabel}` : ''}`;

        const marker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat([driver.homeLng, driver.homeLat])
          .addTo(map);

        const driverId = driver.userId;
        const driverName = driver.name;
        const driverPhone = driver.phone;
        const driverPaymentReady = driver.paymentReady;

        marker.on('dragend', async () => {
          const pos = (marker as { getLngLat(): { lat: number; lng: number } }).getLngLat();
          const label = await reverseGeocode(pos.lng, pos.lat);
          setPendingSave({ userId: driverId, name: driverName, phone: driverPhone, lat: pos.lat, lng: pos.lng, label, market: marketSlug, paymentReady: driverPaymentReady });
          setSavingLabel(label);
        });

        // Animate hover
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.15)';
          el.style.boxShadow = `0 0 18px ${color}90`;
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          el.style.boxShadow = `0 0 10px ${color}55`;
        });

        markersRef.current.set(driver.userId, marker);
      }
    }

    // Remove markers for drivers no longer in the list or who lost their home
    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        markersRef.current.delete(id);
      }
    }
  }, [drivers, mapLoaded, selectedMarket]);

  // Map click handler for place-mode (stable — only depends on mapLoaded)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;

    const handleClick = async (e: { lngLat: { lat: number; lng: number } }) => {
      const mode = placeModeRef.current;
      if (!mode) return;

      const { lat, lng } = e.lngLat;

      if (ghostMarkerRef.current) {
        (ghostMarkerRef.current as { remove(): void }).remove();
        ghostMarkerRef.current = null;
      }

      const label = await reverseGeocode(lng, lat);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).getCanvas().style.cursor = '';
      setPlaceMode(null);

      setPendingSave({ userId: mode.userId, name: mode.name, phone: mode.phone, lat, lng, label, market: marketSlugRef.current, paymentReady: mode.paymentReady });
      setSavingLabel(label);
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [mapLoaded]);

  // Keep marketSlugRef current so the stable map click handler always reads latest market
  marketSlugRef.current = (selectedMarket as { slug?: string } | null)?.slug ?? 'atl';

  // Cursor + ghost marker when placeMode changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;

    if (placeMode && mapboxgl) {
      map.getCanvas().style.cursor = 'crosshair';
      if (!ghostMarkerRef.current) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 30px; height: 30px; border-radius: 50%;
          background: ${PLACE_COLOR}; border: 2.5px solid rgba(255,255,255,0.9);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; opacity: 0.75; pointer-events: none;
          box-shadow: 0 0 16px ${PLACE_COLOR}80;
        `;
        el.textContent = '📍';
        const center = map.getCenter();
        ghostMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([center.lng, center.lat])
          .addTo(map);
      }
    } else {
      map.getCanvas().style.cursor = '';
      if (ghostMarkerRef.current) {
        (ghostMarkerRef.current as { remove(): void }).remove();
        ghostMarkerRef.current = null;
      }
    }
  }, [placeMode, mapLoaded]);

  const handleSave = useCallback(async (sendText: boolean) => {
    if (!pendingSave) return;
    setSaving(true);

    try {
      const label = savingLabel.trim() || pendingSave.label;
      const res = await fetch(`/api/admin/coverage/drivers/${pendingSave.userId}/home`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: pendingSave.lat, lng: pendingSave.lng, label, sendText, market: pendingSave.market }),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json() as { smsSent?: boolean };

      // Update local state so markers effect re-runs
      setDrivers(prev => prev.map(d =>
        d.userId === pendingSave.userId
          ? { ...d, homeLat: pendingSave.lat, homeLng: pendingSave.lng, homeLabel: label }
          : d,
      ));

      const msg = sendText && data.smsSent
        ? `Saved + texted ${pendingSave.name}`
        : `Home location saved for ${pendingSave.name}`;
      setToast({ kind: 'ok', text: msg });
      setPendingSave(null);
    } catch {
      setToast({ kind: 'err', text: 'Failed to save — try again' });
    } finally {
      setSaving(false);
    }
  }, [pendingSave, savingLabel]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function focusDriver(driver: DriverCoverage) {
    if (!mapRef.current || driver.homeLat == null || driver.homeLng == null) return;
    (mapRef.current as {
      flyTo(opts: { center: [number, number]; zoom?: number; duration?: number }): void;
    }).flyTo({ center: [driver.homeLng, driver.homeLat], zoom: 14, duration: 800 });
  }

  // Filtered driver list
  const filteredDrivers = drivers.filter(d => {
    if (search) {
      const q = search.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !(d.handle?.toLowerCase().includes(q))) return false;
    }
    switch (filter) {
      case 'home_set':      return d.homeLat != null;
      case 'no_home':       return d.homeLat == null;
      case 'payment_ready': return d.paymentReady;
      case 'not_ready':     return !d.paymentReady;
    }
    return true;
  });

  const stats = {
    total:        drivers.length,
    homeSet:      drivers.filter(d => d.homeLat != null).length,
    noHome:       drivers.filter(d => d.homeLat == null).length,
    paymentReady: drivers.filter(d => d.paymentReady).length,
  };

  const smsPreview = pendingSave
    ? `What area you drive in? You'll get rides around ${(savingLabel || pendingSave.label).slice(0, 30)}. Change it: atl.hmucashride.com/driver/home fmoig @hmucashrides`
    : '';

  const FILTER_OPTIONS: { key: Filter; label: string; count: number; color?: string }[] = [
    { key: 'all',           label: 'All',         count: drivers.length },
    { key: 'no_home',       label: 'No Home',     count: stats.noHome,       color: '#ef4444' },
    { key: 'home_set',      label: 'Home Set',    count: stats.homeSet,      color: '#8b5cf6' },
    { key: 'payment_ready', label: 'Pay Ready',   count: stats.paymentReady, color: READY_COLOR },
    { key: 'not_ready',     label: 'Not Ready',   count: stats.total - stats.paymentReady, color: PENDING_COLOR },
  ];

  if (mapError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-neutral-500 text-sm">Map unavailable — check NEXT_PUBLIC_MAPBOX_TOKEN</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Stats bar */}
      <div className="flex gap-3 px-4 py-3 border-b border-neutral-800 flex-wrap">
        <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 text-xs">
          <span className="text-neutral-400">Total Drivers</span>
          <span className="font-bold text-white">{stats.total}</span>
        </div>
        <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
          <span className="text-neutral-400">Home Set</span>
          <span className="font-bold text-white">{stats.homeSet}</span>
        </div>
        <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
          <span className="text-neutral-400">No Home</span>
          <span className="font-bold text-white">{stats.noHome}</span>
        </div>
        <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: READY_COLOR }} />
          <span className="text-neutral-400">Pay Ready</span>
          <span className="font-bold text-white">{stats.paymentReady}</span>
        </div>
        {/* Coverage bar */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <span className="text-[10px] text-neutral-500 whitespace-nowrap">Coverage</span>
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: stats.total > 0 ? `${Math.round((stats.homeSet / stats.total) * 100)}%` : '0%',
                background: 'linear-gradient(90deg, #8b5cf6, #22c55e)',
              }}
            />
          </div>
          <span className="text-[10px] text-neutral-400">
            {stats.total > 0 ? Math.round((stats.homeSet / stats.total) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Main area: sidebar + map */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-800 bg-neutral-950">

          {/* Search */}
          <div className="px-3 py-2 border-b border-neutral-800">
            <input
              type="text"
              placeholder="Search drivers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-neutral-800">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-all"
                style={{
                  background: filter === opt.key
                    ? `${opt.color ?? '#ffffff'}20`
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${filter === opt.key ? (opt.color ?? '#fff') : 'rgba(255,255,255,0.08)'}`,
                  color: filter === opt.key ? (opt.color ?? '#fff') : '#666',
                }}
              >
                {opt.label} {opt.count > 0 && `(${opt.count})`}
              </button>
            ))}
          </div>

          {/* Driver list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-neutral-600 text-xs">Loading drivers…</div>
            )}
            {!loading && filteredDrivers.length === 0 && (
              <div className="px-4 py-6 text-center text-neutral-600 text-xs">No drivers match this filter</div>
            )}
            {!loading && filteredDrivers.map(driver => (
              <DriverRow
                key={driver.userId}
                driver={driver}
                isPlacing={placeMode?.userId === driver.userId}
                onPlace={() => {
                  if (placeMode?.userId === driver.userId) {
                    setPlaceMode(null);
                  } else {
                    setPlaceMode({ userId: driver.userId, name: driver.name, phone: driver.phone, paymentReady: driver.paymentReady });
                    setPendingSave(null);
                  }
                }}
                onFocus={() => focusDriver(driver)}
              />
            ))}
          </div>
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Place mode instruction overlay */}
          {placeMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-neutral-900/95 backdrop-blur border border-blue-500/40 rounded-xl px-4 py-2.5 shadow-lg">
              <span className="text-[11px] text-blue-300 font-medium">
                Click the map to set <span className="text-white font-bold">{placeMode.name}</span>&#39;s home base
              </span>
              <button
                onClick={() => setPlaceMode(null)}
                className="text-neutral-500 hover:text-white text-xs ml-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Legend */}
          <div className="absolute top-4 right-4 bg-neutral-900/90 backdrop-blur rounded-lg p-2.5 text-[10px] space-y-1.5 z-10">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2" style={{ background: READY_COLOR, borderColor: 'rgba(255,255,255,0.5)' }} />
              <span className="text-neutral-400">Pay Ready</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2" style={{ background: PENDING_COLOR, borderColor: 'rgba(255,255,255,0.5)' }} />
              <span className="text-neutral-400">Stripe Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 italic">Drag</span>
              <span className="text-neutral-400">to update</span>
            </div>
          </div>

          {/* Confirm / save panel */}
          {pendingSave && (
            <div className="absolute bottom-4 left-4 right-4 z-20 bg-neutral-900/97 backdrop-blur border border-neutral-700 rounded-xl p-4 shadow-2xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-white">{pendingSave.name}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {pendingSave.lat.toFixed(5)}, {pendingSave.lng.toFixed(5)}
                  </div>
                </div>
                <button
                  onClick={() => { setPendingSave(null); setPlaceMode(null); }}
                  className="text-neutral-600 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Label input */}
              <div className="mb-3">
                <label className="text-[10px] text-neutral-500 block mb-1">Neighborhood / area label</label>
                <input
                  type="text"
                  value={savingLabel}
                  onChange={e => setSavingLabel(e.target.value)}
                  placeholder="e.g. East Atlanta, Midtown"
                  maxLength={50}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                />
              </div>

              {/* SMS preview */}
              {pendingSave.phone && (
                <div className="mb-3 bg-neutral-800/60 rounded-lg p-2.5">
                  <div className="text-[9px] text-neutral-500 mb-1 uppercase tracking-wide">SMS preview</div>
                  <div className="text-[10px] text-neutral-300 leading-relaxed">{smsPreview}</div>
                  <div className="text-[9px] text-neutral-600 mt-1">
                    {smsPreview.length}/155 chars · to {pendingSave.phone}
                  </div>
                </div>
              )}
              {!pendingSave.phone && (
                <div className="mb-3 text-[10px] text-neutral-600 italic">No phone on file — SMS unavailable</div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {pendingSave.phone && (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    style={{ background: '#22c55e20', border: '1px solid #22c55e60', color: '#22c55e' }}
                  >
                    {saving ? 'Saving…' : 'Save & Text Driver'}
                  </button>
                )}
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}
                >
                  {saving ? 'Saving…' : 'Save Only'}
                </button>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all"
              style={{
                background: toast.kind === 'ok' ? '#22c55e20' : '#ef444420',
                border: `1px solid ${toast.kind === 'ok' ? '#22c55e60' : '#ef444460'}`,
                color: toast.kind === 'ok' ? '#22c55e' : '#ef4444',
                backdropFilter: 'blur(8px)',
              }}
            >
              {toast.text}
            </div>
          )}
        </div>
      </div>

      {/* Mapbox attribution scaling */}
      <style jsx global>{`
        .mapboxgl-ctrl-logo { width: 60px !important; height: 16px !important; opacity: 0.12 !important; }
        .mapboxgl-ctrl-attrib { font-size: 8px !important; opacity: 0.12 !important; background: transparent !important; }
        .mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-left { opacity: 0.2 !important; }
      `}</style>
    </div>
  );
}
