// Shared live ride map — Mapbox (dark-v11), used by both rider and driver
// active-ride screens. Mirrors the web ride view: pickup/dropoff/driver/rider
// markers + a route line from the Mapbox Directions API, auto-fit to bounds.
//
// Coordinates throughout @rnmapbox are [longitude, latitude].

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Mapbox, { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import { LatLng, ViewerRole } from './types';
import { showsDriverMarker } from './ride-status';

const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';

interface RideMapProps {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  stops?: LatLng[];
  driverLocation: LatLng | null;
  riderLocation: LatLng | null;
  viewerRole: ViewerRole;
  status: string;
  mapboxToken: string;
  style?: ViewStyle;
}

type RouteGeoJSON = { type: 'Feature'; geometry: { type: 'LineString'; coordinates: number[][] }; properties: Record<string, never> } | null;

// Before the ride starts the live leg is driver→pickup; once active it's
// driver→(stops)→dropoff. Either falls back to pickup→dropoff when there's no
// driver GPS yet, so the full trip is always drawn.
function routeLeg(status: string, driver: LatLng | null, pickup: LatLng | null, stops: LatLng[], dropoff: LatLng | null): LatLng[] {
  const enRoute = ['otw', 'here', 'confirming'].includes(status);
  const active = ['active', 'in_progress'].includes(status);
  if (enRoute && driver && pickup) return [driver, pickup];
  if (active && driver && dropoff) return [driver, ...stops, dropoff];
  if (pickup && dropoff) return [pickup, ...stops, dropoff];
  return [];
}

export function RideMap({
  pickup, dropoff, stops = [], driverLocation, riderLocation, viewerRole, status, mapboxToken, style,
}: RideMapProps) {
  const cameraRef = useRef<Camera>(null);
  const [route, setRoute] = useState<RouteGeoJSON>(null);
  const lastLegKey = useRef<string>('');

  // Set the public runtime (pk) token once.
  useEffect(() => {
    if (mapboxToken) Mapbox.setAccessToken(mapboxToken);
  }, [mapboxToken]);

  const driverVisible = showsDriverMarker(status) && !!driverLocation;
  // First camera move snaps instantly; later moves animate. Tracks whether the
  // initial framing has happened so live driver updates still glide smoothly.
  const didInit = useRef(false);

  // All points the camera should keep in view.
  const visiblePoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [];
    if (pickup) pts.push(pickup);
    if (dropoff) pts.push(dropoff);
    stops.forEach((s) => pts.push(s));
    if (driverVisible && driverLocation) pts.push(driverLocation);
    if (riderLocation) pts.push(riderLocation);
    return pts;
  }, [pickup, dropoff, stops, driverVisible, driverLocation, riderLocation]);

  // Initial camera position, known at mount from pickup/dropoff. Feeding this to
  // <Camera defaultSettings> makes the first frame render already on the ride —
  // instead of Mapbox's default world view, which then has to animate all the way
  // down (the slow "globe → street" fly-in).
  const initialCenter = useMemo<[number, number] | undefined>(() => {
    const p = pickup ?? dropoff ?? stops[0] ?? driverLocation ?? riderLocation;
    return p ? [p.lng, p.lat] : undefined;
  }, [pickup, dropoff, stops, driverLocation, riderLocation]);

  // Fit camera to the visible points (debounced via the effect's natural batching).
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam || visiblePoints.length === 0) return;
    // 0ms = instant snap on the first framing; animate (600/700ms) afterwards.
    const dur = didInit.current ? 600 : 0;
    if (visiblePoints.length === 1) {
      cam.setCamera({ centerCoordinate: [visiblePoints[0].lng, visiblePoints[0].lat], zoomLevel: 14, animationDuration: dur });
      didInit.current = true;
      return;
    }
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of visiblePoints) {
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    }
    cam.fitBounds([maxLng, maxLat], [minLng, minLat], [80, 60, 80, 60], didInit.current ? 700 : 0);
    didInit.current = true;
  }, [visiblePoints]);

  // Fetch the route line for the current leg. Re-fetch when the leg endpoints
  // change meaningfully (keyed to ~4-decimal coords ≈ 11m, so small GPS jitter
  // doesn't spam the Directions API).
  useEffect(() => {
    const leg = routeLeg(status, driverLocation, pickup, stops, dropoff);
    if (leg.length < 2 || !mapboxToken) { setRoute(null); return; }
    const key = leg.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`).join(';');
    if (key === lastLegKey.current) return;
    lastLegKey.current = key;

    // Draw a straight line through the leg immediately so a route is always
    // visible, then upgrade to the road-snapped geometry when the Directions
    // API responds. Without this fallback, any Directions failure (token scope,
    // rate-limit, offline) left the map with no line at all. Mirrors web.
    const straight: number[][] = leg.map((p) => [p.lng, p.lat]);
    setRoute({ type: 'Feature', geometry: { type: 'LineString', coordinates: straight }, properties: {} });

    const coords = leg.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${mapboxToken}&overview=full&geometries=geojson`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const geom = data?.routes?.[0]?.geometry;
        if (geom?.type === 'LineString') {
          setRoute({ type: 'Feature', geometry: geom, properties: {} });
        }
      })
      .catch(() => { /* keep the straight-line fallback */ });
    return () => { cancelled = true; };
  }, [status, driverLocation, pickup, dropoff, stops, mapboxToken]);

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={DARK_STYLE}
        projection="mercator"
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={initialCenter ? { centerCoordinate: initialCenter, zoomLevel: 12 } : undefined}
        />

        {route && (
          <ShapeSource id="ride-route" shape={route}>
            <LineLayer
              id="ride-route-line"
              style={{ lineColor: colors.green, lineWidth: 4, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.9 }}
            />
          </ShapeSource>
        )}

        {pickup && (
          <MarkerView id="pickup" coordinate={[pickup.lng, pickup.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pickupDot} />
          </MarkerView>
        )}

        {stops.map((s, i) => (
          <MarkerView key={`stop-${i}`} id={`stop-${i}`} coordinate={[s.lng, s.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.stopDot} />
          </MarkerView>
        ))}

        {dropoff && (
          <MarkerView id="dropoff" coordinate={[dropoff.lng, dropoff.lat]} anchor={{ x: 0.5, y: 1 }}>
            <Ionicons name="location" size={30} color={colors.green} />
          </MarkerView>
        )}

        {driverVisible && driverLocation && (
          <MarkerView id="driver" coordinate={[driverLocation.lng, driverLocation.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverPin}>
              <Ionicons name="car-sport" size={16} color={colors.bg} />
            </View>
          </MarkerView>
        )}

        {riderLocation && viewerRole === 'driver' && (
          <MarkerView id="rider" coordinate={[riderLocation.lng, riderLocation.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.riderPin} />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.cardAlt },
  pickupDot: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textPrimary,
    borderWidth: 3, borderColor: colors.bg,
  },
  stopDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: colors.amber,
    borderWidth: 2, borderColor: colors.bg,
  },
  driverPin: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  riderPin: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.blue,
    borderWidth: 3, borderColor: colors.bg,
  },
});
