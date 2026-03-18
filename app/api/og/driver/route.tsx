import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getDriverProfileByHandle } from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

export const runtime = 'edge';

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
  const name = (p.display_name as string) || (p.first_name as string) || handle;
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
      {/* Left: Photo */}
      <div style={{ width: '420px', height: '100%', display: 'flex', position: 'relative' }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            width={420}
            height={630}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #141414, #1a1a1a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '120px',
            }}
          >
            🚗
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

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '40px' }}>
          <div
            style={{
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px',
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: '#00E676', fontSize: '24px', fontWeight: 800 }}>
              {chillScore.toFixed(0)}%
            </span>
            <span style={{ color: '#888', fontSize: '14px' }}>Chill</span>
          </div>
        </div>

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
          Book {(p.first_name as string) || 'this driver'}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 }
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
