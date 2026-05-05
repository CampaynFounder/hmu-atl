import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// Custom OG card for /rider/browse — a 3x2 grid of driver photos,
// lightly blurred so the faces stay recognizable but the card reads as
// "many drivers" rather than spotlighting any one driver. Centered title
// over a darkening gradient.
//
// Re-renders on every request (dynamic) so the grid stays fresh as the
// driver pool changes. Fast enough — six small CF Image transforms in
// parallel, each cached at the edge after the first hit.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TILE_W = 400;
const TILE_H = 315;
const GRID_COLS = 3;
const GRID_ROWS = 2;
const TILE_COUNT = GRID_COLS * GRID_ROWS;

function fallback(req: NextRequest) {
  return NextResponse.redirect(new URL('/og-image.jpeg', req.url), 302);
}

// Pull a transformed (resized + lightly blurred) JPEG from the source URL
// and return as a base64 data URL. cf.image is the canonical way to invoke
// CF Image Transformations from inside a Worker — same-zone /cdn-cgi/image
// URLs would 404 from a Worker subrequest. Returns null on any failure so
// the caller can skip that tile gracefully.
async function fetchBlurredTile(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      cf: {
        image: {
          width: TILE_W,
          height: TILE_H,
          fit: 'cover',
          format: 'jpeg',
          quality: 75,
          blur: 12, // 1–250; 8–15 keeps faces recognizable but soft
        },
      },
    } as RequestInit);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Pull a sample of drivers — same eligibility as /rider/browse but scoped
  // to those who have a vehicle photo so every tile renders with media.
  const rows = await sql`
    SELECT dp.handle, dp.display_name, dp.vehicle_info
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.profile_visible = true
      AND u.account_status = 'active'
      AND dp.vehicle_info ? 'photo_url'
      AND dp.vehicle_info->>'photo_url' IS NOT NULL
    ORDER BY u.tier DESC, u.chill_score DESC, dp.handle ASC
    LIMIT ${TILE_COUNT}
  `;

  const photoUrls = (rows as Array<Record<string, unknown>>)
    .map((r) => ((r.vehicle_info as Record<string, unknown> | null)?.photo_url as string | null))
    .filter((u: string | null): u is string => !!u);

  if (photoUrls.length === 0) return fallback(req);

  // Fetch all tiles in parallel — each one is independent.
  const tiles = await Promise.all(photoUrls.map(fetchBlurredTile));
  const usable = tiles.filter((t): t is string => !!t);
  if (usable.length === 0) return fallback(req);

  // Pad the grid out so the layout stays even if some fetches failed.
  while (usable.length < TILE_COUNT) usable.push(usable[usable.length % Math.max(1, photoUrls.length)]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: '#080808',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Photo grid — 3 columns × 2 rows, fills the entire 1200x630 frame. */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexWrap: 'wrap',
      }}>
        {usable.slice(0, TILE_COUNT).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- next/og Satori only supports <img>
          <img
            key={i}
            src={src}
            alt=""
            width={TILE_W}
            height={TILE_H}
            style={{
              width: `${TILE_W}px`,
              height: `${TILE_H}px`,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ))}
      </div>

      {/* Light dark overlay so text reads cleanly without erasing faces. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex',
        background: 'linear-gradient(180deg, rgba(8,8,8,0.35) 0%, rgba(8,8,8,0.55) 60%, rgba(8,8,8,0.78) 100%)',
      }} />

      {/* Centered branding + CTA. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        <div style={{
          background: '#00E676',
          color: '#080808',
          fontSize: '20px',
          fontWeight: 800,
          padding: '8px 22px',
          borderRadius: '100px',
          letterSpacing: '3px',
          marginBottom: '24px',
        }}>
          HMU ATL
        </div>

        <div style={{
          fontSize: '108px',
          fontWeight: 900,
          color: '#ffffff',
          lineHeight: 1,
          letterSpacing: '-2px',
          textShadow: '0 4px 24px rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}>
          BROWSE DRIVERS
        </div>

        <div style={{
          marginTop: '20px',
          fontSize: '28px',
          color: '#e6e6e6',
          textAlign: 'center',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          maxWidth: '900px',
        }}>
          Pick a driver. Send a request. Pull up.
        </div>

        <div style={{
          marginTop: '28px',
          display: 'flex',
          gap: '14px',
        }}>
          <div style={{
            display: 'flex',
            background: 'rgba(0,230,118,0.18)',
            border: '2px solid rgba(0,230,118,0.5)',
            color: '#00E676',
            fontSize: '18px',
            fontWeight: 700,
            padding: '10px 18px',
            borderRadius: '100px',
            letterSpacing: '1px',
          }}>
            atl.hmucashride.com/rider/browse
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
