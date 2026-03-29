import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How It Works — Rider Guide | HMU ATL',
  description: 'Step-by-step guide for HMU ATL riders. Learn how to find drivers, book rides, and save money.',
};

const steps = [
  {
    num: '01',
    title: 'Find a Driver',
    sub: 'Browse local ATL drivers',
    body: 'Open the app and browse drivers in your area. Each driver has a profile with their video intro, areas they serve, pricing, ratings, and chill score. Pick someone you trust.',
    tip: 'Drivers with videos and high chill scores are verified and trusted by other riders.',
    icon: '🔍',
    color: '#00E676',
  },
  {
    num: '02',
    title: 'Book Your Ride',
    sub: 'Tap their link or request from the feed',
    body: 'Tap a driver\'s profile to book directly, or post a ride request to the feed and let drivers come to you. You set the price or accept theirs — no surge, no algorithms.',
    tip: 'Drivers shared their link on social media? Tap it to book them directly.',
    icon: '📱',
    color: '#448AFF',
  },
  {
    num: '03',
    title: 'Confirm Payment — Tap Pull Up',
    sub: 'Your payment is held safely',
    body: 'When you\'re ready, tap Pull Up. Your payment is held in escrow — the driver sees the hold and knows you\'re real. They won\'t drive until your money is locked in.',
    tip: 'You\'re NOT charged yet — the money is held and only captured when the ride starts. If the driver cancels, you get a full refund.',
    icon: '🔒',
    color: '#FFB300',
  },
  {
    num: '04',
    title: 'Share Your Location',
    sub: 'Driver heads your way',
    body: 'Share your pickup location or type in an address. The driver taps OTW (On The Way) and you can track them on the map in real-time.',
    tip: 'Be ready when they arrive — drivers have a wait window. After that they can pull off.',
    icon: '📍',
    color: '#00E676',
  },
  {
    num: '05',
    title: 'Driver Arrives — Tap BET',
    sub: 'Payment captured, ride starts',
    body: 'The driver taps HERE when they arrive. Head to the car and tap BET (I\'m coming). This confirms the ride and your payment is captured. You\'re on your way.',
    tip: 'If you can\'t make it out in time, communicate through the in-app chat.',
    icon: '🚗',
    color: '#448AFF',
  },
  {
    num: '06',
    title: 'Add Extras During the Ride',
    sub: 'Extra stops, snacks, and more',
    body: 'Need to make a stop? Your driver may offer add-on services like extra stops, wait time, or other extras. You can add them during the ride — each one is priced upfront.',
    tip: 'Add-ons are confirmed by you before they\'re charged. No surprises.',
    icon: '🛒',
    color: '#FFB300',
  },
  {
    num: '07',
    title: 'Ride Complete',
    sub: 'Rate your driver',
    body: 'When you arrive, the driver taps End Ride. You have a short window to flag any issues. If everything was cool, the payment is finalized and you rate your driver.',
    tip: 'Rate honestly — CHILL and Cool AF help drivers earn trust. WEIRDO flags protect the community.',
    icon: '⭐',
    color: '#00E676',
  },
  {
    num: '08',
    title: 'That\'s It — No Hidden Fees',
    sub: 'What you agreed to is what you pay',
    body: 'No surge pricing. No mysterious fees after the ride. The price you agreed to is exactly what you pay. Drivers set fair prices because they keep most of it.',
    tip: 'Complete 10 rides with 0 disputes and you earn OG status — unlock driver comments and priority matching.',
    icon: '💯',
    color: '#448AFF',
  },
];

export default function RiderGuidePage() {
  return (
    <div style={{
      background: '#080808', color: '#fff', minHeight: '100svh',
      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
    }}>
      {/* Hero */}
      <div style={{
        padding: '60px 20px 40px', textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(68,138,255,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧑</div>
        <h1 style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: '36px', lineHeight: 1.1, marginBottom: '12px',
        }}>
          HOW RIDERS<br />BOOK ON HMU
        </h1>
        <p style={{ fontSize: '15px', color: '#888', maxWidth: '340px', margin: '0 auto', lineHeight: 1.5 }}>
          Welcome to HMU ATL. We&apos;re Atlanta-based and built this for riders tired of surge pricing and ride scammers. Here&apos;s how it works.
        </p>
      </div>

      {/* Steps */}
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 20px 60px' }}>
        {steps.map((step, i) => (
          <div key={i} style={{ position: 'relative', paddingLeft: '48px', paddingBottom: '32px' }}>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                position: 'absolute', left: '19px', top: '44px', bottom: '0',
                width: '2px', background: 'rgba(255,255,255,0.06)',
              }} />
            )}

            {/* Step number circle */}
            <div style={{
              position: 'absolute', left: '0', top: '0',
              width: '40px', height: '40px', borderRadius: '50%',
              background: `${step.color}15`, border: `2px solid ${step.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px',
            }}>
              {step.icon}
            </div>

            {/* Content */}
            <div style={{
              background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '16px', padding: '20px',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: step.color,
                marginBottom: '4px', fontFamily: 'var(--font-mono, Space Mono, monospace)',
              }}>
                STEP {step.num}
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>
                {step.title}
              </h2>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                {step.sub}
              </p>
              <p style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.6, marginBottom: '12px' }}>
                {step.body}
              </p>
              <div style={{
                background: `${step.color}08`, border: `1px solid ${step.color}20`,
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: step.color, lineHeight: 1.5,
              }}>
                💡 {step.tip}
              </div>
            </div>
          </div>
        ))}

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a
            href="/sign-up?type=rider"
            style={{
              display: 'inline-block', padding: '16px 48px', borderRadius: '100px',
              background: '#448AFF', color: '#fff', fontWeight: 700, fontSize: '16px',
              textDecoration: 'none',
            }}
          >
            Find a Driver
          </a>
          <p style={{ fontSize: '12px', color: '#555', marginTop: '12px' }}>
            Questions? We&apos;re real people in Atlanta. Text us anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
