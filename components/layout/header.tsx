'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useClerk, useUser } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MARKETING_PATHS = ['/driver', '/rider'];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  if (MARKETING_PATHS.includes(pathname)) return null;

  const profileType = user?.publicMetadata?.profileType as string | undefined;
  const close = () => setIsMenuOpen(false);

  const handleSignOut = () => {
    close();
    signOut({ redirectUrl: '/' });
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link
              href="/"
              className="font-bold text-white"
              style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '22px', letterSpacing: '1px' }}
            >
              HMU ATL
            </Link>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
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
                      <NavItem href="/driver/home" label="Driver Home" active={pathname === '/driver/home'} accent onClick={close} />
                      <NavItem href="/driver/feed" label="Find Riders" active={pathname === '/driver/feed'} onClick={close} />
                      <NavItem href="/driver/profile" label="HMU Profile" active={pathname === '/driver/profile'} onClick={close} />
                      <NavItem href="/driver/settings" label="HMU Settings" active={pathname.startsWith('/driver/settings')} onClick={close} />
                    </>
                  )}

                  {/* ── Logged-in Rider ── */}
                  {isSignedIn && profileType === 'rider' && (
                    <>
                      <NavItem href="/rider/home" label="Find a Ride" active={pathname === '/rider/home'} accent onClick={close} />
                      <NavItem href="/rider/browse" label="Browse Drivers" active={pathname === '/rider/browse'} onClick={close} />
                      <NavItem href="/rider/profile" label="HMU Profile" active={pathname === '/rider/profile'} onClick={close} />
                      <NavItem href="/rider/settings" label="HMU Settings" active={pathname.startsWith('/rider/settings')} onClick={close} />
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

function NavItem({
  href,
  label,
  active,
  accent,
  sub,
  onClick,
}: {
  href: string;
  label: string;
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
        className={`block px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
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
        {label}
      </Link>
    </li>
  );
}
