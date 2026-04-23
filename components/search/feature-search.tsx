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

const RIDER_FEATURES: Feature[] = [
  // RIDE
  { label: 'Find a Driver', description: 'Browse available drivers and book a ride', breadcrumb: 'Ride > Browse', href: '/rider/browse', keywords: ['browse', 'search', 'drivers', 'book', 'ride', 'find', 'available', 'pick up'], icon: '🔍' },
  { label: 'Post a Ride Request', description: 'Tell drivers where you need to go and your price', breadcrumb: 'Ride > Post', href: '/rider/home', keywords: ['post', 'request', 'need a ride', 'hmu', 'destination', 'where', 'going', 'trip'], icon: '📝' },
  { label: 'My Rides', description: 'View your ride history, receipts, and past trips', breadcrumb: 'Me > Ride History', href: '/rider/settings?tab=history', keywords: ['rides', 'history', 'past', 'trips', 'receipt', 'completed', 'cancelled', 'how much', 'spent'], icon: '📋' },

  // ACTIVE RIDE (href updated dynamically when active ride exists)
  { label: 'Track My Driver', description: 'See where your driver is and their ETA', breadcrumb: 'Ride > Track', href: '/rider/home', keywords: ['track', 'where', 'driver', 'map', 'eta', 'location', 'far', 'coming', 'otw', 'here'], icon: '📍' },
  { label: 'Chat with Driver', description: 'Send a message to your driver during a ride', breadcrumb: 'Ride > Chat', href: '/rider/home', keywords: ['chat', 'message', 'text', 'talk', 'driver', 'say', 'tell', 'contact'], icon: '💬' },
  { label: 'Rate a Driver', description: 'Leave a rating after your ride', breadcrumb: 'Ride > Rate', href: '/rider/home', keywords: ['rate', 'review', 'chill', 'cool', 'weirdo', 'creepy', 'stars', 'feedback'], icon: '⭐' },
  { label: 'Dispute a Ride', description: 'Challenge a charge or report an issue with a ride', breadcrumb: 'Ride > Dispute', href: '/rider/home', keywords: ['dispute', 'refund', 'wrong', 'charge', 'overcharged', 'problem', 'issue', 'complaint', 'not right'], icon: '⚖️' },

  // ACCOUNT
  { label: 'Payment Methods', description: 'Add, remove, or change your card or Apple Pay', breadcrumb: 'Me > Payment', href: '/rider/settings?tab=payment', keywords: ['card', 'pay', 'payment', 'apple pay', 'add card', 'remove', 'change', 'visa', 'mastercard', 'debit', 'credit'], icon: '💳' },
  { label: 'Edit Profile', description: 'Update your photo, name, and rider preferences', breadcrumb: 'Me > Profile', href: '/rider/profile', keywords: ['profile', 'photo', 'name', 'edit', 'avatar', 'picture', 'preferences'], icon: '👤' },
  { label: 'Record Vibe Video', description: 'Record a short intro video for drivers to see', breadcrumb: 'Me > Profile > Video', href: '/rider/profile', keywords: ['video', 'vibe', 'record', 'intro', 'clip', 'film'], icon: '🎬' },
  { label: 'Security & Passkeys', description: 'Manage Face ID, Touch ID, and sign-in security', breadcrumb: 'Me > Security', href: '/rider/settings?tab=security', keywords: ['security', 'passkey', 'face id', 'touch id', 'login', 'sign in', 'biometric'], icon: '🔐' },
  { label: 'Change Password', description: 'Set, change, or remove your account password', breadcrumb: 'Me > Security > Password', href: '/rider/settings?tab=security', keywords: ['change password', 'reset password', 'update password', 'set password', 'remove password', 'forgot password', 'new password'], icon: '🔑' },
  { label: 'Change Phone Number', description: 'Update your phone number for sign-in and notifications', breadcrumb: 'Me > Security > Phone', href: '/rider/settings?tab=security', keywords: ['change phone', 'update phone', 'new phone', 'phone number', 'add phone', 'verify phone', 'sms', 'text'], icon: '📱' },

  // HELP
  { label: 'How Booking Works', description: 'Step-by-step guide to booking your first ride', breadcrumb: 'Help > Guide', href: '/guide/rider', keywords: ['how', 'guide', 'help', 'tutorial', 'booking', 'first', 'learn', 'steps', 'new'], icon: '📖' },
  { label: 'Get Support', description: 'Report an issue or chat with the HMU team', breadcrumb: 'Help > Support', href: '/rider/settings?tab=support', keywords: ['help', 'support', 'issue', 'report', 'contact', 'problem', 'question', 'chat'], icon: '🆘' },
];

const DRIVER_FEATURES: Feature[] = [
  // GO
  { label: 'Go Live', description: 'Start broadcasting your availability to riders', breadcrumb: 'Go > Go Live', href: '/driver/go-live', keywords: ['live', 'broadcast', 'available', 'start', 'hmu', 'online'], icon: '🟢' },
  { label: 'Find Riders', description: 'Browse riders in your market and send a directed HMU', breadcrumb: 'Go > Find Riders', href: '/driver/find-riders', keywords: ['riders', 'find', 'browse', 'hmu', 'directed', 'search', 'discover'], icon: '🔍' },
  { label: 'Ride Requests', description: 'Browse pending ride requests in your area', breadcrumb: 'Go > Ride Requests', href: '/driver/feed', keywords: ['feed', 'requests', 'pending', 'browse', 'ride requests', 'area'], icon: '📋' },

  // RIDES
  { label: 'My Rides', description: 'View your ride history and active requests', breadcrumb: 'Rides > My Rides', href: '/driver/rides', keywords: ['rides', 'history', 'requests', 'active', 'past', 'completed', 'cancelled'], icon: '📋' },
  { label: 'Cashout', description: 'Cash out your earnings to your bank or card', breadcrumb: 'Rides > Cashout', href: '/driver/home', keywords: ['cashout', 'cash', 'payout', 'withdraw', 'money', 'earnings', 'balance', 'bank', 'instant', 'transfer'], icon: '💰' },

  // ME
  { label: 'Profile', description: 'Edit your driver profile, photo, and bio', breadcrumb: 'Me > Profile', href: '/driver/profile', keywords: ['profile', 'edit', 'photo', 'bio', 'name', 'handle', 'video', 'intro', 'about'], icon: '👤' },
  { label: 'Settings', description: 'Account settings, notifications, and preferences', breadcrumb: 'Me > Settings', href: '/driver/settings', keywords: ['settings', 'account', 'notifications', 'preferences', 'email', 'delete'], icon: '⚙️' },
  { label: 'Change Password', description: 'Set, change, or remove your account password', breadcrumb: 'Me > Security > Password', href: '/driver/settings?tab=security', keywords: ['change password', 'reset password', 'update password', 'set password', 'remove password', 'forgot password', 'new password'], icon: '🔑' },
  { label: 'Change Phone Number', description: 'Update your phone number for sign-in and notifications', breadcrumb: 'Me > Security > Phone', href: '/driver/settings?tab=security', keywords: ['change phone', 'update phone', 'new phone', 'phone number', 'add phone', 'verify phone', 'sms', 'text'], icon: '📱' },

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
  if (feature.label.toLowerCase().includes(q)) return 100;
  if (feature.keywords.some(k => k.includes(q))) return 80;
  if (feature.description.toLowerCase().includes(q)) return 60;
  const words = q.split(/\s+/);
  const searchable = [feature.label, feature.description, ...feature.keywords].join(' ').toLowerCase();
  const matchCount = words.filter(w => searchable.includes(w)).length;
  if (matchCount === words.length) return 50;
  if (matchCount > 0) return 30 * (matchCount / words.length);
  return 0;
}

// Track search events — fire and forget
function trackSearch(event: string, data: Record<string, unknown>) {
  fetch('/api/search/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...data }),
  }).catch(() => {});
}

// Active ride feature labels that should deep-link to the ride page
const ACTIVE_RIDE_LABELS = new Set(['Track My Driver', 'Chat with Driver', 'Rate a Driver', 'Dispute a Ride']);

export function FeatureSearch({ profileType }: { profileType?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isRider = profileType === 'rider';
  const baseFeatures = isRider ? RIDER_FEATURES : DRIVER_FEATURES;

  // For riders, update active-ride feature hrefs if they have an active ride
  const features = isRider && activeRideId
    ? baseFeatures.map(f =>
        ACTIVE_RIDE_LABELS.has(f.label)
          ? { ...f, href: `/ride/${activeRideId}` }
          : f
      )
    : baseFeatures;

  const results = query.trim()
    ? features
        .map(f => ({ feature: f, score: fuzzyMatch(query, f) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(r => r.feature)
    : features.slice(0, 6);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      trackSearch('opened', {});
      // Fetch active ride for riders so ride features deep-link correctly
      if (isRider) {
        fetch('/api/rides/active')
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.rideId) setActiveRideId(d.rideId); })
          .catch(() => {});
      }
    } else {
      // Track what they searched when closing
      if (query.trim()) {
        trackSearch('closed', { query, resultCount: results.length });
      }
      setQuery('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Track searches with debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!query.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      trackSearch('query', {
        query,
        resultCount: results.length,
        topResult: results[0]?.label ?? null,
        noResults: results.length === 0,
      });
    }, 800);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = (feature: Feature) => {
    trackSearch('selected', {
      query,
      selectedLabel: feature.label,
      selectedHref: feature.href,
      selectedBreadcrumb: feature.breadcrumb,
    });
    setOpen(false);
    router.push(feature.href);
  };

  const handleClose = () => {
    setOpen(false);
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
          {/* Backdrop — clicking closes search */}
          <div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />
          <div className="fixed top-0 left-0 right-0 z-[61] px-4 pt-3 pb-4">
            <div
              className="max-w-lg mx-auto bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 40px)' }}
            >
              {/* Search input with close button */}
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
                <button
                  onClick={handleClose}
                  className="shrink-0 text-zinc-500 hover:text-white text-xs font-medium px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                  style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}
                >
                  Done
                </button>
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
                {query && results.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-zinc-500 text-sm">No results for &ldquo;{query}&rdquo;</p>
                    <p className="text-zinc-600 text-xs mt-2">
                      {isRider ? 'Try: find a driver, my rides, payment, dispute' : 'Try: cashout, earnings, go live, fees'}
                    </p>
                  </div>
                ) : (
                  <div className="p-2">
                    {results.map((feature) => (
                      <button
                        key={feature.href + feature.label}
                        onClick={() => handleSelect(feature)}
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
