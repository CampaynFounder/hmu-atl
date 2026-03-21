'use client';

import { useState, useEffect } from 'react';
import { MapPin, Check, AlertTriangle } from 'lucide-react';

interface LocationPermissionProps {
  userType: 'driver' | 'rider';
}

type PermState = 'prompt' | 'requesting' | 'granted' | 'denied';

export function LocationPermission({ userType }: LocationPermissionProps) {
  const [state, setState] = useState<PermState>('prompt');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios');
    else if (/android/.test(ua)) setPlatform('android');

    // Check if already granted
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') setState('granted');
        else if (result.state === 'denied') setState('denied');
      }).catch(() => {});
    }
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      setState('denied');
      return;
    }
    setState('requesting');
    navigator.geolocation.getCurrentPosition(
      () => setState('granted'),
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const driverReasons = [
    { icon: '📍', text: 'Share your live location with riders so they can track your arrival' },
    { icon: '🗺️', text: 'Get turn-by-turn navigation to pickup and dropoff' },
    { icon: '🛡️', text: 'GPS ride history protects you in disputes' },
  ];

  const riderReasons = [
    { icon: '📍', text: 'Share your pickup location so your driver can find you' },
    { icon: '🚗', text: 'Track your driver in real-time when they\'re OTW' },
    { icon: '🛡️', text: 'GPS tracking on every ride for your safety' },
  ];

  const reasons = userType === 'driver' ? driverReasons : riderReasons;

  return (
    <div className="space-y-5">
      {/* Why we need it */}
      <div className="space-y-3">
        {reasons.map((r) => (
          <div key={r.text} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-700">
            <span className="text-xl flex-shrink-0">{r.icon}</span>
            <div className="text-sm text-zinc-300">{r.text}</div>
          </div>
        ))}
      </div>

      {/* Action area */}
      {state === 'prompt' && (
        <button
          type="button"
          onClick={requestLocation}
          className="w-full flex items-center justify-center gap-3 rounded-full bg-[#00E676] px-6 py-4 font-black text-black text-lg transition-all hover:shadow-[0_0_24px_rgba(0,230,118,0.3)] active:scale-95"
        >
          <MapPin className="h-5 w-5" />
          Enable Location
        </button>
      )}

      {state === 'requesting' && (
        <div className="text-center py-4">
          <div className="inline-block w-8 h-8 border-3 border-[#00E676]/30 border-t-[#00E676] rounded-full animate-spin mb-3" />
          <p className="text-sm text-zinc-400">Waiting for permission...</p>
        </div>
      )}

      {state === 'granted' && (
        <div className="flex items-center justify-center gap-3 rounded-full bg-[#00E676]/10 border border-[#00E676]/30 px-6 py-4">
          <div className="w-8 h-8 rounded-full bg-[#00E676] flex items-center justify-center">
            <Check className="w-5 h-5 text-black" strokeWidth={3} />
          </div>
          <span className="font-bold text-[#00E676] text-lg">Location enabled</span>
        </div>
      )}

      {state === 'denied' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300">
              Location was denied. You can enable it later, but you&apos;ll need it for rides.
            </p>
          </div>

          {platform === 'ios' && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">How to enable on iPhone</p>
              <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
                <li>Open <strong className="text-white">Settings</strong></li>
                <li>Scroll to <strong className="text-white">Safari</strong> (or your browser)</li>
                <li>Tap <strong className="text-white">Location</strong></li>
                <li>Select <strong className="text-white">Allow</strong></li>
              </ol>
            </div>
          )}

          {platform === 'android' && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
              <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">How to enable on Android</p>
              <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
                <li>Open <strong className="text-white">Settings</strong></li>
                <li>Go to <strong className="text-white">Apps</strong> &gt; <strong className="text-white">Chrome</strong> (or your browser)</li>
                <li>Tap <strong className="text-white">Permissions</strong> &gt; <strong className="text-white">Location</strong></li>
                <li>Select <strong className="text-white">Allow</strong></li>
              </ol>
            </div>
          )}

          <button
            type="button"
            onClick={requestLocation}
            className="w-full rounded-full border border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      <p className="text-center text-xs text-zinc-500">
        {userType === 'driver'
          ? 'Location is only tracked during active rides — never in the background.'
          : 'Your location is only shared when you tap COO — never tracked otherwise.'}
      </p>
    </div>
  );
}
