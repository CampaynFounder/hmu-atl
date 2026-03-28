'use client';

import { useEffect, useRef, useState } from 'react';

interface ActiveRide {
  id: string;
  status: string;
  price: number;
  driverName: string;
  riderName: string;
  lastLat: number | null;
  lastLng: number | null;
  lastGpsAt: string | null;
  createdAt: string;
}

interface LiveMapProps {
  rides: ActiveRide[];
}

const statusColors: Record<string, string> = {
  matched: '#3b82f6',     // blue
  accepted: '#f97316',    // orange (OTW)
  pending: '#eab308',     // yellow (HERE)
  in_progress: '#22c55e', // green (Active)
};

export function LiveMap({ rides }: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapError(true);
      return;
    }

    // Load Mapbox GL JS via script tag (avoids need for npm package)
    const loadMapbox = async () => {
      try {
        // Load CSS
        if (!document.getElementById('mapbox-css')) {
          const link = document.createElement('link');
          link.id = 'mapbox-css';
          link.rel = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
          document.head.appendChild(link);
        }

        // Load JS
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).mapboxgl) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Mapbox script failed'));
            document.head.appendChild(script);
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapboxgl = (window as any).mapboxgl;
        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-84.388, 33.749], // Atlanta
          zoom: 11,
        });

        map.on('load', () => {
          setMapLoaded(true);
        });

        mapRef.current = map;
      } catch {
        setMapError(true);
      }
    };

    loadMapbox();

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when rides change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    // Remove existing markers
    markersRef.current.forEach((m: unknown) => (m as { remove(): void }).remove());
    markersRef.current = [];

    rides.forEach((ride) => {
      if (!ride.lastLat || !ride.lastLng) return;

      // Check if GPS is stale (>90s)
      const isStale = ride.lastGpsAt
        ? Date.now() - new Date(ride.lastGpsAt).getTime() > 90000
        : true;

      const color = isStale ? '#ef4444' : (statusColors[ride.status] ?? '#ffffff');

      const el = document.createElement('div');
      el.className = 'admin-map-marker';
      el.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        background: ${color}; border: 2px solid rgba(255,255,255,0.5);
        cursor: pointer; box-shadow: 0 0 8px ${color}80;
        ${ride.status === 'pending' ? 'animation: pulse 1.5s infinite;' : ''}
      `;

      el.addEventListener('click', () => setSelectedRide(ride));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([ride.lastLng, ride.lastLat])
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    });
  }, [rides, mapLoaded]);

  if (mapError) {
    return (
      <div className="h-96 flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <p className="text-neutral-500 text-sm">Map unavailable</p>
          <p className="text-neutral-600 text-xs mt-1">Configure NEXT_PUBLIC_MAPBOX_TOKEN</p>
          {/* Fallback: ride list */}
          <div className="mt-4 text-left max-w-sm mx-auto">
            {rides.map((r) => (
              <div key={r.id} className="border-b border-neutral-800 py-2 text-xs">
                <span className="text-white">{r.driverName}</span>
                <span className="text-neutral-500"> → {r.riderName}</span>
                <span className="text-neutral-600 ml-2">${r.price}</span>
                <span className={`ml-2 ${statusColors[r.status] ? '' : 'text-neutral-400'}`} style={{ color: statusColors[r.status] }}>
                  {r.status}
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

      {/* Ride detail popup */}
      {selectedRide && (
        <div className="absolute bottom-4 left-4 right-4 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg p-3 text-sm">
          <button
            onClick={() => setSelectedRide(null)}
            className="absolute top-2 right-2 text-neutral-500 hover:text-white text-xs"
          >
            ✕
          </button>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{selectedRide.driverName} → {selectedRide.riderName}</p>
              <p className="text-neutral-400 text-xs mt-0.5">
                ${selectedRide.price} · {selectedRide.status} · {selectedRide.id.slice(0, 8)}
              </p>
            </div>
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: statusColors[selectedRide.status] ?? '#fff' }}
            />
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 right-3 bg-neutral-900/90 backdrop-blur rounded-lg p-2 text-[10px] space-y-1">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-neutral-400 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-neutral-400">Stale GPS</span>
        </div>
      </div>

      {/* Pulse animation + subtle Mapbox branding */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .mapboxgl-ctrl-logo {
          width: 60px !important;
          height: 16px !important;
          opacity: 0.15 !important;
        }
        .mapboxgl-ctrl-attrib {
          font-size: 8px !important;
          opacity: 0.15 !important;
          background: transparent !important;
        }
        .mapboxgl-ctrl-attrib-inner {
          color: #555 !important;
        }
        .mapboxgl-ctrl-bottom-right,
        .mapboxgl-ctrl-bottom-left {
          opacity: 0.2 !important;
          transform: scale(0.8) !important;
          transform-origin: bottom left !important;
        }
      `}</style>
    </div>
  );
}
