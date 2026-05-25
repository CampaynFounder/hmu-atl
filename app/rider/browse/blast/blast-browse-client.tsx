'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BrowseDriverRow } from '@/lib/hmu/browse-drivers-query';

interface Props {
  initialDrivers: BrowseDriverRow[];
}

function LocationBadge({ source, area }: { source: 'live' | 'home' | 'pinned' | null; area: string | null }) {
  if (!source) return null;
  if (source === 'live') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        Live
      </span>
    );
  }
  if (source === 'home') {
    return <span className="text-neutral-400">🏠{area ? ` ${area}` : ' home'}</span>;
  }
  return <span className="text-neutral-600">📍 last active</span>;
}

// Read-only social-proof grid. No booking drawer, no per-card HMU button.
// The single CTA — sticky bottom — routes to /rider/blast/new.
export default function BlastBrowseClient({ initialDrivers }: Props) {
  const [drivers, setDrivers] = useState(initialDrivers);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(initialDrivers.length);
  const [done, setDone] = useState(initialDrivers.length === 0);

  useEffect(() => {
    if (done) return;
    const onScroll = () => {
      if (loadingMore) return;
      if (window.innerHeight + window.scrollY < document.body.offsetHeight - 800) return;
      setLoadingMore(true);
      fetch(`/api/rider/browse/list?offset=${offset}&limit=24`)
        .then((r) => (r.ok ? r.json() : { drivers: [] }))
        .then((data: { drivers: BrowseDriverRow[] }) => {
          if (!data.drivers || data.drivers.length === 0) {
            setDone(true);
          } else {
            setDrivers((d) => [...d, ...data.drivers]);
            setOffset((o) => o + data.drivers.length);
          }
        })
        .finally(() => setLoadingMore(false));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset, loadingMore, done]);

  return (
    <div className="min-h-screen bg-black text-white pt-14 pb-32">
      <header className="sticky top-14 z-30 bg-black/85 backdrop-blur-xl border-b border-neutral-900">
        <div className="px-4 py-4">
          <h1 className="text-lg font-bold">Find a Ride</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Tell us where you&rsquo;re headed. Drivers HMU back. You pick.
          </p>
        </div>
      </header>

      <main className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {drivers.map((d) => (
            <article
              key={d.handle}
              className="bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800"
            >
              <div className="aspect-[4/3] bg-neutral-800 relative">
                {d.photoUrl || d.videoUrl ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${d.photoUrl ?? ''})` }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-neutral-700">
                    {d.displayName?.[0] ?? d.handle?.[0] ?? '?'}
                  </div>
                )}
                {d.isHmuFirst && (
                  <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider bg-amber-500/90 text-black px-1.5 py-0.5 rounded">
                    First
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="text-sm font-semibold truncate">
                  {d.displayName || d.handle}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-1 flex-wrap">
                  {Number.isFinite(d.chillScore) && d.chillScore > 0 && (
                    <span className="text-emerald-500">✅ {Math.round(d.chillScore)}%</span>
                  )}
                  {d.minPrice > 0 && <span>· from ${d.minPrice}</span>}
                  {d.locationSource && (
                    <>
                      <span className="text-neutral-700">·</span>
                      <LocationBadge source={d.locationSource} area={d.areas?.[0] ?? null} />
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {loadingMore && (
          <div className="text-center text-neutral-500 text-xs py-6">Loading…</div>
        )}
        {done && drivers.length > 0 && (
          <div className="text-center text-neutral-700 text-xs py-6">That&rsquo;s everyone</div>
        )}
      </main>

      {/* Sticky CTA — pulses gently to stay magnetic. Respects reduced-motion. */}
      <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-5 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
        <Link
          href="/rider/blast/new"
          className="block w-full bg-white text-black text-center font-bold py-4 rounded-2xl text-base motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] shadow-2xl shadow-white/10"
        >
          Find a Ride →
        </Link>
        <p className="text-center text-[11px] text-neutral-600 mt-2">
          Free to send. Pay only when a driver matches.
        </p>
      </div>
    </div>
  );
}
