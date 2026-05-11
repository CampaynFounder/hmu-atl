'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  clerkId: string;
  userId: string | null;
  profileType: string | null;
  serverLocationUpdatedAt: string | null;
  serverLat: string | null;
  serverLng: string | null;
  serverAccuracy: number | null;
}

type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'error';

interface GeoSnapshot {
  ts: number;
  ok: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  errorCode?: number;
  errorMessage?: string;
}

interface PostSnapshot {
  ts: number;
  status: number | null;
  body: string;
  ok: boolean;
  errorMessage?: string;
}

export default function GeoDebugClient(props: Props) {
  const [secureContext, setSecureContext] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState<string>('');
  const [userAgent, setUserAgent] = useState<string>('');
  const [displayMode, setDisplayMode] = useState<string>('');
  const [hasGeo, setHasGeo] = useState<boolean | null>(null);
  const [hasPerms, setHasPerms] = useState<boolean | null>(null);
  const [permState, setPermState] = useState<PermState>('unsupported');
  const [permEventCount, setPermEventCount] = useState(0);
  const [visibility, setVisibility] = useState<string>('');
  const [getPosResult, setGetPosResult] = useState<GeoSnapshot | null>(null);
  const [watchPositions, setWatchPositions] = useState<GeoSnapshot[]>([]);
  const [postResult, setPostResult] = useState<PostSnapshot | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    setSecureContext(typeof window !== 'undefined' ? window.isSecureContext : null);
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    setUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (typeof window !== 'undefined') {
      if (window.matchMedia('(display-mode: standalone)').matches) setDisplayMode('standalone (PWA)');
      else if (window.matchMedia('(display-mode: minimal-ui)').matches) setDisplayMode('minimal-ui');
      else setDisplayMode('browser');
    }
    setHasGeo(typeof navigator !== 'undefined' && 'geolocation' in navigator);
    setHasPerms(typeof navigator !== 'undefined' && 'permissions' in navigator);
    setVisibility(typeof document !== 'undefined' ? document.visibilityState : '');

    const onVis = () => setVisibility(document.visibilityState);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!('permissions' in navigator)) {
      setPermState('unsupported');
      return;
    }
    let permStatus: PermissionStatus | null = null;
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((status) => {
      permStatus = status;
      setPermState(status.state as PermState);
      status.onchange = () => {
        setPermState(status.state as PermState);
        setPermEventCount((c) => c + 1);
      };
    }).catch(() => {
      setPermState('error');
    });
    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  const tryGetPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setGetPosResult({ ts: Date.now(), ok: false, errorMessage: 'geolocation not on navigator' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGetPosResult({
          ts: Date.now(), ok: true,
          lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setGetPosResult({
          ts: Date.now(), ok: false,
          errorCode: err.code, errorMessage: err.message,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const toggleWatch = useCallback(() => {
    if (watching) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setWatching(false);
      return;
    }
    if (!navigator.geolocation) {
      setWatchPositions((prev) => [...prev, { ts: Date.now(), ok: false, errorMessage: 'geolocation not on navigator' }]);
      return;
    }
    setWatching(true);
    setWatchPositions([]);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setWatchPositions((prev) => [
          { ts: Date.now(), ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
          ...prev,
        ].slice(0, 10));
      },
      (err) => {
        setWatchPositions((prev) => [
          { ts: Date.now(), ok: false, errorCode: err.code, errorMessage: err.message },
          ...prev,
        ].slice(0, 10));
      },
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 30000 }
    );
  }, [watching]);

  const tryPostLocation = useCallback(async () => {
    if (!getPosResult || !getPosResult.ok || getPosResult.lat == null || getPosResult.lng == null) {
      setPostResult({ ts: Date.now(), status: null, body: '', ok: false, errorMessage: 'No good position from Get Current Position — tap that first' });
      return;
    }
    try {
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: getPosResult.lat, lng: getPosResult.lng, accuracy: Math.round(getPosResult.accuracy ?? 0) }),
      });
      const text = await res.text();
      setPostResult({ ts: Date.now(), status: res.status, body: text, ok: res.ok });
    } catch (e) {
      setPostResult({ ts: Date.now(), status: null, body: '', ok: false, errorMessage: e instanceof Error ? e.message : String(e) });
    }
  }, [getPosResult]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16, color: '#00E676', fontWeight: 700 }}>GEO DEBUG</h1>

      <Section title="Server-side (what staging Neon currently has)">
        <Kv k="clerk_id" v={props.clerkId} />
        <Kv k="user_id" v={props.userId ?? '(not in users table)'} />
        <Kv k="profile_type" v={props.profileType ?? '—'} />
        <Kv k="driver_profiles.location_updated_at" v={props.serverLocationUpdatedAt ?? 'NULL'} />
        <Kv k="driver_profiles.current_lat" v={props.serverLat ?? 'NULL'} />
        <Kv k="driver_profiles.current_lng" v={props.serverLng ?? 'NULL'} />
        <Kv k="driver_profiles.location_accuracy_m" v={props.serverAccuracy == null ? 'NULL' : String(props.serverAccuracy)} />
      </Section>

      <Section title="Browser environment">
        <Kv k="isSecureContext" v={fmt(secureContext)} good={secureContext === true} bad={secureContext === false} />
        <Kv k="origin" v={origin} />
        <Kv k="display-mode" v={displayMode} />
        <Kv k="document.visibilityState" v={visibility} good={visibility === 'visible'} />
        <Kv k="navigator.geolocation present" v={fmt(hasGeo)} good={hasGeo === true} bad={hasGeo === false} />
        <Kv k="navigator.permissions present" v={fmt(hasPerms)} good={hasPerms === true} bad={hasPerms === false} />
        <Kv k="userAgent" v={userAgent} mono />
      </Section>

      <Section title="Permission state (live)">
        <Kv
          k="permissions.query({geolocation}).state"
          v={permState}
          good={permState === 'granted'}
          bad={permState === 'denied'}
        />
        <Kv k="onchange events seen" v={String(permEventCount)} />
        <p style={{ color: '#999', marginTop: 8 }}>
          If state is &apos;denied&apos; you must clear it at the OS / browser level — no in-page button can override.
          On iPhone: Settings → Privacy & Security → Location Services (must be ON) → Safari Websites = While Using.
          In Safari: tap AA → Website Settings → Location → Ask.
        </p>
      </Section>

      <Section title="Try getCurrentPosition">
        <button onClick={tryGetPosition} style={btn}>Get Current Position</button>
        {getPosResult && (
          <pre style={pre}>{JSON.stringify(getPosResult, null, 2)}</pre>
        )}
        {getPosResult && !getPosResult.ok && (
          <p style={{ color: '#ff5252', marginTop: 8 }}>
            errorCode meaning: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
            {' '}If you see 1 here while Safari shows &apos;Allow&apos;, a layer above Safari is blocking — usually
            Location Services off at the system level, or in-page denial from a prior Deny tap.
          </p>
        )}
      </Section>

      <Section title="Try watchPosition (driver-publisher equivalent)">
        <button onClick={toggleWatch} style={btn}>
          {watching ? 'Stop watching' : 'Start watching (low accuracy, 30s timeout)'}
        </button>
        {watchPositions.length > 0 && (
          <pre style={pre}>{JSON.stringify(watchPositions, null, 2)}</pre>
        )}
      </Section>

      <Section title="Try POST /api/driver/location (real publisher fetch)">
        <button onClick={tryPostLocation} style={btn}>POST to /api/driver/location</button>
        {postResult && (
          <pre style={pre}>{JSON.stringify(postResult, null, 2)}</pre>
        )}
        <p style={{ color: '#999', marginTop: 8 }}>
          Uses the coords from Get Current Position above. 403 = not signed in as a driver.
          200 with throttled:true = server-side rate limit (1/20s per driver). 200 ok = row written.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #222' }}>
      <h2 style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function Kv({ k, v, good, bad, mono }: { k: string; v: string; good?: boolean; bad?: boolean; mono?: boolean }) {
  const color = good ? '#00E676' : bad ? '#ff5252' : '#e5e5e5';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 6, wordBreak: 'break-all' }}>
      <span style={{ color: '#6b7280', fontSize: 11 }}>{k}</span>
      <span style={{ color, fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{v}</span>
    </div>
  );
}

function fmt(v: boolean | null): string {
  if (v == null) return '—';
  return v ? 'true' : 'false';
}

const btn: React.CSSProperties = {
  background: '#00E676', color: '#000', border: 'none', borderRadius: 100,
  padding: '12px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  width: '100%', marginBottom: 8,
};

const pre: React.CSSProperties = {
  background: '#111', border: '1px solid #222', borderRadius: 8, padding: 10,
  fontSize: 11, overflow: 'auto', maxHeight: 240, marginTop: 8,
  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
};
