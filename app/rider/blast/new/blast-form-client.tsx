'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MapboxSuggestion {
  name: string;
  full_address: string;
  mapbox_id: string;
}

interface PointPick {
  lat: number;
  lng: number;
  address: string;
}

type Block =
  | 'pickup'
  | 'dropoff'
  | 'trip_type'
  | 'when'
  | 'storage'
  | 'price'
  | 'driver_pref';

interface FormDraft {
  pickup: PointPick | null;
  dropoff: PointPick | null;
  trip_type: 'one_way' | 'round_trip';
  when: 'now' | 'in_1h' | 'tonight' | 'tomorrow_am' | 'custom';
  customWhen: string | null;
  storage: boolean;
  price: number | null;
  driver_pref: 'male' | 'female' | 'any';
}

const DRAFT_KEY = 'blast_draft';
const DRAFT_TTL_MS = 60 * 60 * 1000;

const EMPTY_DRAFT: FormDraft = {
  pickup: null,
  dropoff: null,
  trip_type: 'one_way',
  when: 'now',
  customWhen: null,
  storage: false,
  price: null,
  driver_pref: 'any',
};

// Mapbox session token — billed per session, regenerate on form mount.
function newSessionToken(): string {
  return 'sess_' + crypto.randomUUID();
}

function loadDraft(): FormDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as { draft: FormDraft; savedAt: number };
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...parsed.draft };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(d: FormDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ draft: d, savedAt: Date.now() }),
    );
  } catch { /* quota or private mode — fine */ }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* */ }
}

function whenToISO(d: FormDraft): string | null {
  const now = new Date();
  if (d.when === 'now') return null;
  if (d.when === 'in_1h') return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (d.when === 'tonight') {
    const t = new Date(now);
    t.setHours(20, 0, 0, 0);
    if (t.getTime() < now.getTime() + 60 * 60_000) t.setDate(t.getDate() + 1);
    return t.toISOString();
  }
  if (d.when === 'tomorrow_am') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t.toISOString();
  }
  if (d.when === 'custom' && d.customWhen) {
    const t = new Date(d.customWhen);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
  }
  return null;
}

export default function BlastFormClient() {
  const router = useRouter();
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [openBlock, setOpenBlock] = useState<Block | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{
    distance_mi: number;
    suggested_price_dollars: number;
    deposit_cents: number;
    pricing: { min_price_dollars: number; max_price_dollars: number; price_per_mile_dollars: number };
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sessionToken = useRef<string>(newSessionToken());

  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDraft(draft);
  }, [draft, hydrated]);

  // Recompute estimate when both endpoints are picked.
  useEffect(() => {
    if (!draft.pickup || !draft.dropoff) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    fetch('/api/blast/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup: { lat: draft.pickup.lat, lng: draft.pickup.lng },
        dropoff: { lat: draft.dropoff.lat, lng: draft.dropoff.lng },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setEstimate(data);
        // If no user-set price yet, seed with the suggestion.
        setDraft((d) => (d.price == null ? { ...d, price: data.suggested_price_dollars } : d));
      })
      .finally(() => !cancelled && setEstimating(false));
    return () => {
      cancelled = true;
    };
  }, [draft.pickup, draft.dropoff]);

  const finalPrice = draft.price ?? estimate?.suggested_price_dollars ?? 25;
  const depositDollars = estimate ? estimate.deposit_cents / 100 : null;

  const valid = !!(draft.pickup && draft.dropoff && finalPrice > 0);

  const handleSubmit = useCallback(async () => {
    if (!valid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: { lat: draft.pickup!.lat, lng: draft.pickup!.lng, address: draft.pickup!.address },
          dropoff: { lat: draft.dropoff!.lat, lng: draft.dropoff!.lng, address: draft.dropoff!.address },
          trip_type: draft.trip_type,
          scheduled_for: whenToISO(draft),
          storage: draft.storage,
          driver_preference: draft.driver_pref,
          price_dollars: finalPrice,
        }),
      });

      if (res.status === 401) {
        // Auth gate. Persist draft and bounce to sign-up.
        router.push(`/sign-up?redirect_url=${encodeURIComponent('/rider/blast/new')}`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        blastId?: string;
      };
      if (res.status === 412 && body.error === 'PHOTO_REQUIRED') {
        router.push(`/rider/blast/new/photo`);
        return;
      }
      if (res.status === 412 && body.error === 'PAYMENT_METHOD_REQUIRED') {
        router.push(`/rider/settings?tab=payment&from=blast`);
        return;
      }
      if (!res.ok || !body.blastId) {
        setSubmitError(body.message || body.error || 'Could not send blast. Try again.');
        setSubmitting(false);
        return;
      }
      clearDraft();
      router.push(`/rider/blast/${body.blastId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Network error');
      setSubmitting(false);
    }
  }, [draft, finalPrice, valid, router]);

  const tripTypeLabel = draft.trip_type === 'round_trip' ? 'Round trip' : 'One way';
  const whenLabel = useMemo(() => {
    if (draft.when === 'now') return 'Now';
    if (draft.when === 'in_1h') return 'In 1 hour';
    if (draft.when === 'tonight') return 'Tonight 8pm';
    if (draft.when === 'tomorrow_am') return 'Tomorrow morning';
    if (draft.when === 'custom' && draft.customWhen) return new Date(draft.customWhen).toLocaleString();
    return 'Pick a time';
  }, [draft.when, draft.customWhen]);

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <header className="sticky top-0 z-30 bg-black/85 backdrop-blur-xl border-b border-neutral-900">
        <div className="px-4 py-4">
          <h1 className="text-lg font-bold">Find a Ride</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Tell drivers what you need. They&rsquo;ll HMU back.
          </p>
        </div>
      </header>

      <main className="px-3 pt-3 space-y-2">
        <Card
          label="Pickup"
          value={draft.pickup?.address ?? 'Where are you?'}
          open={openBlock === 'pickup'}
          onToggle={() => setOpenBlock(openBlock === 'pickup' ? null : 'pickup')}
        >
          <AddressInput
            sessionToken={sessionToken.current}
            onPick={(p) => {
              setDraft((d) => ({ ...d, pickup: p }));
              setOpenBlock('dropoff');
            }}
          />
        </Card>

        <Card
          label="Dropoff"
          value={draft.dropoff?.address ?? 'Where to?'}
          open={openBlock === 'dropoff'}
          onToggle={() => setOpenBlock(openBlock === 'dropoff' ? null : 'dropoff')}
        >
          <AddressInput
            sessionToken={sessionToken.current}
            onPick={(p) => {
              setDraft((d) => ({ ...d, dropoff: p }));
              setOpenBlock('when');
            }}
          />
        </Card>

        <Card
          label="Trip type"
          value={tripTypeLabel}
          open={openBlock === 'trip_type'}
          onToggle={() => setOpenBlock(openBlock === 'trip_type' ? null : 'trip_type')}
        >
          <div className="flex gap-2">
            {(['one_way', 'round_trip'] as const).map((tt) => (
              <button
                key={tt}
                onClick={() => {
                  setDraft((d) => ({ ...d, trip_type: tt }));
                  setOpenBlock(null);
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  draft.trip_type === tt
                    ? 'bg-white text-black'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {tt === 'one_way' ? 'One way' : 'Round trip'}
              </button>
            ))}
          </div>
        </Card>

        <Card
          label="When"
          value={whenLabel}
          open={openBlock === 'when'}
          onToggle={() => setOpenBlock(openBlock === 'when' ? null : 'when')}
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['now', 'Now'],
                ['in_1h', 'In 1 hour'],
                ['tonight', 'Tonight 8pm'],
                ['tomorrow_am', 'Tomorrow 9am'],
              ] as const
            ).map(([key, lab]) => (
              <button
                key={key}
                onClick={() => {
                  setDraft((d) => ({ ...d, when: key, customWhen: null }));
                  setOpenBlock(null);
                }}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  draft.when === key ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {lab}
              </button>
            ))}
            <input
              type="datetime-local"
              value={draft.customWhen ?? ''}
              min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setDraft((d) => ({ ...d, when: 'custom', customWhen: e.target.value }))}
              className="col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white"
            />
          </div>
        </Card>

        <Card
          label="Storage"
          value={draft.storage ? 'Yes — bringing bags' : 'No'}
          open={openBlock === 'storage'}
          onToggle={() => setOpenBlock(openBlock === 'storage' ? null : 'storage')}
        >
          <p className="text-xs text-neutral-500 mb-3">
            Bringing groceries, luggage, or anything bigger than a backpack? Toggle on so drivers know.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDraft((d) => ({ ...d, storage: true }));
                setOpenBlock(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                draft.storage ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => {
                setDraft((d) => ({ ...d, storage: false }));
                setOpenBlock(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                !draft.storage ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              No
            </button>
          </div>
        </Card>

        <Card
          label="Your price"
          value={`$${finalPrice}`}
          open={openBlock === 'price'}
          onToggle={() => setOpenBlock(openBlock === 'price' ? null : 'price')}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDraft((d) => ({ ...d, price: Math.max(1, (d.price ?? finalPrice) - 5) }))}
              className="w-12 h-12 rounded-xl bg-neutral-800 text-xl font-bold"
            >
              −
            </button>
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold tabular-nums">${finalPrice}</div>
              {estimate && (
                <div className="text-[11px] text-neutral-500 mt-1">
                  ~{estimate.distance_mi} mi · suggested ${estimate.suggested_price_dollars}
                </div>
              )}
            </div>
            <button
              onClick={() => setDraft((d) => ({ ...d, price: (d.price ?? finalPrice) + 5 }))}
              className="w-12 h-12 rounded-xl bg-neutral-800 text-xl font-bold"
            >
              +
            </button>
          </div>
        </Card>

        <Card
          label="Driver"
          value={
            draft.driver_pref === 'any' ? 'Any' :
            draft.driver_pref === 'female' ? 'Women only' : 'Men only'
          }
          open={openBlock === 'driver_pref'}
          onToggle={() => setOpenBlock(openBlock === 'driver_pref' ? null : 'driver_pref')}
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['any', 'Any'],
                ['female', 'Women'],
                ['male', 'Men'],
              ] as const
            ).map(([key, lab]) => (
              <button
                key={key}
                onClick={() => {
                  setDraft((d) => ({ ...d, driver_pref: key }));
                  setOpenBlock(null);
                }}
                className={`py-2.5 rounded-xl text-sm font-medium ${
                  draft.driver_pref === key ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {lab}
              </button>
            ))}
          </div>
        </Card>
      </main>

      {submitError && (
        <div className="px-4 mt-4 text-center text-sm text-red-400">{submitError}</div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-5 pt-3 bg-gradient-to-t from-black via-black/95 to-transparent">
        <button
          onClick={handleSubmit}
          disabled={!valid || submitting || estimating}
          className="block w-full bg-white text-black text-center font-bold py-4 rounded-2xl text-base disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors shadow-2xl shadow-white/10"
        >
          {submitting
            ? 'Sending…'
            : valid && depositDollars != null
              ? `Send to Drivers · $${depositDollars.toFixed(0)} deposit`
              : 'Send to Drivers'}
        </button>
        <p className="text-center text-[11px] text-neutral-600 mt-2">
          Deposit is held, not charged. Refunded if no driver matches.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface CardProps {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Card({ label, value, open, onToggle, children }: CardProps) {
  return (
    <section
      className={`bg-neutral-900 border rounded-2xl overflow-hidden transition-colors ${
        open ? 'border-white/30' : 'border-neutral-800'
      }`}
    >
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
          <div className="text-sm text-white mt-0.5">{value}</div>
        </div>
        <span className={`text-neutral-600 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 motion-safe:animate-[slideDown_200ms_ease-out]">{children}</div>
      )}
    </section>
  );
}

function AddressInput({
  sessionToken,
  onPick,
}: {
  sessionToken: string;
  onPick: (p: PointPick) => void;
}) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      setLoading(true);
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
      url.searchParams.set('session_token', sessionToken);
      url.searchParams.set('country', 'us');
      url.searchParams.set('bbox', '-84.8,33.5,-84.1,34.1');
      url.searchParams.set('limit', '6');
      url.searchParams.set('types', 'address,poi,place,neighborhood,locality');
      url.searchParams.set('language', 'en');
      fetch(url.toString())
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data) => {
          setSuggestions(
            (data.suggestions || []).map((s: Record<string, unknown>) => ({
              name: s.name as string,
              full_address: (s.full_address as string) || (s.place_formatted as string) || '',
              mapbox_id: s.mapbox_id as string,
            })),
          );
        })
        .finally(() => setLoading(false));
    }, 250);
  }, [q, sessionToken]);

  const handlePick = useCallback(
    async (s: MapboxSuggestion) => {
      const url = new URL(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapbox_id}`,
      );
      url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
      url.searchParams.set('session_token', sessionToken);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      onPick({
        lat,
        lng,
        address: (feature.properties.full_address as string) || (feature.properties.place_formatted as string) || s.name,
      });
    },
    [sessionToken, onPick],
  );

  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type an address or neighborhood"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-sm text-white"
      />
      {loading && <div className="text-xs text-neutral-500 mt-2">Searching…</div>}
      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {suggestions.map((s) => (
            <li key={s.mapbox_id}>
              <button
                onClick={() => handlePick(s)}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 transition-colors"
              >
                <div className="text-sm text-white">{s.name}</div>
                <div className="text-[11px] text-neutral-500">{s.full_address}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
