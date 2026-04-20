'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Instagram, Twitter, Facebook, Linkedin } from 'lucide-react';

// Auto-detect which market subdomain we're on at render time. Used when the
// parent doesn't pass an explicit brandCity — common for existing call sites
// that predate multi-market support. ATL is the fallback so no call site that
// worked before breaks.
const SUBDOMAIN_TO_CITY: Record<string, string> = {
  atl: 'Atlanta',
  nola: 'New Orleans',
};

function detectBrandCity(): string {
  if (typeof window === 'undefined') return 'Atlanta';
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.hmucashride.com')) return 'Atlanta';
  const sub = host.slice(0, -'.hmucashride.com'.length);
  return SUBDOMAIN_TO_CITY[sub] || 'Atlanta';
}

const footerLinks = {
  product: {
    title: 'Product',
    links: [
      { label: 'For Drivers', href: '/driver' },
      { label: 'For Riders', href: '/rider' },
      { label: 'Safety', href: '/safety' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  company: {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Team', href: '/team' },
      { label: 'Careers', href: '/careers' },
      { label: 'Press', href: '/press' },
      { label: 'Blog', href: '/blog' },
      { label: 'Investors', href: '/data-room' },
    ],
  },
  resources: {
    title: 'Resources',
    links: [
      { label: 'Help Center', href: '/help' },
      { label: 'Community Guidelines', href: '/guidelines' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  legal: {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
    ],
  },
};

const socials = [
  { label: 'Instagram', href: 'https://instagram.com/hmucashride', icon: Instagram },
  { label: 'Twitter', href: 'https://twitter.com/hmucashride', icon: Twitter },
  { label: 'Facebook', href: 'https://facebook.com/hmucashride', icon: Facebook },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/hmucashride', icon: Linkedin },
];

const isRootDomain = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'hmucashride.com';
};

export function Footer({ brandCity: explicitBrandCity }: { brandCity?: string } = {}) {
  const root = isRootDomain();

  // If parent passed brandCity, use it; otherwise detect from hostname on
  // client mount. SSR defaults to 'Atlanta' to avoid hydration mismatch —
  // client updates once mounted if we're on a non-ATL subdomain.
  const [detected, setDetected] = useState<string>('Atlanta');
  useEffect(() => {
    if (!explicitBrandCity) setDetected(detectBrandCity());
  }, [explicitBrandCity]);
  const brandCity = explicitBrandCity ?? detected;

  const tagline = root
    ? 'Pre-Trip Payment Verification supporting the 100k+ people in the growing community-led peer-to-peer rideshare network.'
    : `Metro ${brandCity}\u2019s peer-to-peer ride network. Affordable rides, real earnings, community-first.`;

  const brandName = root ? 'HMU Cash Ride' : 'HMU Cash Ride';

  return (
    <footer className="bg-[#0a0a0a] text-white border-t border-[#1a1a1a]" style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2">
            <h3
              className="text-3xl mb-2 text-[#00E676]"
              style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
            >
              {brandName}
            </h3>
            <p
              className="text-[10px] text-[#555] mb-4 tracking-[0.2em] uppercase"
              style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
            >
              HMU Cash Ride Corp.
            </p>
            <p className="text-[#888] text-sm leading-relaxed mb-4 max-w-xs">
              {tagline}
            </p>
            {root && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#00E676] mb-6" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                <span>Real People</span>
                <span>&middot;</span>
                <span>Affordable Rides</span>
                <span>&middot;</span>
                <span>Livable Earnings</span>
                <span>&middot;</span>
                <span>Community-Led</span>
                <span>&middot;</span>
                <span>Safety-First</span>
              </div>
            )}
            <div className="flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 bg-[#141414] rounded-lg flex items-center justify-center hover:bg-[#00E676] hover:text-black transition-colors text-[#666]"
                >
                  <s.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.values(footerLinks).map((section) => (
            <div key={section.title}>
              <h4
                className="text-[11px] uppercase tracking-[0.15em] text-[#666] mb-4"
                style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
              >
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#888] hover:text-[#00E676] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[#444] text-xs">
            &copy; {new Date().getFullYear()} HMU Cash Ride Corp. All rights reserved.
          </p>
          <p className="text-[#333] text-xs">
            HMU Cash Ride is a technology platform, not a transportation provider.
          </p>
        </div>
      </div>
    </footer>
  );
}
