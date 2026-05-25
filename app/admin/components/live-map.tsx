'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAbly } from '@/hooks/use-ably';
import { useMarket } from '@/app/admin/components/market-context';

interface RideStop {
  latitude: number;
  longitude: number;
  address: string;
  order: number;
  reached_at: string | null;
  verified: boolean;
}

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
  stops: RideStop[] | null;
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

interface PendingRequest {
  id: string;
  riderName: string;
  riderHandle: string | null;
  areas: string[];
  pickupAreaSlug: string | null;
  dropoffAreaSlug: string | null;
  price: number | null;
  createdAt: string;
  expiresAt: string | null;
  approxLat: number | null;
  approxLng: number | null;
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
  requested: '#a855f7',   // purple
};

const STATUS_LABELS: Record<string, string> = {
  matched: 'Matched',
  otw: 'OTW',
  here: 'Here',
  confirming: 'Confirming',
  active: 'Active',
  requested: 'Requested',
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
  const { selectedMarket, selectedMarketId } = useMarket();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  // Marker registries — one per marker type so cleanup is surgical
  const markersRef = useRef<Map<string, unknown>>(new Map());        // live driver 🚗
  const pickupMarkersRef = useRef<Map<string, unknown>>(new Map());  // A pins
  const dropoffMarkersRef = useRef<Map<string, unknown>>(new Map()); // B pins
  const waitingMarkersRef = useRef<Map<string, unknown>>(new Map()); // matched-no-GPS ring
  const stopMarkersRef = useRef<Map<string, unknown>>(new Map());    // 1/2/3 stop dots
  const pendingMarkersRef = useRef<Map<string, unknown>>(new Map()); // unmatched 👤 pins
  const routeLinesRef = useRef<Set<string>>(new Set());
  const animRafRef = useRef<number | null>(null);
  const animOffsetRef = useRef<number>(0);

  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingRequest | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(['matched', 'otw', 'here', 'confirming', 'active', 'requested'])
  );
  const [showHistory, setShowHistory] = useState(false);
  const historyMarkersRef = useRef<unknown[]>([]);
  const historySourceAdded = useRef(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  // Live GPS positions from Ably
  const livePositions = useRef<Map<string, { lat: number; lng: number; timestamp: number }>>(new Map());
  // Rides with open safety events
  const [safetyAlertRides, setSafetyAlertRides] = useState<Set<string>>(new Set());
  const safetyAlertRidesRef = useRef<Set<string>>(new Set());
  safetyAlertRidesRef.current = safetyAlertRides;

  // Fetch open safety events on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/safety?scope=open&limit=100')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSafetyAlertRides(new Set<string>(data.openRideIds ?? []));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch pending requests — poll every 30s so new blasts appear promptly
  useEffect(() => {
    const mq = selectedMarketId ? `?marketId=${selectedMarketId}&limit=100` : '?limit=100';
    let cancelled = false;

    const load = () => {
      fetch(`/api/admin/rides/pending${mq}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setPendingRequests(data.requests ?? []);
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedMarketId]);

  const handleAdminEvent = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;

    if (msg.name === 'driver_location') {
      const rideId = data.rideId as string;
      const lat = data.lat as number;
      const lng = data.lng as number;
      const ts = data.timestamp as number;
      if (!rideId || !lat || !lng) return;

      livePositions.current.set(rideId, { lat, lng, timestamp: ts });

      const marker = markersRef.current.get(rideId);
      if (marker) {
        (marker as { setLngLat(coords: [number, number]): void }).setLngLat([lng, lat]);
      }
    } else if (msg.name === 'safety_alert') {
      const rideId = data.rideId as string;
      if (!rideId) return;
      setSafetyAlertRides((prev) => {
        if (prev.has(rideId)) return prev;
        const next = new Set(prev); next.add(rideId); return next;
      });
      const marker = markersRef.current.get(rideId);
      if (marker) {
        const el = (marker as { getElement(): HTMLDivElement }).getElement();
        el.classList.add('safety-alert-pulse');
      }
    } else if (msg.name === 'safety_event_resolved') {
      const rideId = data.rideId as string;
      if (!rideId) return;
      fetch('/api/admin/safety?scope=open&limit=100')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const next = new Set<string>(d.openRideIds ?? []);
          setSafetyAlertRides(next);
          for (const [id, marker] of markersRef.current) {
            const el = (marker as { getElement(): HTMLDivElement }).getElement();
            if (next.has(id)) el.classList.add('safety-alert-pulse');
            else el.classList.remove('safety-alert-pulse');
          }
        })
        .catch(() => {});
    } else {
      onRidesRefresh?.();
    }
  }, [onRidesRefresh]);

  useAbly({ channelName: 'admin:feed', onMessage: handleAdminEvent });

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
      } catch { setMapError(true); }
    };

    loadMapbox();
    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Re-center on market switch
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !selectedMarket) return;
    const m = selectedMarket as { centerLat?: number | null; centerLng?: number | null };
    if (m.centerLat == null || m.centerLng == null) return;
    (mapRef.current as { flyTo: (opts: { center: [number, number]; zoom?: number; duration?: number }) => void }).flyTo({
      center: [Number(m.centerLng), Number(m.centerLat)],
      zoom: 11,
      duration: 1200,
    });
  }, [selectedMarket, mapLoaded]);

  // Animate dashoffset on active-status route lines — gives a "moving" effect
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;

    const activeRideIds = new Set(rides.filter(r => r.status === 'active').map(r => r.id));

    function animate() {
      animOffsetRef.current = (animOffsetRef.current - 0.25 + 8) % 8;
      for (const lineId of routeLinesRef.current) {
        const rideId = lineId.replace('route-', '');
        if (!activeRideIds.has(rideId)) continue;
        try {
          map.setPaintProperty(lineId, 'line-dashoffset', -animOffsetRef.current);
        } catch { /* layer transitioning */ }
      }
      animRafRef.current = requestAnimationFrame(animate);
    }

    animRafRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
    };
  }, [mapLoaded, rides]);

  // ─── Main marker + route update ───────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;

    const filteredRides = rides.filter(r => statusFilter.has(r.status));

    // Track which markers/keys are still needed this cycle
    const activeIds = new Set<string>();
    const activeWaitingIds = new Set<string>();
    const activeStopKeys = new Set<string>();

    filteredRides.forEach((ride) => {
      const color = STATUS_COLORS[ride.status] ?? '#ffffff';
      const hasPickup = !!(ride.pickupLat && ride.pickupLng);
      const hasDropoff = !!(ride.dropoffLat && ride.dropoffLng);

      // Compute driver position BEFORE the early-return guard so rides that
      // only have live GPS (e.g. OTW with no confirmed pickup coords yet)
      // still render a driver marker and route line.
      const live = livePositions.current.get(ride.id);
      const driverLat = live?.lat ?? (ride.hasLiveGps ? ride.lastLat : null);
      const driverLng = live?.lng ?? (ride.hasLiveGps ? ride.lastLng : null);
      const hasDriver = !!(driverLat && driverLng);

      if (!hasPickup && !hasDropoff && !hasDriver) return;

      activeIds.add(ride.id);
      const isStale = ride.hasLiveGps && ride.lastGpsAt
        ? Date.now() - new Date(ride.lastGpsAt).getTime() > STALE_THRESHOLD_MS
        : false;

      // ── Pickup A pin ──
      if (hasPickup && !pickupMarkersRef.current.has(ride.id)) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 12px; height: 12px; border-radius: 50%;
          background: transparent; border: 3px solid #22c55e;
          cursor: pointer;
        `;
        el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); setSelectedPending(null); });
        const m = new mapboxgl.Marker({ element: el })
          .setLngLat([ride.pickupLng, ride.pickupLat])
          .addTo(map);
        pickupMarkersRef.current.set(ride.id, m);
      }

      // ── Dropoff B pin ──
      if (hasDropoff && !dropoffMarkersRef.current.has(ride.id)) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 10px; height: 10px; border-radius: 2px;
          background: #ef4444; border: 2px solid rgba(255,255,255,0.5);
          cursor: pointer;
        `;
        el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); setSelectedPending(null); });
        const m = new mapboxgl.Marker({ element: el })
          .setLngLat([ride.dropoffLng, ride.dropoffLat])
          .addTo(map);
        dropoffMarkersRef.current.set(ride.id, m);
      }

      // ── Matched-waiting ring: pulsing blue ring at pickup when driver hasn't moved yet ──
      if (ride.status === 'matched' && !hasDriver && hasPickup) {
        activeWaitingIds.add(ride.id);
        if (!waitingMarkersRef.current.has(ride.id)) {
          const el = document.createElement('div');
          el.style.cssText = `
            width: 20px; height: 20px; border-radius: 50%;
            background: rgba(59,130,246,0.12); border: 2.5px dashed #3b82f6;
            cursor: pointer;
          `;
          el.classList.add('matched-waiting-pulse');
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); setSelectedPending(null); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([ride.pickupLng!, ride.pickupLat!])
            .addTo(map);
          waitingMarkersRef.current.set(ride.id, m);
        }
      }

      // ── Live driver 🚗 ──
      if (hasDriver) {
        const driverColor = isStale ? STALE_COLOR : color;
        const hasAlert = safetyAlertRidesRef.current.has(ride.id);
        const existing = markersRef.current.get(ride.id);
        if (existing) {
          (existing as { setLngLat(c: [number, number]): void }).setLngLat([driverLng!, driverLat!]);
          const el = (existing as { getElement(): HTMLDivElement }).getElement();
          el.style.background = driverColor;
          el.style.boxShadow = `0 0 12px ${driverColor}80`;
          el.classList.toggle('safety-alert-pulse', hasAlert);
        } else {
          const el = document.createElement('div');
          el.style.cssText = `
            width: 28px; height: 28px; border-radius: 50%;
            background: ${driverColor}; border: 2px solid rgba(255,255,255,0.7);
            cursor: pointer; box-shadow: 0 0 12px ${driverColor}80;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; line-height: 1; transition: all 0.3s ease; z-index: 2;
          `;
          el.textContent = '🚗';
          if (hasAlert) el.classList.add('safety-alert-pulse');
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); setSelectedPending(null); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([driverLng!, driverLat!])
            .addTo(map);
          markersRef.current.set(ride.id, m);
        }
      }

      // ── Stop markers 1 / 2 / 3 ──
      if (ride.stops?.length) {
        const sortedStops = [...ride.stops].sort((a, b) => a.order - b.order);
        sortedStops.forEach((stop, idx) => {
          if (!stop.latitude || !stop.longitude) return;
          const stopKey = `${ride.id}-stop-${idx}`;
          activeStopKeys.add(stopKey);
          if (stopMarkersRef.current.has(stopKey)) return;
          const reached = !!stop.reached_at;
          const el = document.createElement('div');
          el.style.cssText = `
            width: 18px; height: 18px; border-radius: 50%;
            background: ${reached ? '#22c55e' : '#111827'};
            border: 2px solid ${reached ? '#22c55e' : color};
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; font-weight: 700;
            color: ${reached ? '#fff' : color};
            cursor: pointer; z-index: 1;
          `;
          el.textContent = String(idx + 1);
          el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedRide(ride); setSelectedPending(null); });
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([stop.longitude, stop.latitude])
            .addTo(map);
          stopMarkersRef.current.set(stopKey, m);
        });
      }

      // ── Route line: pickup → stops (in order) → dropoff ──
      // Driver live position is shown as the 🚗 marker; the line shows the planned route.
      const lineId = `route-${ride.id}`;
      const coords: [number, number][] = [];
      if (hasPickup) coords.push([ride.pickupLng!, ride.pickupLat!]);
      if (ride.stops?.length) {
        [...ride.stops]
          .sort((a, b) => a.order - b.order)
          .forEach((s) => {
            if (s.latitude && s.longitude) coords.push([s.longitude, s.latitude]);
          });
      }
      if (hasDropoff) coords.push([ride.dropoffLng!, ride.dropoffLat!]);

      if (coords.length >= 2) {
        const isActive = ride.status === 'active';
        const geojson = {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: coords },
        };

        if (routeLinesRef.current.has(lineId)) {
          const src = map.getSource(lineId);
          if (src) src.setData(geojson);
        } else {
          try {
            map.addSource(lineId, { type: 'geojson', data: geojson });
            map.addLayer({
              id: lineId,
              type: 'line',
              source: lineId,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': color,
                'line-width': isActive ? 3 : 2,
                'line-opacity': isActive ? 0.75 : 0.45,
                'line-dasharray': isActive ? [2, 2] : [2, 3],
              },
            });
            routeLinesRef.current.add(lineId);
          } catch { /* rapid re-render guard */ }
        }
      }
    });

    // ── Cleanup: remove markers no longer in the filtered set ──
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
    for (const [id, marker] of waitingMarkersRef.current) {
      if (!activeWaitingIds.has(id)) {
        (marker as { remove(): void }).remove();
        waitingMarkersRef.current.delete(id);
      }
    }
    for (const [key, marker] of stopMarkersRef.current) {
      if (!activeStopKeys.has(key)) {
        (marker as { remove(): void }).remove();
        stopMarkersRef.current.delete(key);
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
  }, [rides, mapLoaded, statusFilter, safetyAlertRides]);

  // ─── Pending request markers ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;

    const showPending = statusFilter.has('requested');

    if (!showPending) {
      for (const [, marker] of pendingMarkersRef.current) {
        (marker as { remove(): void }).remove();
      }
      pendingMarkersRef.current.clear();
      return;
    }

    const activeIds = new Set(pendingRequests.filter(p => p.approxLat && p.approxLng).map(p => p.id));

    for (const pending of pendingRequests) {
      if (!pending.approxLat || !pending.approxLng) continue;
      if (pendingMarkersRef.current.has(pending.id)) continue;

      const el = document.createElement('div');
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 50%;
        background: rgba(168,85,247,0.15); border: 2px solid #a855f7;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 13px; z-index: 1;
      `;
      el.textContent = '👤';
      el.classList.add('pending-request-pulse');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedPending(pending);
        setSelectedRide(null);
      });
      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([pending.approxLng, pending.approxLat])
        .addTo(map);
      pendingMarkersRef.current.set(pending.id, m);
    }

    // Remove stale pending markers
    for (const [id, marker] of pendingMarkersRef.current) {
      if (!activeIds.has(id)) {
        (marker as { remove(): void }).remove();
        pendingMarkersRef.current.delete(id);
      }
    }
  }, [pendingRequests, mapLoaded, statusFilter]);

  // ─── History overlay ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;

    if (!showHistory) {
      historyMarkersRef.current.forEach((m: unknown) => (m as { remove(): void }).remove());
      historyMarkersRef.current = [];
      if (historySourceAdded.current) {
        try {
          if (map.getLayer('history-lines')) map.removeLayer('history-lines');
          if (map.getSource('history-lines')) map.removeSource('history-lines');
        } catch { /* ignore */ }
        historySourceAdded.current = false;
      }
      return;
    }

    fetch('/api/admin/rides/history')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.rides || !mapboxgl) return;
        const features: { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'LineString'; coordinates: [number, number][] } }[] = [];

        for (const ride of data.rides) {
          const pEl = document.createElement('div');
          pEl.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#22c55e;opacity:0.6;';
          historyMarkersRef.current.push(
            new mapboxgl.Marker({ element: pEl }).setLngLat([ride.pickupLng, ride.pickupLat]).addTo(map)
          );
          const dEl = document.createElement('div');
          dEl.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#ef4444;opacity:0.6;';
          historyMarkersRef.current.push(
            new mapboxgl.Marker({ element: dEl }).setLngLat([ride.dropoffLng, ride.dropoffLat]).addTo(map)
          );
          features.push({
            type: 'Feature',
            properties: { status: ride.status },
            geometry: { type: 'LineString', coordinates: [[ride.pickupLng, ride.pickupLat], [ride.dropoffLng, ride.dropoffLat]] },
          });
        }

        if (!historySourceAdded.current) {
          try {
            map.addSource('history-lines', { type: 'geojson', data: { type: 'FeatureCollection', features } });
            map.addLayer({ id: 'history-lines', type: 'line', source: 'history-lines', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.12 } });
            historySourceAdded.current = true;
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [showHistory, mapLoaded]);

  function toggleStatus(status: string) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filteredRideCount = rides.filter(r => statusFilter.has(r.status)).length;
  const filteredPendingCount = statusFilter.has('requested') ? pendingRequests.length : 0;
  const filteredCount = filteredRideCount + filteredPendingCount;

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
      <style>{`
        @keyframes hmuSafetyPulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,45,45,0.65), 0 0 12px rgba(255,45,45,0.6); }
          70%  { box-shadow: 0 0 0 18px rgba(255,45,45,0),    0 0 18px rgba(255,45,45,0.4); }
          100% { box-shadow: 0 0 0 0 rgba(255,45,45,0),       0 0 12px rgba(255,45,45,0.6); }
        }
        .safety-alert-pulse {
          animation: hmuSafetyPulse 1.6s ease-out infinite;
          border-color: rgba(255,45,45,0.9) !important;
        }
        @keyframes matchedWaitingPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.55; }
        }
        .matched-waiting-pulse {
          animation: matchedWaitingPulse 1.8s ease-in-out infinite;
        }
        @keyframes pendingRequestPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.5); }
          60% { box-shadow: 0 0 0 8px rgba(168,85,247,0); }
        }
        .pending-request-pulse {
          animation: pendingRequestPulse 2.2s ease-out infinite;
        }
      `}</style>

      <div ref={mapContainer} className="h-96" />

      {/* Status filter chips */}
      <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap" style={{ maxWidth: '70%' }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => {
          if (status === 'confirming') return null; // grouped with 'here'
          const count = status === 'requested'
            ? pendingRequests.length
            : rides.filter(r =>
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

      {/* Bottom bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
        <div className="text-[10px] text-neutral-500 bg-neutral-900/80 backdrop-blur px-2 py-1 rounded">
          {filteredCount} on map
          {filteredPendingCount > 0 && (
            <span className="text-purple-400 ml-1">({filteredPendingCount} waiting)</span>
          )}
        </div>
        <button
          onClick={() => setShowHistory(prev => !prev)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
          style={{
            background: showHistory ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.6)',
            border: showHistory ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
            color: showHistory ? '#fff' : '#666',
            backdropFilter: 'blur(4px)',
          }}
        >
          {showHistory ? '✕ Hide' : '📊'} Ride History
        </button>
      </div>

      {/* Active ride detail popup */}
      {selectedRide && (
        <div className="absolute bottom-3 left-3 right-3 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-xl p-3 text-sm">
          <button
            onClick={() => setSelectedRide(null)}
            className="absolute top-2 right-3 text-neutral-500 hover:text-white text-xs"
          >
            ✕
          </button>

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

          <div className="text-xs text-neutral-300 mb-2">
            <span className="text-white font-medium">{selectedRide.driverName}</span>
            {selectedRide.driverHandle && <span className="text-neutral-500"> @{selectedRide.driverHandle}</span>}
            <span className="text-neutral-600 mx-1">→</span>
            <span className="text-white font-medium">{selectedRide.riderName}</span>
            {selectedRide.riderHandle && <span className="text-neutral-500"> @{selectedRide.riderHandle}</span>}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400 font-mono font-bold text-sm">${selectedRide.price.toFixed(2)}</span>
            {selectedRide.isCash && (
              <span className="text-[9px] font-bold text-yellow-400 bg-yellow-400/15 px-1.5 py-0.5 rounded-full">CASH</span>
            )}
          </div>

          {(selectedRide.pickupAddress || selectedRide.dropoffAddress || (selectedRide.stops?.length ?? 0) > 0) && (
            <div className="text-[11px] text-neutral-400 space-y-1 mb-2 border-t border-neutral-800 pt-2">
              {selectedRide.pickupAddress && (
                <div className="flex gap-1.5">
                  <span className="text-green-500 font-bold flex-shrink-0">A</span>
                  <span className="truncate">{selectedRide.pickupAddress}</span>
                </div>
              )}
              {selectedRide.stops?.length
                ? [...selectedRide.stops]
                    .sort((a, b) => a.order - b.order)
                    .map((stop, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <span className="w-3.5 h-3.5 rounded-full bg-neutral-700 text-[8px] font-bold text-neutral-300 flex-shrink-0 flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className={`truncate ${stop.reached_at ? 'line-through text-neutral-600' : ''}`}>
                          {stop.address}
                        </span>
                        {stop.reached_at && <span className="text-green-500 text-[9px] flex-shrink-0">✓</span>}
                      </div>
                    ))
                : null}
              {selectedRide.dropoffAddress && (
                <div className="flex gap-1.5">
                  <span className="text-red-500 font-bold flex-shrink-0">B</span>
                  <span className="truncate">{selectedRide.dropoffAddress}</span>
                </div>
              )}
            </div>
          )}

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

      {/* Pending request detail popup */}
      {selectedPending && (
        <div className="absolute bottom-3 left-3 right-3 bg-neutral-900/95 backdrop-blur border border-purple-800/60 rounded-xl p-3 text-sm">
          <button
            onClick={() => setSelectedPending(null)}
            className="absolute top-2 right-3 text-neutral-500 hover:text-white text-xs"
          >
            ✕
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-500" />
            <span className="font-semibold text-purple-300 text-xs">Waiting for Driver</span>
            <span className="text-neutral-500 text-[10px] ml-auto font-mono">
              {selectedPending.id.slice(0, 8)}
            </span>
          </div>

          <div className="text-xs text-neutral-300 mb-2">
            <span className="text-white font-medium">{selectedPending.riderName}</span>
            {selectedPending.riderHandle && <span className="text-neutral-500"> @{selectedPending.riderHandle}</span>}
          </div>

          {selectedPending.price && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-400 font-mono font-bold text-sm">${selectedPending.price.toFixed(2)}</span>
              <span className="text-neutral-500 text-[10px]">asking price</span>
            </div>
          )}

          {(selectedPending.pickupAreaSlug || selectedPending.dropoffAreaSlug || selectedPending.areas.length > 0) && (
            <div className="text-[11px] text-neutral-400 space-y-1 mb-2 border-t border-neutral-800 pt-2">
              {selectedPending.pickupAreaSlug && (
                <div className="flex gap-1.5">
                  <span className="text-green-500 font-bold flex-shrink-0">From</span>
                  <span>{selectedPending.pickupAreaSlug}</span>
                </div>
              )}
              {selectedPending.dropoffAreaSlug && (
                <div className="flex gap-1.5">
                  <span className="text-red-500 font-bold flex-shrink-0">To</span>
                  <span>{selectedPending.dropoffAreaSlug}</span>
                </div>
              )}
              {!selectedPending.pickupAreaSlug && selectedPending.areas.length > 0 && (
                <div className="text-neutral-500">{selectedPending.areas.join(', ')}</div>
              )}
            </div>
          )}

          <div className="text-[10px] text-neutral-500 border-t border-neutral-800 pt-1.5">
            <span>Posted {timeAgo(selectedPending.createdAt)}</span>
            {selectedPending.expiresAt && (
              <span className="ml-3">
                Expires {timeAgo(selectedPending.expiresAt)}
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
          <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-blue-400" style={{ background: 'transparent' }} />
          <span className="text-neutral-400">Matched (waiting)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full border border-purple-500 flex items-center justify-center text-[8px]">👤</span>
          <span className="text-neutral-400">Unmatched request</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-neutral-700 flex items-center justify-center text-[7px] font-bold text-neutral-300">1</span>
          <span className="text-neutral-400">Stop</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: STALE_COLOR }} />
          <span className="text-neutral-400">Stale GPS (&gt;90s)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-neutral-500" />
          <span className="text-neutral-400">Route · — active</span>
        </div>
      </div>

      <style jsx global>{`
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
