import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getDriverProfileByHandle } from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  if (!handle) {
    return new ImageResponse(
      <FallbackCard name="HMU ATL" areas="Metro Atlanta Rides" />,
      { width: 1200, height: 630 }
    );
  }

  const profile = await getDriverProfileByHandle(handle);
  if (!profile) {
    return new ImageResponse(
      <FallbackCard name="HMU ATL" areas="Driver not found" />,
      { width: 1200, height: 630 }
    );
  }

  const p = profile as unknown as Record<string, unknown>;
  const name = (p.display_name as string) || handle;
  const areas = Array.isArray(p.areas) ? (p.areas as string[]).slice(0, 4).join(' · ') : 'Metro Atlanta';
  const vehiclePhotoUrl = ((p.vehicle_info as Record<string, unknown>)?.photo_url as string) || null;
  const rawThumb = (p.thumbnail_url as string) || null;
  // Only use thumbnail if it's an image file (not a video)
  const thumbnailIsImage = rawThumb && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(rawThumb);
  const photoUrl = vehiclePhotoUrl || (thumbnailIsImage ? rawThumb : null);

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
      {/* Left: Photo — centered in frame, never cropped */}
      <div style={{
        width: '400px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        padding: '24px',
      }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: '20px',
            }}
          />
        ) : (
          <div style={{
            width: '200px',
            height: '200px',
            borderRadius: '24px',
            background: '#080808',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="140" height="140" viewBox="0 0 512 512">
              <path d="M 155 140 L 155 310 A 120 120 0 0 0 355 310 L 355 160" fill="none" stroke="#00E676" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
              <polygon points="355,55 275,175 435,175" fill="#00E676"/>
            </svg>
          </div>
        )}
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

function FallbackCard({ name, areas }: { name: string; areas: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#080808',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          background: '#00E676',
          color: '#080808',
          fontSize: '18px',
          fontWeight: 800,
          padding: '8px 24px',
          borderRadius: '100px',
          letterSpacing: '3px',
          marginBottom: '24px',
        }}
      >
        HMU ATL
      </div>
      <div style={{ fontSize: '56px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
        {name}
      </div>
      <div style={{ fontSize: '22px', color: '#888' }}>{areas}</div>
    </div>
  );
}
