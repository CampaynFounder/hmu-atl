'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useClerk, useUser } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeatureSearch } from '@/components/search/feature-search';

const MARKETING_PATHS = ['/', '/driver', '/rider', '/pitch', '/events', '/compare'];

function getLogoHref(pathname: string, profileType?: string) {
  // On sign-in/sign-up pages, check for type param in URL
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type');
      if (type === 'driver') return '/driver';
      if (type === 'rider') return '/rider';
    }
    return '/';
  }
  // On driver pages, go to driver landing
  if (pathname.startsWith('/driver')) return '/driver';
  // On rider pages, go to rider landing
  if (pathname.startsWith('/rider')) return '/rider';
  // On driver share pages
  if (pathname.startsWith('/d/')) return '/rider';
  return '/';
}

export function Header({ brandLabel = 'HMU ATL' }: { brandLabel?: string }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  if (MARKETING_PATHS.includes(pathname)) return null;
  // Admin portal has its own sidebar nav + permission-aware search bar
  // (app/admin/components/admin-search-bar.tsx). The global header here would
  // duplicate the search and surface driver/rider features — wrong context
  // for admin work. Match only the portal proper, NOT /admin-login or
  // /admin-signup which are pre-auth pages and want the global chrome.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;

  const rawProfileType = user?.publicMetadata?.profileType as string | undefined;
  const tier = user?.publicMetadata?.tier as string | undefined;
  const isHmuFirst = tier === 'hmu_first';

  // Path-based fallback for the missing profileType case. On the blast funnel
  // (and other newly-signed-up rider flows on staging), Clerk publicMetadata
  // can lag behind the Neon row — the metadata is written server-side by
  // /api/blast/onboard, but the client's `user` object isn't refreshed until
  // the next Clerk sync. Without this fallback, isSignedIn=true but
  // profileType=undefined → no menu items render → user sees only Sign Out.
  // We trust the URL: anything under /rider is a rider, /driver is a driver.
  const profileType: string | undefined = rawProfileType
    || (pathname.startsWith('/rider') ? 'rider'
      : pathname.startsWith('/driver') ? 'driver'
      : undefined);

  // Self-heal: when we had to fall back to the path, ask Clerk to reload the
  // user so the next render gets the real metadata. user.reload() is a no-op
  // if the metadata hasn't changed server-side, so this is safe to call.
  useEffect(() => {
    if (isSignedIn && !rawProfileType && user) {
      void user.reload();
    }
  }, [isSignedIn, rawProfileType, user]);

  const logoHref = getLogoHref(pathname, profileType);
  const close = () => setIsMenuOpen(false);

  const handleSignOut = async () => {
    close();
    // Sign-out from any blast page (the /rider/blast/* funnel or the
    // /rider/browse/blast landing) lands on /rider/browse/blast — keeps the
    // signed-out user inside the blast acquisition surface instead of
    // bouncing them to the generic /rider/home.
    const onBlastPage = pathname.startsWith('/rider/blast') || pathname === '/rider/browse/blast';
    const redirectUrl = onBlastPage
      ? '/rider/browse/blast'
      : profileType === 'rider' ? '/rider/home'
      : profileType === 'driver' ? '/driver'
      : '/';
    // Clerk v6 SignOutOptions only has `sessionId` — passing `redirectUrl` is
    // a no-op, so the previous one-arg form cleared the session but never
    // navigated. Hard-navigate after the promise resolves to force a fresh
    // server render with the cleared auth state.
    await signOut();
    window.location.href = redirectUrl;
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <Link
                href={logoHref}
                className="font-bold text-white"
                style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '22px', letterSpacing: '1px' }}
              >
                {brandLabel}
              </Link>
              {isSignedIn && isHmuFirst && (
                <span style={{
                  background: '#00E676', color: '#080808',
                  fontSize: '9px', fontWeight: 800,
                  padding: '3px 8px', borderRadius: '100px',
                  letterSpacing: '0.5px', whiteSpace: 'nowrap',
                  lineHeight: 1,
                }}>
                  {'\uD83E\uDD47'} 1ST
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isSignedIn && <FeatureSearch profileType={profileType} />}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={close}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed top-14 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-white/8"
            >
              <nav className="px-5 py-5">
                <ul className="space-y-1">
                  {/* ── Logged-in Driver ── */}
                  {isSignedIn && profileType === 'driver' && (
                    <>
                      <NavSection label="GO" />
                      <NavItem href="/driver/go-live" label="Go Live" icon="🟢" active={pathname.startsWith('/driver/go-live')} accent onClick={close} />
                      <NavItem href="/driver/find-riders" label="Find Riders" icon="🔍" active={pathname.startsWith('/driver/find-riders')} onClick={close} />
                      <NavItem href="/driver/feed" label="Ride Requests" icon="📋" active={pathname.startsWith('/driver/feed')} onClick={close} />
                      <NavSection label="RIDES" />
                      <NavItem href="/driver/dashboard" label="Dashboard" icon="📊" active={pathname.startsWith('/driver/dashboard')} onClick={close} />
                      <NavItem href="/driver/rides" label="My Rides" icon="📋" active={pathname.startsWith('/driver/rides') || pathname.startsWith('/ride/')} onClick={close} />
                      <NavItem href="/driver/home" label="Cashout" icon="💰" active={pathname === '/driver/home'} onClick={close} />
                      <NavSection label="ME" />
                      <NavItem href="/driver/schedule" label="Schedule" icon="📅" active={pathname.startsWith('/driver/schedule')} onClick={close} />
                      <NavItem href="/driver/profile" label="Profile" icon="👤" active={pathname.startsWith('/driver/profile')} onClick={close} />
                      <NavItem href="/driver/settings" label="Settings" icon="⚙️" active={pathname.startsWith('/driver/settings')} onClick={close} />
                      <NavItem href="/driver/support" label="Support" icon="💬" active={pathname.startsWith('/driver/support')} onClick={close} />
                    </>
                  )}

                  {/* ── Logged-in Rider ── */}
                  {isSignedIn && profileType === 'rider' && (
                    <>
                      <NavItem href="/rider/home" label="Find a Ride" active={pathname === '/rider/home'} accent onClick={close} />
                      <NavItem href="/rider/browse" label="Browse Drivers" active={pathname.startsWith('/rider/browse') || pathname.startsWith('/d/')} onClick={close} />
                      <NavItem href="/rider/rides" label="Your Rides" active={pathname.startsWith('/rider/rides')} onClick={close} />
                      <NavItem href="/rider/profile" label="HMU Profile" active={pathname.startsWith('/rider/profile')} onClick={close} />
                      <NavItem href="/rider/settings" label="HMU Settings" active={pathname.startsWith('/rider/settings')} onClick={close} />
                      <NavItem href="/rider/support" label="Support" icon="💬" active={pathname.startsWith('/rider/support')} onClick={close} />
                    </>
                  )}

                  {/* ── Logged-in Admin ── */}
                  {isSignedIn && profileType === 'admin' && (
                    <>
                      <NavItem href="/admin" label="Admin Dashboard" active={pathname.startsWith('/admin')} accent onClick={close} />
                      <NavItem href="/driver/home" label="Driver Home" active={pathname === '/driver/home'} onClick={close} />
                      <NavItem href="/rider/home" label="Rider Home" active={pathname === '/rider/home'} onClick={close} />
                    </>
                  )}

                  {/* ── Logged out ── */}
                  {!isSignedIn && (
                    <>
                      <NavItem href="/" label="Home" active={pathname === '/'} onClick={close} />
                      <NavItem href="/rider/home" label="Find a Ride" onClick={close} />
                      <NavItem href="/driver" label="Drive with HMU" onClick={close} />
                      <NavSeparator />
                      <NavItem href="/rider" label="Rider Demo" sub onClick={close} />
                      <NavItem href="/driver-demo" label="Driver Demo" sub onClick={close} />
                    </>
                  )}

                  {/* ── Bottom section ── */}
                  <NavSeparator />
                  {isSignedIn ? (
                    <>
                      <li>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left block px-4 py-3 rounded-xl text-[15px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                        >
                          Sign Out
                        </button>
                      </li>
                    </>
                  ) : (
                    <li>
                      <Link
                        href="/sign-in"
                        onClick={close}
                        className="block px-4 py-3 rounded-xl text-center text-[15px] font-semibold text-[#080808] bg-[#00E676] hover:bg-[#00C864] transition-colors"
                        style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                      >
                        Sign In
                      </Link>
                    </li>
                  )}
                </ul>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavSeparator() {
  return <li className="pt-2 mt-2 border-t border-white/8" />;
}

function NavSection({ label }: { label: string }) {
  return (
    <li className="pt-6 first:pt-2">
      <div className="flex items-center gap-3 px-4 pb-2">
        <span
          className="text-[18px] font-bold tracking-[3px] text-[#00E676]"
          style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)' }}
        >
          {label}
        </span>
        <div className="flex-1 h-px bg-white/10" />
      </div>
    </li>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  accent,
  sub,
  onClick,
}: {
  href: string;
  label: string;
  icon?: string;
  active?: boolean;
  accent?: boolean;
  sub?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
          active
            ? 'bg-[#00E676]/10 text-[#00E676] border border-[#00E676]/20'
            : accent
              ? 'text-[#00E676] hover:bg-[#00E676]/5'
              : sub
                ? 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 text-[13px]'
                : 'text-zinc-300 hover:bg-white/5 hover:text-white'
        }`}
        style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
      >
        {icon && <span className="text-base">{icon}</span>}
        {label}
      </Link>
    </li>
  );
}
