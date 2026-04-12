'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAbly } from '@/hooks/use-ably';

interface ActiveRide {
  id: string;
  status: string;
  price: number;
  isCash: boolean;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  driverName: string;
  driverHandle: string | null;
  riderName: string;
  riderHandle: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastGpsAt: string | null;
  hasLiveGps: boolean;
  createdAt: string;
  updatedAt: string;
  otwAt: string | null;
  hereAt: string | null;
  startedAt: string | null;
}

interface LiveMapProps {
  rides: ActiveRide[];
  onRidesRefresh?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  matched: '#3b82f6',     // blue
  otw: '#f97316',         // orange
  here: '#eab308',        // yellow
  confirming: '#eab308',  // yellow (same as here)
  active: '#22c55e',      // green
};

const STATUS_LABELS: Record<string, string> = {
  matched: 'Matched',
  otw: 'OTW',
  here: 'Here',
  confirming: 'Confirming',
  active: 'Active',
};

const STALE_COLOR = '#ef4444';
const STALE_THRESHOLD_MS = 90000;

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export function LiveMap({ rides, onRidesRefresh }: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  // Markers: each ride has up to 3 markers (pickup, dropoff, driver) and a route line
  const markersRef = useRef<Map<string, unknown>>(new Map()); // driver/main markers
  const pickupMarkersRef = useRef<Map<string, unknown>>(new Map());
  const dropoffMarkersRef = useRef<Map<string, unknown>>(new Map());
  const routeLinesRef = useRef<Set<string>>(new Set()); // track which ride route sources exist
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(['matched', 'otw', 'here', 'confirming', 'active'])
  );
  // Live GPS positions from Ably — keyed by rideId
  const livePositions = useRef<Map<string, { lat: number; lng: number; timestamp: number }>>(new Map());

  // Handle real-time admin feed events — GPS updates move markers without full refetch
  const handleAdminEvent = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;

    if (msg.name === 'driver_location') {
      const rideId = data.rideId as string;
      const lat = data.lat as number;
      const lng = data.lng as number;
      const ts = data.timestamp as number;
      if (!rideId || !lat || !lng) return;

      livePositions.current.set(rideId, { lat, lng, timestamp: ts });

      // Move the marker directly if it exists
      const marker = markersRef.current.get(rideId);
      if (marker) {
        (marker as { setLngLat(coords: [number, number]): void }).setLngLat([lng, lat]);
      }
    } else {
      // Status changes, new rides, etc. — trigger a full refetch
      onRidesRefresh?.();
    }
  }, [onRidesRefresh]);

  useAbly({
    channelName: 'admin:feed',
    onMessage: handleAdminEvent,
  });

  // Init Mapbox
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { setMapError(true); return; }

    const loadMapbox = async () => {
      try {
        if (!document.getElementById('mapbox-admin-css')) {
          const link = document.createElement('link');
          link.id = 'mapbox-admin-css';
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
        const map = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-84.388, 33.749],
          zoom: 11,
        });
        map.on('load', () => setMapLoaded(true));
        mapRef.current = map;
      } catch { setMapError(true); }
    };

    loadMapbox();
    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when rides or filter changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;

    const filteredRides = rides.filter(r => statusFilter.has(r.status));
    const activeIds = new Set<string>();

    filteredRides.forEach((ride) => {
      const color = STATUS_COLORS[ride.status] ?? '#ffffff';
      const hasPickup = ride.pickupLat && ride.pickupLng;
      const hasDropoff = ride.dropoffLat && ride.dropoffLng;
      if (!hasPickup && !hasDropoff) return;

      activeIds.add(ride.id);

      // Live driver GPS position
      const live = livePositions.current.get(ride.id);
      const driverLat = live?.lat ?? (ride.hasLiveGps ? ride.lastLat : null);
      const driverLng = live?.lng ?? (ride.hasLiveGps ? ride.lastLng : null);
      const hasDriver = driverLat && driverLng;
      const isStale = ride.hasLiveGps && ride.lastGpsAt
        ? Date.now() - new Date(ride.lastGpsAt).getTime() > STALE_THRESHOLD_MS
        : false;

      // ── Pickup marker (A) — green circle ──
      if (hasPickup) {
        const existing = pickupMarkersRef.current.get(ride.id);
        if (!existing) {
          const el = document.createElement('div');
          el.style.cssText = `
            width: 12px; height: 12px; border-radius: 50%;
            background: transparent; border: 3px solid #22c55e;
            cursor: pointer;
          `;
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([ride.pickupLng, ride.pickupLat])
            .addTo(map);
          pickupMarkersRef.current.set(ride.id, m);
        }
      }

      // ── Dropoff marker (B) — red square ──
      if (hasDropoff) {
        const existing = dropoffMarkersRef.current.get(ride.id);
        if (!existing) {
          const el = document.createElement('div');
          el.style.cssText = `
            width: 10px; height: 10px; border-radius: 2px;
            background: #ef4444; border: 2px solid rgba(255,255,255,0.5);
            cursor: pointer;
          `;
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([ride.dropoffLng, ride.dropoffLat])
            .addTo(map);
          dropoffMarkersRef.current.set(ride.id, m);
        }
      }

      // ── Driver marker (🚗) — only when live GPS exists ──
      if (hasDriver) {
        const existing = markersRef.current.get(ride.id);
        const driverColor = isStale ? STALE_COLOR : color;
        if (existing) {
          (existing as { setLngLat(c: [number, number]): void }).setLngLat([driverLng!, driverLat!]);
          const el = (existing as { getElement(): HTMLDivElement }).getElement();
          el.style.background = driverColor;
          el.style.boxShadow = `0 0 12px ${driverColor}80`;
        } else {
          const el = document.createElement('div');
          el.style.cssText = `
            width: 28px; height: 28px; border-radius: 50%;
            background: ${driverColor}; border: 2px solid rgba(255,255,255,0.7);
            cursor: pointer; box-shadow: 0 0 12px ${driverColor}80;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; line-height: 1; transition: all 0.3s ease;
            z-index: 2;
          `;
          el.textContent = '🚗';
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([driverLng!, driverLat!])
            .addTo(map);
          markersRef.current.set(ride.id, m);
        }
      }

      // ── Route line: pickup → (driver) → dropoff ──
      const lineId = `route-${ride.id}`;
      const coords: [number, number][] = [];
      if (hasPickup) coords.push([ride.pickupLng!, ride.pickupLat!]);
      if (hasDriver) coords.push([driverLng!, driverLat!]);
      if (hasDropoff) coords.push([ride.dropoffLng!, ride.dropoffLat!]);

      if (coords.length >= 2) {
        const geojson = {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: coords },
        };

        if (routeLinesRef.current.has(lineId)) {
          // Update existing line
          const src = map.getSource(lineId);
          if (src) src.setData(geojson);
        } else {
          // Add new source + layer
          try {
            map.addSource(lineId, { type: 'geojson', data: geojson });
            map.addLayer({
              id: lineId,
              type: 'line',
              source: lineId,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': color,
                'line-width': 2,
                'line-opacity': 0.4,
                'line-dasharray': [2, 3],
              },
            });
            routeLinesRef.current.add(lineId);
          } catch { /* source may already exist from rapid re-render */ }
        }
      }
    });

    // Remove markers and lines for rides no longer in the list
    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        markersRef.current.delete(id);
        livePositions.current.delete(id);
      }
    }
    for (const [id, marker] of pickupMarkersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        pickupMarkersRef.current.delete(id);
      }
    }
    for (const [id, marker] of dropoffMarkersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        dropoffMarkersRef.current.delete(id);
      }
    }
    for (const lineId of routeLinesRef.current) {
      const rideId = lineId.replace('route-', '');
      if (!activeIds.has(rideId)) {
        try {
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          if (map.getSource(lineId)) map.removeSource(lineId);
        } catch { /* ignore */ }
        routeLinesRef.current.delete(lineId);
      }
    }
  }, [rides, mapLoaded, statusFilter]);

  // Toggle status filter
  function toggleStatus(status: string) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filteredCount = rides.filter(r => statusFilter.has(r.status)).length;

  if (mapError) {
    return (
      <div className="h-96 flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <p className="text-neutral-500 text-sm">Map unavailable</p>
          <p className="text-neutral-600 text-xs mt-1">Configure NEXT_PUBLIC_MAPBOX_TOKEN</p>
          <div className="mt-4 text-left max-w-sm mx-auto">
            {rides.map((r) => (
              <div key={r.id} className="border-b border-neutral-800 py-2 text-xs">
                <span className="text-white">{r.driverName}</span>
                <span className="text-neutral-500"> → {r.riderName}</span>
                <span className="text-neutral-600 ml-2">${r.price}</span>
                <span className="ml-2" style={{ color: STATUS_COLORS[r.status] ?? '#999' }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
            ))}
            {rides.length === 0 && (
              <p className="text-neutral-600 text-xs text-center py-4">No active rides</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapContainer} className="h-96" />

      {/* Status filter toggles */}
      <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap" style={{ maxWidth: '70%' }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => {
          if (status === 'confirming') return null; // grouped with 'here'
          const count = rides.filter(r =>
            status === 'here' ? (r.status === 'here' || r.status === 'confirming') : r.status === status
          ).length;
          const isOn = statusFilter.has(status);
          return (
            <button
              key={status}
              onClick={() => {
                toggleStatus(status);
                if (status === 'here') toggleStatus('confirming');
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-opacity"
              style={{
                background: isOn ? `${color}20` : 'rgba(0,0,0,0.5)',
                border: `1px solid ${isOn ? color : 'rgba(255,255,255,0.1)'}`,
                color: isOn ? color : '#666',
                opacity: isOn ? 1 : 0.6,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOn ? color : '#444' }} />
              {STATUS_LABELS[status]} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Ride count badge */}
      <div className="absolute bottom-3 left-3 text-[10px] text-neutral-500 bg-neutral-900/80 backdrop-blur px-2 py-1 rounded">
        {filteredCount} ride{filteredCount !== 1 ? 's' : ''} on map
      </div>

      {/* Ride detail popup */}
      {selectedRide && (
        <div className="absolute bottom-3 left-3 right-3 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-xl p-3 text-sm">
          <button
            onClick={() => setSelectedRide(null)}
            className="absolute top-2 right-3 text-neutral-500 hover:text-white text-xs"
          >
            ✕
          </button>

          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: STATUS_COLORS[selectedRide.status] ?? '#fff' }} />
            <span className="font-semibold text-white text-xs">
              {STATUS_LABELS[selectedRide.status] ?? selectedRide.status}
            </span>
            <span className="text-neutral-500 text-[10px] ml-auto font-mono">
              {selectedRide.id.slice(0, 8)}
            </span>
          </div>

          {/* People */}
          <div className="text-xs text-neutral-300 mb-2">
            <span className="text-white font-medium">{selectedRide.driverName}</span>
            {selectedRide.driverHandle && <span className="text-neutral-500"> @{selectedRide.driverHandle}</span>}
            <span className="text-neutral-600 mx-1">→</span>
            <span className="text-white font-medium">{selectedRide.riderName}</span>
            {selectedRide.riderHandle && <span className="text-neutral-500"> @{selectedRide.riderHandle}</span>}
          </div>

          {/* Price */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400 font-mono font-bold text-sm">${selectedRide.price.toFixed(2)}</span>
            {selectedRide.isCash && (
              <span className="text-[9px] font-bold text-yellow-400 bg-yellow-400/15 px-1.5 py-0.5 rounded-full">CASH</span>
            )}
          </div>

          {/* Addresses */}
          {(selectedRide.pickupAddress || selectedRide.dropoffAddress) && (
            <div className="text-[11px] text-neutral-400 space-y-1 mb-2 border-t border-neutral-800 pt-2">
              {selectedRide.pickupAddress && (
                <div className="flex gap-1.5">
                  <span className="text-green-500 font-bold flex-shrink-0">A</span>
                  <span className="truncate">{selectedRide.pickupAddress}</span>
                </div>
              )}
              {selectedRide.dropoffAddress && (
                <div className="flex gap-1.5">
                  <span className="text-red-500 font-bold flex-shrink-0">B</span>
                  <span className="truncate">{selectedRide.dropoffAddress}</span>
                </div>
              )}
            </div>
          )}

          {/* Timing */}
          <div className="text-[10px] text-neutral-500 border-t border-neutral-800 pt-1.5 flex gap-3 flex-wrap">
            <span>Created {timeAgo(selectedRide.createdAt)}</span>
            {selectedRide.otwAt && <span>OTW {timeAgo(selectedRide.otwAt)}</span>}
            {selectedRide.hereAt && <span>Here {timeAgo(selectedRide.hereAt)}</span>}
            {selectedRide.startedAt && <span>Started {timeAgo(selectedRide.startedAt)}</span>}
            {selectedRide.hasLiveGps && selectedRide.lastGpsAt && (
              <span className={
                Date.now() - new Date(selectedRide.lastGpsAt).getTime() > STALE_THRESHOLD_MS
                  ? 'text-red-400' : 'text-green-400'
              }>
                GPS {timeAgo(selectedRide.lastGpsAt)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-neutral-900/90 backdrop-blur rounded-lg p-2 text-[10px] space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-green-500" style={{ background: 'transparent' }} />
          <span className="text-neutral-400">Pickup</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: '#ef4444' }} />
          <span className="text-neutral-400">Drop-off</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '11px' }}>🚗</span>
          <span className="text-neutral-400">Driver (live GPS)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: STALE_COLOR }} />
          <span className="text-neutral-400">Stale GPS (&gt;90s)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-neutral-500" />
          <span className="text-neutral-400">Route line</span>
        </div>
      </div>

      {/* Pulse animation */}
      <style jsx global>{`
        @keyframes adminPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .mapboxgl-ctrl-logo {
          width: 60px !important; height: 16px !important; opacity: 0.15 !important;
        }
        .mapboxgl-ctrl-attrib {
          font-size: 8px !important; opacity: 0.15 !important; background: transparent !important;
        }
        .mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-left {
          opacity: 0.2 !important; transform: scale(0.8) !important; transform-origin: bottom left !important;
        }
      `}</style>
    </div>
  );
}
