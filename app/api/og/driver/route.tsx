import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { getDriverProfileByHandle } from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

// Driver shares without an uploaded vehicle/thumbnail photo fall back to the
// static brand OG card. Redirect (rather than rendering a text-only JSX card)
// so the crawler hits the same CDN-cached asset every marketing page uses.
function logoFallback(req: NextRequest) {
  return NextResponse.redirect(new URL('/og-image.jpeg', req.url), 302);
}

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  if (!handle) return logoFallback(req);

  const profile = await getDriverProfileByHandle(handle);
  if (!profile) return logoFallback(req);

  const p = profile as unknown as Record<string, unknown>;
  const name = (p.display_name as string) || handle;
  const areas = Array.isArray(p.areas) ? (p.areas as string[]).slice(0, 4).join(' · ') : 'Metro Atlanta';
  const vehiclePhotoUrl = ((p.vehicle_info as Record<string, unknown>)?.photo_url as string) || null;
  const rawThumb = (p.thumbnail_url as string) || null;
  // Only use thumbnail if it's an image file (not a video)
  const thumbnailIsImage = rawThumb && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(rawThumb);
  const photoUrl = vehiclePhotoUrl || (thumbnailIsImage ? rawThumb : null);

  // No driver photo? Fall back to the static brand card.
  if (!photoUrl) return logoFallback(req);

  // Route the photo through Cloudflare Image Transformations so EXIF
  // Orientation is honored — Satori reads raw bytes and ignores EXIF, so
  // iPhone portrait uploads (which store landscape pixels + a "rotate 90"
  // tag) render sideways without this.
  //
  // Why fetch the bytes server-side (instead of just passing the transform
  // URL to <img src>): empirically, when Satori inside the Worker fetches
  // a same-origin /cdn-cgi/image/ URL, it does not get the transformed
  // result — likely a same-zone subrequest quirk where /cdn-cgi/image is
  // not interposed for the Worker's outbound fetch. By fetching the bytes
  // ourselves and embedding as a data URL, we guarantee Satori sees the
  // already-rotated, already-resized JPEG.
  //
  // Falls back to the raw R2 URL if anything fails so cards always render.
  const origin = new URL(req.url).origin;
  const transformUrl = `${origin}/cdn-cgi/image/width=800,format=jpeg,quality=85/${photoUrl}`;
  let displayPhotoUrl: string = photoUrl;
  try {
    const resp = await fetch(transformUrl);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Chunked base64 — String.fromCharCode.apply blows the stack > ~100k args
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + CHUNK))
        );
      }
      displayPhotoUrl = `data:image/jpeg;base64,${btoa(binary)}`;
    }
  } catch {
    // network blip — keep raw URL fallback
  }

  // Fetch chill score
  let chillScore = 0;
  try {
    const userRows = await sql`
      SELECT chill_score FROM users WHERE id = ${p.user_id as string} LIMIT 1
    `;
    if (userRows.length) chillScore = Number((userRows[0] as { chill_score: number }).chill_score ?? 0);
  } catch {
    // non-fatal
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#080808',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Left: Photo — centered in frame, never cropped. Always present
          here because the no-photo case redirected to the static fallback. */}
      <div style={{
        width: '400px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        padding: '24px',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og Satori renderer only supports <img> */}
        <img
          src={displayPhotoUrl}
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: '20px',
          }}
        />
      </div>

      {/* Right: Info */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 56px',
        }}
      >
        {/* HMU ATL badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: '#00E676',
              color: '#080808',
              fontSize: '14px',
              fontWeight: 800,
              padding: '6px 16px',
              borderRadius: '100px',
              letterSpacing: '2px',
            }}
          >
            HMU ATL
          </div>
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1,
            marginBottom: '16px',
          }}
        >
          {name}
        </div>

        {/* Areas */}
        <div
          style={{
            fontSize: '22px',
            color: '#888888',
            marginBottom: '32px',
          }}
        >
          {areas}
        </div>

        {/* Vibe meter */}
        <OgVibeMeter score={chillScore} />

        {/* CTA */}
        <div
          style={{
            background: '#00E676',
            color: '#080808',
            fontSize: '24px',
            fontWeight: 800,
            padding: '18px 40px',
            borderRadius: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '320px',
          }}
        >
          Book {name}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}

/**
 * Static version of VibeRatingBar for OG image rendering (Satori).
 * No animations, no state — just flexbox and inline styles.
 */
function OgVibeMeter({ score }: { score: number }) {
  const TOTAL_BARS = 20;
  const pct = Math.min(100, Math.max(0, score));
  const litCount = Math.round((pct / 100) * TOTAL_BARS);

  const tier = pct >= 90 ? 'Cool AF' : pct >= 75 ? 'CHILL' : pct >= 50 ? 'Aight' : pct >= 25 ? 'Sketchy' : 'WEIRDO';
  const tierEmoji = pct >= 90 ? '😎' : pct >= 75 ? '✅' : pct >= 50 ? '🤷' : pct >= 25 ? '👀' : '🚩';
  const tierColor = pct >= 75 ? '#00E676' : pct >= 50 ? '#FFD600' : pct >= 25 ? '#FF9100' : '#FF5252';

  function barColor(i: number): string {
    const p = i / (TOTAL_BARS - 1);
    if (p < 0.25) return '#FF5252';
    if (p < 0.40) return '#FF7043';
    if (p < 0.55) return '#FF9100';
    if (p < 0.65) return '#FFC107';
    if (p < 0.75) return '#FFD600';
    if (p < 0.85) return '#8BC34A';
    return '#00E676';
  }

  const tiers = [
    { label: 'WEIRDO', color: '#FF5252' },
    { label: 'Sketchy', color: '#FF9100' },
    { label: 'Aight', color: '#FFD600' },
    { label: 'CHILL', color: '#8BC34A' },
    { label: 'Cool AF', color: '#00E676' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '36px', width: '100%' }}>
      {/* Header: "Vibe" label + tier */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', color: '#888', letterSpacing: '3px', textTransform: 'uppercase' as const }}>
          Vibe
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>{tierEmoji}</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: tierColor }}>{tier}</span>
        </div>
      </div>

      {/* Bar meter */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '40px' }}>
        {Array.from({ length: TOTAL_BARS }).map((_, i) => {
          const lit = i < litCount;
          const color = barColor(i);
          const h = 10 + Math.round((i / (TOTAL_BARS - 1)) * 26); // 10px → 36px
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: '3px',
              flex: 1, alignItems: 'stretch', height: `${h}px`,
            }}>
              <div style={{
                flex: '45%',
                borderRadius: '2px',
                background: lit ? color : '#1a1a1a',
                opacity: lit ? 1 : 0.3,
              }} />
              <div style={{
                flex: '55%',
                borderRadius: '2px',
                background: lit ? color : '#1a1a1a',
                opacity: lit ? 1 : 0.3,
              }} />
            </div>
          );
        })}
      </div>

      {/* Tier labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        {tiers.map(t => (
          <span key={t.label} style={{
            fontSize: t.label === tier ? '12px' : '10px',
            fontWeight: t.label === tier ? 800 : 500,
            color: t.label === tier ? t.color : '#444',
          }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

