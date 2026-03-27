import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { getDriverProfileByHandle } from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';
import DriverShareProfileClient from './driver-share-profile-client';

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ bookingOpen?: string; promo?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { promo } = await searchParams;
  const profile = await getDriverProfileByHandle(handle);
  if (!profile) return { title: 'Driver not found — HMU ATL' };

  const name = profile.first_name;
  const areas = Array.isArray(profile.areas) ? profile.areas.join(', ') : '';
  const p = profile as unknown as Record<string, unknown>;

  const ogImage = `https://atl.hmucashride.com/api/og/driver?handle=${handle}&v=2${promo ? `&promo=${promo}` : ''}`;

  const displayName = (p.display_name as string) || name || handle;

  // Promo mode: driver recruitment messaging — use static image for fast preview
  if (promo === 'driver') {
    const promoTitle = 'Get Paid Upfront | No More Blank Trips | Create Your FREE Profile';
    const promoDesc = 'Ride scammers hate paying upfront. Use HMU anytime but def when rider vibes is a lil off. We verify payment - Protect Riders & Drivers. No Shows = No Loss. Sign Up Free.';
    const promoImage = 'https://atl.hmucashride.com/og-image.jpeg';
    return {
      title: promoTitle,
      description: promoDesc,
      openGraph: {
        title: promoTitle,
        description: promoDesc,
        url: `https://atl.hmucashride.com/d/${handle}?promo=driver`,
        siteName: 'HMUCASHRIDE',
        type: 'website',
        images: [{ url: promoImage, width: 1200, height: 630, alt: promoTitle }],
      },
      twitter: {
        card: 'summary_large_image',
        title: promoTitle,
        description: promoDesc,
        images: [promoImage],
      },
    };
  }

  // Default: regular driver profile OG
  const ogTitle = `${displayName} Doin Cash Rides. HMU ATL!`;

  return {
    title: ogTitle,
    description: `Book ${displayName} directly. Serving ${areas}. No surge, no fees — just cash rides.`,
    openGraph: {
      title: ogTitle,
      description: `${areas} • Payment-ready rides in Metro ATL`,
      url: `https://atl.hmucashride.com/d/${handle}`,
      siteName: 'HMU ATL Cash Ride',
      type: 'profile',
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: `${areas} • No surge, no fees — just cash rides.`,
      images: [ogImage],
    },
  };
}

export default async function DriverSharePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { bookingOpen, promo } = await searchParams;
  const { userId: clerkId } = await auth();
  const isLoggedIn = !!clerkId;

  const profile = await getDriverProfileByHandle(handle);
  if (!profile) {
    const { DriverOnBreak } = await import('./on-break');
    return <DriverOnBreak handle={handle} />;
  }

  // Fetch user-level data + live status + active ride + service menu in parallel
  const [userRows, liveRows, activeRideRows, serviceRows] = await Promise.all([
    sql`
      SELECT tier, chill_score, completed_rides, account_status
      FROM users WHERE id = ${profile.user_id} LIMIT 1
    `,
    sql`
      SELECT id FROM hmu_posts
      WHERE user_id = ${profile.user_id}
        AND post_type = 'driver_available'
        AND status = 'active'
        AND expires_at > NOW()
      LIMIT 1
    `,
    sql`
      SELECT id FROM rides
      WHERE driver_id = ${profile.user_id}
        AND status IN ('matched', 'otw', 'here', 'active', 'in_progress')
      LIMIT 1
    `,
    sql`
      SELECT COALESCE(dsm.custom_name, smi.name) as name, COALESCE(dsm.custom_icon, smi.icon) as icon,
        dsm.price, dsm.pricing_type, dsm.unit_label
      FROM driver_service_menu dsm
      LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
      WHERE dsm.driver_id = ${profile.user_id} AND dsm.is_active = true
      ORDER BY dsm.sort_order LIMIT 10
    `,
  ]);

  if (!userRows.length) notFound();

  const user = userRows[0] as {
    tier: string;
    chill_score: number;
    completed_rides: number;
    account_status: string;
  };

  // Don't show suspended/banned or hidden drivers
  if (user.account_status === 'suspended' || user.account_status === 'banned') {
    notFound();
  }

  const profileAny = profile as unknown as Record<string, unknown>;
  const displayName = (profileAny.display_name as string)
    || profile.handle
    || 'Driver';

  // Show BRB page if profile is hidden
  if (profileAny.profile_visible === false) {
    const photoUrl = (profile.vehicle_info as Record<string, unknown>)?.photo_url as string | null ?? null;
    return <DriverBrbPage name={displayName} photoUrl={photoUrl} />;
  }

  const driverData = {
    handle: profile.handle!,
    displayName,
    areas: Array.isArray(profile.areas) ? profile.areas : [],
    pricing: profile.pricing as Record<string, unknown>,
    schedule: profile.schedule as Record<string, unknown>,
    videoUrl: profileAny.show_video_on_link !== false ? ((profileAny.video_url as string) || null) : null,
    vehiclePhotoUrl: (profile.vehicle_info as Record<string, unknown>)?.photo_url as string | null ?? null,
    isHmuFirst: user.tier === 'hmu_first',
    chillScore: Number(user.chill_score ?? 0),
    completedRides: Number(user.completed_rides ?? 0),
    acceptDirectBookings: profile.accept_direct_bookings,
    minRiderChillScore: Number(profile.min_rider_chill_score),
    requireOgStatus: profile.require_og_status,
    isLive: liveRows.length > 0,
    onRide: activeRideRows.length > 0,
    advanceNoticeHours: Number(profileAny.advance_notice_hours ?? 0),
    acceptsCash: (profileAny.accepts_cash as boolean) || (profileAny.cash_only as boolean) || false,
    cashOnly: (profileAny.cash_only as boolean) || false,
    vehicleInfo: (() => {
      const vi = profile.vehicle_info as Record<string, unknown> | null;
      if (!vi?.make) return null;
      return {
        label: [vi.year, vi.make, vi.model].filter(Boolean).join(' '),
        maxRiders: (Number(vi.max_adults || 0) + Number(vi.max_children || 0)) || null,
      };
    })(),
    services: serviceRows.map((s: Record<string, unknown>) => ({
      name: s.name as string,
      icon: s.icon as string,
      price: Number(s.price ?? 0),
      pricingType: (s.pricing_type as string) || 'flat',
      unitLabel: (s.unit_label as string) || null,
    })),
  };

  return (
    <DriverShareProfileClient
      driver={driverData}
      autoOpenBooking={bookingOpen === '1'}
      isLoggedIn={isLoggedIn}
      isPromo={promo === 'driver'}
    />
  );
}

function DriverBrbPage({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <div style={{
      background: '#080808',
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
      color: '#fff',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Blurred background photo */}
      {photoUrl && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${photoUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(30px) brightness(0.3)',
          transform: 'scale(1.2)',
        }} />
      )}

      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        padding: '40px 24px',
        maxWidth: '360px',
      }}>
        {/* Avatar circle */}
        {photoUrl ? (
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            overflow: 'hidden',
            margin: '0 auto 24px',
            border: '3px solid rgba(255,255,255,0.15)',
          }}>
            <img
              src={photoUrl}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '48px',
            margin: '0 auto 24px',
            border: '3px solid rgba(255,255,255,0.1)',
          }}>
            {name.charAt(0)}
          </div>
        )}

        <h1 style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: '48px',
          lineHeight: 1,
          marginBottom: '8px',
        }}>
          {name}
        </h1>

        <p style={{
          fontSize: '18px',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: '32px',
          lineHeight: 1.4,
        }}>
          brb. not doin rides atm.
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '16px 20px',
          fontSize: '14px',
          color: 'rgba(255,255,255,0.4)',
          lineHeight: 1.5,
        }}>
          Check back later or save this link — {name} will be back.
        </div>

        <div style={{
          marginTop: '24px',
          background: '#00E676',
          color: '#080808',
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '2px',
          textTransform: 'uppercase' as const,
          padding: '6px 16px',
          borderRadius: '100px',
          display: 'inline-block',
        }}>
          HMU ATL
        </div>
      </div>
    </div>
  );
}
