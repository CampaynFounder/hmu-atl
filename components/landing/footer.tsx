// Footer Component
import Link from 'next/link';
import { Instagram, Twitter, Facebook, Linkedin } from 'lucide-react';

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

export function Footer() {
  return (
    <footer className="bg-gray-950 text-white border-t border-gray-800/50">
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2">
            <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              HMU Cash Ride
            </h3>
            <p className="text-xs text-gray-500 mb-4 tracking-wide uppercase">
              HMU Cash Ride Corp.
            </p>
            <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-xs">
              Metro Atlanta&apos;s peer-to-peer ride network. Affordable rides, real earnings, community-first.
            </p>
            <div className="flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 bg-gray-800/80 rounded-lg flex items-center justify-center hover:bg-orange-500 transition-colors"
                >
                  <s.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.values(footerLinks).map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-4">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-orange-400 transition-colors"
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
      <div className="border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-xs">
            © {new Date().getFullYear()} HMU Cash Ride Corp. All rights reserved. Metro Atlanta, GA.
          </p>
          <p className="text-gray-600 text-xs">
            HMU Cash Ride is a technology platform, not a transportation provider.
          </p>
        </div>
      </div>
    </footer>
  );
}
