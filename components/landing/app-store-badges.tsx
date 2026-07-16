import {
  IOS_APP_STORE_URL,
  GOOGLE_PLAY_URL,
  hasIosApp,
  hasAndroidApp,
  hasAnyApp,
} from '@/lib/app-store';

// Shared badge height so the official Apple lockup and the Google Play badge
// line up at the same size. Both badges render at this height, width auto.
const BADGE_HEIGHT = 48;

// Google "Play" triangle mark (official 4-color glyph).
function GooglePlayGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.6 2.4c-.25.26-.4.66-.4 1.18v16.84c0 .52.15.92.4 1.18l.06.05L13.1 12v-.2L3.66 2.35l-.06.05z" fill="#00E676" />
      <path d="M16.3 15.2 13.1 12v-.2l3.2-3.2.07.04 3.78 2.15c1.08.61 1.08 1.62 0 2.24l-3.78 2.15-.07.02z" fill="#FFCE00" />
      <path d="M16.37 15.16 13.1 11.9l-9.5 9.5c.36.38.94.42 1.6.05l11.17-6.29z" fill="#FF3D00" />
      <path d="M16.37 8.64 5.2 2.35c-.66-.38-1.24-.33-1.6.05l9.5 9.5 3.27-3.26z" fill="#00B0FF" />
    </svg>
  );
}

// Renders the store download badges. Apple uses its official "Download on the
// App Store" lockup (public/badges/apple-app-store-badge.svg, unaltered per
// Apple's marketing guidelines). Google Play uses a matching official-style
// badge sized to the same height so the pair reads as a set.
// Apple shows whenever a URL is configured; Google Play appears only once
// GOOGLE_PLAY_URL is set in lib/app-store.ts. Renders nothing if no store is
// configured, so call sites never show a dead row.
export function AppStoreBadges({
  className = '',
  align = 'center',
}: {
  className?: string;
  align?: 'center' | 'start';
}) {
  if (!hasAnyApp) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'} ${className}`}
    >
      {hasIosApp && (
        <a
          href={IOS_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download on the App Store"
          className="inline-flex transition-transform hover:scale-[1.03]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/badges/apple-app-store-badge.svg"
            alt="Download on the App Store"
            height={BADGE_HEIGHT}
            style={{ height: BADGE_HEIGHT, width: 'auto', display: 'block' }}
          />
        </a>
      )}
      {hasAndroidApp && (
        <a
          href={GOOGLE_PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get it on Google Play"
          className="inline-flex items-center gap-2.5 rounded-[9px] bg-black px-4 text-white ring-1 ring-inset ring-white/10 transition-transform hover:scale-[1.03]"
          style={{ height: BADGE_HEIGHT }}
        >
          <GooglePlayGlyph size={22} />
          <span className="flex flex-col leading-none text-left">
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/85">Get it on</span>
            <span className="text-[19px] font-medium -mt-0.5" style={{ fontFamily: "var(--font-display, 'DM Sans', sans-serif)" }}>
              Google Play
            </span>
          </span>
        </a>
      )}
    </div>
  );
}
