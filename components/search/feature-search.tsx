'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Feature {
  label: string;
  description: string;
  breadcrumb: string;
  href: string;
  keywords: string[];
  icon: string;
}

const DRIVER_FEATURES: Feature[] = [
  // GO
  { label: 'Go Live', description: 'Start broadcasting your availability to riders', breadcrumb: 'Go > Go Live', href: '/driver/go-live', keywords: ['live', 'broadcast', 'available', 'start', 'hmu', 'online'], icon: '🟢' },
  { label: 'Find Riders', description: 'Browse ride requests from riders in your area', breadcrumb: 'Go > Find Riders', href: '/driver/feed', keywords: ['feed', 'riders', 'requests', 'browse', 'find', 'search', 'area'], icon: '🔍' },

  // RIDES
  { label: 'My Rides', description: 'View your ride history and active requests', breadcrumb: 'Rides > My Rides', href: '/driver/rides', keywords: ['rides', 'history', 'requests', 'active', 'past', 'completed', 'cancelled'], icon: '📋' },
  { label: 'Cashout', description: 'Cash out your earnings to your bank or card', breadcrumb: 'Rides > Cashout', href: '/driver/home', keywords: ['cashout', 'cash', 'payout', 'withdraw', 'money', 'earnings', 'balance', 'bank', 'instant', 'transfer'], icon: '💰' },

  // ME
  { label: 'Profile', description: 'Edit your driver profile, photo, and bio', breadcrumb: 'Me > Profile', href: '/driver/profile', keywords: ['profile', 'edit', 'photo', 'bio', 'name', 'handle', 'video', 'intro', 'about'], icon: '👤' },
  { label: 'Settings', description: 'Account settings, notifications, and preferences', breadcrumb: 'Me > Settings', href: '/driver/settings', keywords: ['settings', 'account', 'notifications', 'preferences', 'password', 'email', 'phone', 'delete'], icon: '⚙️' },

  // MONEY
  { label: 'Payout Setup', description: 'Link your bank account or debit card for payouts', breadcrumb: 'Me > Payout Setup', href: '/driver/payout-setup', keywords: ['payout', 'setup', 'bank', 'debit', 'card', 'stripe', 'connect', 'link', 'account'], icon: '🏦' },
  { label: 'Earnings', description: 'View your daily and weekly earnings breakdown', breadcrumb: 'Rides > Earnings', href: '/driver/home', keywords: ['earnings', 'daily', 'weekly', 'breakdown', 'revenue', 'income', 'made', 'earned', 'today'], icon: '📊' },
  { label: 'Upgrade to HMU First', description: 'Get free instant payouts, lower fees, and priority placement', breadcrumb: 'Me > Upgrade', href: '/driver/home', keywords: ['upgrade', 'hmu first', 'subscription', 'premium', 'instant', 'free payouts', 'lower fees', 'priority'], icon: '🥇' },

  // RIDE FEATURES
  { label: 'Service Menu', description: 'Set up your add-on services and pricing', breadcrumb: 'Me > Profile > Service Menu', href: '/driver/profile', keywords: ['menu', 'service', 'add-on', 'addon', 'extras', 'pricing', 'barber', 'tattoo'], icon: '🍽️' },
  { label: 'Booking Settings', description: 'Set your booking preferences and requirements', breadcrumb: 'Me > Profile > Bookings', href: '/driver/profile', keywords: ['booking', 'direct', 'requirements', 'chill score', 'og', 'accept', 'auto'], icon: '📅' },
  { label: 'Vehicle Info', description: 'Update your vehicle details and photos', breadcrumb: 'Me > Profile > Vehicle', href: '/driver/profile', keywords: ['vehicle', 'car', 'plate', 'license', 'photo', 'make', 'model', 'year'], icon: '🚗' },
  { label: 'Areas & Schedule', description: 'Set your service areas and availability schedule', breadcrumb: 'Me > Profile > Areas', href: '/driver/profile', keywords: ['areas', 'schedule', 'availability', 'zone', 'neighborhood', 'time', 'days', 'hours'], icon: '📍' },

  // HELP
  { label: 'Share Your Link', description: 'Share your driver profile to get more bookings', breadcrumb: 'Go > Share Link', href: '/driver/home', keywords: ['share', 'link', 'url', 'invite', 'referral', 'social', 'promote'], icon: '🔗' },
  { label: 'Safety', description: 'Learn about HMU safety features and guidelines', breadcrumb: 'Help > Safety', href: '/safety', keywords: ['safety', 'help', 'emergency', 'report', 'guidelines', 'trust'], icon: '🛡️' },
  { label: 'Pricing & Fees', description: 'Understand how HMU fees and tiers work', breadcrumb: 'Help > Pricing', href: '/pricing', keywords: ['pricing', 'fees', 'tiers', 'commission', 'percentage', 'cap', 'daily', 'weekly', 'how much'], icon: '💲' },
  { label: 'Terms of Service', description: 'Read the HMU platform agreement', breadcrumb: 'Help > Terms', href: '/terms', keywords: ['terms', 'service', 'agreement', 'legal', 'policy'], icon: '📄' },
  { label: 'Privacy Policy', description: 'How HMU handles your data', breadcrumb: 'Help > Privacy', href: '/privacy', keywords: ['privacy', 'data', 'policy', 'information'], icon: '🔒' },
];

function fuzzyMatch(query: string, feature: Feature): number {
  const q = query.toLowerCase();
  const searchable = [
    feature.label,
    feature.description,
    ...feature.keywords,
  ].join(' ').toLowerCase();

  // Exact match in label
  if (feature.label.toLowerCase().includes(q)) return 100;
  // Exact match in keywords
  if (feature.keywords.some(k => k.includes(q))) return 80;
  // Exact match in description
  if (feature.description.toLowerCase().includes(q)) return 60;
  // Partial word matches
  const words = q.split(/\s+/);
  const matchCount = words.filter(w => searchable.includes(w)).length;
  if (matchCount === words.length) return 50;
  if (matchCount > 0) return 30 * (matchCount / words.length);
  return 0;
}

export function FeatureSearch({ profileType }: { profileType?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Pick features based on profile type
  const features = profileType === 'rider' ? [] : DRIVER_FEATURES; // TODO: add rider features

  const results = query.trim()
    ? features
        .map(f => ({ feature: f, score: fuzzyMatch(query, f) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(r => r.feature)
    : features.slice(0, 6); // Show popular features when no query

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
        aria-label="Search features"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* Search overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed top-0 left-0 right-0 z-[61] px-4 pt-3 pb-4">
            <div
              className="max-w-lg mx-auto bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 40px)' }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search features..."
                  className="flex-1 bg-transparent text-white text-[15px] placeholder:text-zinc-600 outline-none"
                  style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-white text-sm">
                    Clear
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
                {!query && (
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-[10px] font-bold tracking-[2px] text-zinc-600" style={{ fontFamily: 'var(--font-mono, Space Mono, monospace)' }}>
                      QUICK ACCESS
                    </span>
                  </div>
                )}
                {results.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-zinc-500 text-sm">No results for "{query}"</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {results.map((feature) => (
                      <button
                        key={feature.href + feature.label}
                        onClick={() => handleSelect(feature.href)}
                        className="w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/8 transition-colors"
                      >
                        <span className="text-lg mt-0.5 shrink-0">{feature.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-medium text-white" style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}>
                              {feature.label}
                            </span>
                          </div>
                          <p className="text-[12px] text-zinc-500 mt-0.5 line-clamp-1">{feature.description}</p>
                          <p className="text-[10px] text-[#00E676]/40 mt-1 font-medium" style={{ fontFamily: 'var(--font-mono, Space Mono, monospace)' }}>
                            {feature.breadcrumb}
                          </p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
