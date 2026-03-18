'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MARKETING_PATHS = ['/driver', '/rider'];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isSignedIn, user } = useUser();

  if (MARKETING_PATHS.includes(pathname)) return null;

  const profileType = user?.publicMetadata?.profileType as string | undefined;

  return (
    <>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link
              href="/"
              className="font-bold text-white"
              style={{ fontFamily: 'var(--font-display, Bebas Neue, sans-serif)', fontSize: '22px', letterSpacing: '1px' }}
            >
              HMU ATL
            </Link>

            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setIsMenuOpen(false)}
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
                  <NavItem href="/" label="Home" onClick={() => setIsMenuOpen(false)} />

                  {isSignedIn ? (
                    <>
                      {profileType === 'driver' && (
                        <NavItem
                          href="/driver/home"
                          label="Driver Home"
                          active={pathname.startsWith('/driver/home')}
                          accent
                          onClick={() => setIsMenuOpen(false)}
                        />
                      )}
                      <NavItem
                        href="/rider/home"
                        label="Find a Ride"
                        active={pathname.startsWith('/rider/home')}
                        accent={profileType === 'rider'}
                        onClick={() => setIsMenuOpen(false)}
                      />
                    </>
                  ) : (
                    <>
                      <NavItem href="/rider/home" label="Find a Ride" onClick={() => setIsMenuOpen(false)} />
                      <NavItem href="/sign-up?type=driver" label="Drive with HMU" onClick={() => setIsMenuOpen(false)} />
                    </>
                  )}

                  <li className="pt-3 mt-3 border-t border-white/8">
                    {isSignedIn ? (
                      <Link
                        href="/sign-in"
                        onClick={() => setIsMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                        style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                      >
                        Account
                      </Link>
                    ) : (
                      <Link
                        href="/sign-in"
                        onClick={() => setIsMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-center text-sm font-semibold text-[#080808] bg-[#00E676] hover:bg-[#00C864] transition-colors"
                        style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                      >
                        Sign In
                      </Link>
                    )}
                  </li>
                </ul>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({
  href,
  label,
  active,
  accent,
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  accent?: boolean;
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
              : 'text-zinc-300 hover:bg-white/5 hover:text-white'
        }`}
        style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
      >
        {label}
      </Link>
    </li>
  );
}
