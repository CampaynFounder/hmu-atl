import {
  IOS_APP_STORE_URL,
  GOOGLE_PLAY_URL,
  hasIosApp,
  hasAndroidApp,
  hasAnyApp,
} from '@/lib/app-store';

// Official Apple logo glyph.
function AppleGlyph({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.53c-.02-2.02 1.65-2.99 1.73-3.04-.94-1.38-2.41-1.57-2.93-1.59-1.25-.13-2.44.73-3.07.73-.63 0-1.61-.71-2.65-.69-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1 1.02 8.1.67.98 1.47 2.08 2.52 2.04 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.63.63 1.09-.02 1.78-1 2.44-1.98.77-1.13 1.09-2.23 1.11-2.29-.02-.01-2.13-.82-2.15-3.25l.05-.02zM15.03 6.3c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.83-.46 2.39-1.13z" />
    </svg>
  );
}

// Google "Play" triangle mark.
function GooglePlayGlyph({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.6 2.4c-.25.26-.4.66-.4 1.18v16.84c0 .52.15.92.4 1.18l.06.05L13.1 12v-.2L3.66 2.35l-.06.05z" fill="#00E676" />
      <path d="M16.3 15.2 13.1 12v-.2l3.2-3.2.07.04 3.78 2.15c1.08.61 1.08 1.62 0 2.24l-3.78 2.15-.07.02z" fill="#FFCE00" />
      <path d="M16.37 15.16 13.1 11.9l-9.5 9.5c.36.38.94.42 1.6.05l11.17-6.29z" fill="#FF3D00" />
      <path d="M16.37 8.64 5.2 2.35c-.66-.38-1.24-.33-1.6.05l9.5 9.5 3.27-3.26z" fill="#00B0FF" />
    </svg>
  );
}

function StoreBadge({
  href,
  glyph,
  topLabel,
  storeName,
}: {
  href: string;
  glyph: React.ReactNode;
  topLabel: string;
  storeName: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${topLabel} ${storeName}`}
      className="inline-flex items-center gap-3 rounded-xl border border-white/25 bg-black px-5 py-2.5 text-white transition-colors hover:border-[#00E676] hover:bg-[#0d0d0d]"
    >
      <span className="shrink-0 text-white">{glyph}</span>
      <span className="flex flex-col leading-none text-left">
        <span className="text-[10px] tracking-wide text-white/70">{topLabel}</span>
        <span className="text-lg font-semibold -mt-0.5" style={{ fontFamily: "var(--font-display, 'DM Sans', sans-serif)" }}>
          {storeName}
        </span>
      </span>
    </a>
  );
}

// Renders the store download badges. Apple shows whenever a URL is configured;
// Google Play appears only once GOOGLE_PLAY_URL is set in lib/app-store.ts.
// Renders nothing if no store is configured, so call sites never show a dead row.
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
      className={`flex flex-wrap gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'} ${className}`}
    >
      {hasIosApp && (
        <StoreBadge
          href={IOS_APP_STORE_URL}
          glyph={<AppleGlyph />}
          topLabel="Download on the"
          storeName="App Store"
        />
      )}
      {hasAndroidApp && (
        <StoreBadge
          href={GOOGLE_PLAY_URL}
          glyph={<GooglePlayGlyph />}
          topLabel="GET IT ON"
          storeName="Google Play"
        />
      )}
    </div>
  );
}
