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

const READY_COLOR   = '#22c55e';
const PENDING_COLOR = '#f59e0b';

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

export default function CoverageClient() {
  const { selectedMarket } = useMarket();

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Map<string, unknown>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  const [drivers, setDrivers] = useState<DriverCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  // Drag state
  const [draggingDriver, setDraggingDriver] = useState<DriverCoverage | null>(null);
  const [isDragOverMap, setIsDragOverMap] = useState(false);

  const marketSlugRef = useRef<string>('atl');
  marketSlugRef.current = (selectedMarket as { slug?: string } | null)?.slug ?? 'atl';

  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savingLabel, setSavingLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Load drivers
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

  // Sync home-location markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    const marketSlug = marketSlugRef.current;

    const activeIds = new Set<string>();

    for (const driver of drivers) {
      if (driver.homeLat == null || driver.homeLng == null) continue;
      activeIds.add(driver.userId);

      const color = driver.paymentReady ? READY_COLOR : PENDING_COLOR;
      const existing = markersRef.current.get(driver.userId);

      if (existing) {
        (existing as { setLngLat(c: [number, number]): void }).setLngLat([driver.homeLng, driver.homeLat]);
        const el = (existing as { getElement(): HTMLDivElement }).getElement();
        el.style.background = color;
        el.style.boxShadow = `0 0 10px ${color}55`;
        el.setAttribute('data-color', color);
      } else {
        const el = createMarkerEl(color, driver.paymentReady);
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

        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.2)';
          el.style.boxShadow = `0 0 20px ${color}90`;
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          el.style.boxShadow = `0 0 10px ${color}55`;
        });

        markersRef.current.set(driver.userId, marker);
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        markersRef.current.delete(id);
      }
    }
  }, [drivers, mapLoaded, selectedMarket]);

  // ── Drag handlers ──

  function handleDragStart(e: React.DragEvent, driver: DriverCoverage) {
    setDraggingDriver(driver);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', driver.userId);

    // Custom drag image: a small pill showing the driver name
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed; top: -200px; left: 0;
      background: #18181b; border: 1px solid rgba(255,255,255,0.25);
      border-radius: 20px; padding: 6px 12px 6px 8px;
      color: #fff; font-size: 12px; font-weight: 600;
      white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
    `;
    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${driver.paymentReady ? READY_COLOR : PENDING_COLOR};flex-shrink:0;`;
    ghost.appendChild(dot);
    ghost.appendChild(document.createTextNode(driver.name));
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    requestAnimationFrame(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); });
  }

  function handleDragEnd() {
    setDraggingDriver(null);
    setIsDragOverMap(false);
  }

  function handleMapDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleMapDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (draggingDriver) setIsDragOverMap(true);
  }

  function handleMapDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverMap(false);
    }
  }

  async function handleMapDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOverMap(false);

    const driver = draggingDriver;
    if (!driver || !mapRef.current) return;
    setDraggingDriver(null);

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lngLat = (mapRef.current as any).unproject([x, y]) as { lat: number; lng: number };
    const label = await reverseGeocode(lngLat.lng, lngLat.lat);

    setPendingSave({
      userId: driver.userId,
      name: driver.name,
      phone: driver.phone,
      lat: lngLat.lat,
      lng: lngLat.lng,
      label,
      market: marketSlugRef.current,
      paymentReady: driver.paymentReady,
    });
    setSavingLabel(label);
  }

  // ── Save ──

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

      setDrivers(prev => prev.map(d =>
        d.userId === pendingSave.userId
          ? { ...d, homeLat: pendingSave.lat, homeLng: pendingSave.lng, homeLabel: label }
          : d,
      ));

      const msg = sendText && data.smsSent
        ? `Saved + texted ${pendingSave.name}`
        : `Home set for ${pendingSave.name}`;
      setToast({ kind: 'ok', text: msg });
      setPendingSave(null);
    } catch {
      setToast({ kind: 'err', text: 'Failed to save — try again' });
    } finally {
      setSaving(false);
    }
  }, [pendingSave, savingLabel]);

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

  // Filtered list
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

  const FILTERS: { key: Filter; label: string; color?: string }[] = [
    { key: 'all',           label: 'All' },
    { key: 'no_home',       label: 'No Home',   color: '#ef4444' },
    { key: 'home_set',      label: 'Home Set',  color: '#8b5cf6' },
    { key: 'payment_ready', label: 'Pay Ready', color: READY_COLOR },
    { key: 'not_ready',     label: 'Pending',   color: PENDING_COLOR },
  ];

  if (mapError) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500 text-sm">
        Map unavailable — check NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '560px' }}>

      {/* Stats bar */}
      <div className="flex gap-3 px-4 py-2.5 border-b border-neutral-800 flex-shrink-0 flex-wrap items-center">
        <Stat label="Total" value={stats.total} />
        <Stat label="Home Set" value={stats.homeSet} color="#8b5cf6" />
        <Stat label="No Home" value={stats.noHome} color="#ef4444" />
        <Stat label="Pay Ready" value={stats.paymentReady} color={READY_COLOR} />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-neutral-500">Coverage</span>
          <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: stats.total > 0 ? `${Math.round((stats.homeSet / stats.total) * 100)}%` : '0%',
                background: 'linear-gradient(90deg, #8b5cf6, #22c55e)',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <span className="text-[10px] text-neutral-400 w-7">
            {stats.total > 0 ? Math.round((stats.homeSet / stats.total) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Sidebar + Map */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col border-r border-neutral-800 overflow-hidden">

          {/* Search */}
          <div className="px-3 py-2 border-b border-neutral-800 flex-shrink-0">
            <input
              type="text"
              placeholder="Search drivers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-neutral-800 flex-shrink-0">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-all"
                style={{
                  background: filter === f.key ? `${f.color ?? '#fff'}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${filter === f.key ? (f.color ?? '#fff') : 'rgba(255,255,255,0.08)'}`,
                  color: filter === f.key ? (f.color ?? '#fff') : '#777',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Drag hint */}
          <div className="px-3 py-2 border-b border-neutral-800 flex-shrink-0">
            <p className="text-[10px] text-neutral-600 leading-relaxed">
              Drag a driver onto the map to set their home base.
              Drag existing pins to move them.
            </p>
          </div>

          {/* Driver list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-neutral-600 text-xs">Loading drivers…</div>
            )}
            {!loading && filteredDrivers.length === 0 && (
              <div className="px-4 py-6 text-center text-neutral-600 text-xs">No drivers match</div>
            )}
            {!loading && filteredDrivers.map(driver => (
              <div
                key={driver.userId}
                draggable
                onDragStart={e => handleDragStart(e, driver)}
                onDragEnd={handleDragEnd}
                onClick={() => focusDriver(driver)}
                className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800/60 hover:bg-neutral-800/40 transition-colors select-none"
                style={{ cursor: driver.homeLat != null ? 'grab' : 'grab', opacity: draggingDriver?.userId === driver.userId ? 0.4 : 1 }}
              >
                {/* Drag handle */}
                <span className="text-neutral-600 text-xs flex-shrink-0" style={{ cursor: 'grab' }}>⠿</span>

                {/* Payment dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: driver.paymentReady ? READY_COLOR : PENDING_COLOR }}
                  title={driver.paymentReady ? 'Payment ready' : 'Stripe pending'}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs font-medium text-white truncate">{driver.name}</span>
                    {driver.handle && (
                      <span className="text-[10px] text-neutral-500 truncate">@{driver.handle}</span>
                    )}
                  </div>
                  {driver.homeLat != null ? (
                    <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                      📍 {driver.homeLabel ?? `${driver.homeLat.toFixed(3)}, ${driver.homeLng!.toFixed(3)}`}
                    </div>
                  ) : (
                    <div className="text-[10px] text-neutral-700 mt-0.5">No home — drag to set</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div
          className="flex-1 relative overflow-hidden"
          onDragOver={handleMapDragOver}
          onDragEnter={handleMapDragEnter}
          onDragLeave={handleMapDragLeave}
          onDrop={handleMapDrop}
        >
          <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

          {/* Drop zone overlay */}
          {isDragOverMap && draggingDriver && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
              style={{
                background: 'rgba(59,130,246,0.08)',
                border: '3px dashed rgba(59,130,246,0.5)',
                borderRadius: 2,
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(15,15,15,0.9)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', backdropFilter: 'blur(8px)' }}
              >
                <span>📍</span>
                <span>Drop to set home base for {draggingDriver.name}</span>
              </div>
            </div>
          )}

          {/* Legend */}
          {!isDragOverMap && (
            <div className="absolute top-3 right-3 z-10 bg-neutral-900/90 backdrop-blur rounded-lg p-2.5 text-[10px] space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: READY_COLOR }} />
                <span className="text-neutral-400">Pay Ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PENDING_COLOR }} />
                <span className="text-neutral-400">Stripe Pending</span>
              </div>
              <div className="text-neutral-600 pt-0.5 border-t border-neutral-800">Drag pin to update</div>
            </div>
          )}

          {/* Confirm panel */}
          {pendingSave && (
            <div className="absolute bottom-4 left-4 right-4 z-20 bg-neutral-900/97 backdrop-blur border border-neutral-700 rounded-xl p-4 shadow-2xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pendingSave.paymentReady ? READY_COLOR : PENDING_COLOR }} />
                    <span className="text-sm font-semibold text-white">{pendingSave.name}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 ml-4">
                    {pendingSave.lat.toFixed(5)}, {pendingSave.lng.toFixed(5)}
                  </div>
                </div>
                <button onClick={() => setPendingSave(null)} className="text-neutral-600 hover:text-white text-sm ml-2">✕</button>
              </div>

              {/* Label */}
              <div className="mb-3">
                <label className="text-[10px] text-neutral-500 block mb-1">Area label (editable)</label>
                <input
                  type="text"
                  value={savingLabel}
                  onChange={e => setSavingLabel(e.target.value)}
                  placeholder="e.g. East Atlanta, Midtown, College Park"
                  maxLength={50}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
                  autoFocus
                />
              </div>

              {/* SMS preview */}
              {pendingSave.phone ? (
                <div className="mb-3 bg-neutral-800/60 rounded-lg p-2.5">
                  <div className="text-[9px] text-neutral-500 mb-1 uppercase tracking-wide">SMS to {pendingSave.phone}</div>
                  <div className="text-[11px] text-neutral-300 leading-relaxed">{smsPreview}</div>
                  <div className="text-[9px] text-neutral-600 mt-1">{smsPreview.length} / 155 chars</div>
                </div>
              ) : (
                <div className="mb-3 text-[10px] text-neutral-600 italic">No phone on file — SMS unavailable</div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {pendingSave.phone && (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: '#22c55e18', border: '1px solid #22c55e55', color: READY_COLOR }}
                  >
                    {saving ? 'Saving…' : 'Save & Text Driver'}
                  </button>
                )}
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc' }}
                >
                  {saving ? 'Saving…' : 'Save Only'}
                </button>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl text-xs font-medium shadow-lg"
              style={{
                background: toast.kind === 'ok' ? '#22c55e18' : '#ef444418',
                border: `1px solid ${toast.kind === 'ok' ? '#22c55e55' : '#ef444455'}`,
                color: toast.kind === 'ok' ? READY_COLOR : '#ef4444',
                backdropFilter: 'blur(8px)',
              }}
            >
              {toast.text}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .mapboxgl-ctrl-logo { width: 60px !important; height: 16px !important; opacity: 0.1 !important; }
        .mapboxgl-ctrl-attrib { font-size: 8px !important; opacity: 0.1 !important; background: transparent !important; }
      `}</style>
    </div>
  );
}

function createMarkerEl(color: string, paymentReady: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    background: ${color}; border: 2.5px solid rgba(255,255,255,0.8);
    cursor: grab; box-shadow: 0 0 10px ${color}55;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; line-height: 1;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    will-change: transform;
  `;
  el.textContent = paymentReady ? '✓' : '🚗';
  el.setAttribute('data-color', color);
  return el;
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-neutral-900 rounded-lg px-2.5 py-1.5 text-xs">
      {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
      <span className="text-neutral-500">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
