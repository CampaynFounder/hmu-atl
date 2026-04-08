import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How It Works — Driver Guide | HMU ATL',
  description: 'Step-by-step guide for HMU ATL drivers. Learn how to promote, pick up riders, get paid, and cash out.',
};

const steps = [
  {
    num: '01',
    title: 'Promote Your Link',
    sub: 'Share your personal HMU page',
    body: 'Every driver gets a unique link — atl.hmucashride.com/d/YourHandle. Drop it in your bio, Facebook groups, group chats, anywhere. Riders tap your link to book directly.',
    tip: 'Use TikTok or VideoLeap to make a 15-second intro video. Drivers with videos get 3x more bookings.',
    icon: '🔗',
    color: '#00E676',
  },
  {
    num: '02',
    title: 'Upload Your Video',
    sub: 'Show riders who you are',
    body: 'Record a short intro — who you are, what areas you cover, your vibe. This builds trust before riders even book. No script needed, just be you.',
    tip: 'Keep it 5-10 seconds. Show your face. Mention your areas.',
    icon: '🎬',
    color: '#448AFF',
  },
  {
    num: '03',
    title: 'Rider Books You',
    sub: 'You get notified instantly',
    body: 'When a rider taps your link and sends a booking request, you get an SMS and in-app notification. You see their name, pickup area, and the price they agreed to.',
    tip: 'Turn on notifications so you never miss a booking.',
    icon: '📲',
    color: '#FFB300',
  },
  {
    num: '04',
    title: 'Payment Is Confirmed',
    sub: 'Money held before you drive',
    body: 'When the rider taps Pull Up, their payment is held in escrow. You don\'t leave the house until their money is locked in. No more ride scammers.',
    tip: 'The hold amount includes the ride price + any add-on reserve.',
    icon: '🔒',
    color: '#00E676',
  },
  {
    num: '05',
    title: 'Tap OTW — Head to Pickup',
    sub: 'GPS tracking starts',
    body: 'Tap OTW (On The Way) and head to the rider. They can see your live location on the map. When you arrive, tap HERE.',
    tip: 'If rider doesn\'t show within the wait window, you can pull off and keep a no-show fee.',
    icon: '🚗',
    color: '#448AFF',
  },
  {
    num: '06',
    title: 'Rider Confirms — Ride Active',
    sub: 'Payment captured, ride starts',
    body: 'The rider taps BET (heading to your car). Payment is captured at this moment — not at the end. Your earnings are locked in. Drive safe.',
    tip: 'This is when HMU deducts the platform fee based on your daily earnings tier.',
    icon: '✅',
    color: '#00E676',
  },
  {
    num: '07',
    title: 'Add-Ons During the Ride',
    sub: 'Extra stops, snacks, extras',
    body: 'If you offer add-on services (extra stops, wait time, etc), the rider can add them during the ride. Each add-on is confirmed and charged separately from the base fare.',
    tip: 'Set up your Service Menu in your profile to offer add-ons.',
    icon: '🛒',
    color: '#FFB300',
  },
  {
    num: '08',
    title: 'End Ride — You\'re Done',
    sub: 'Dispute window opens',
    body: 'When you drop off the rider, tap End Ride. A short dispute window opens — the rider has a few minutes to flag any issues. If all clear, your payment is finalized.',
    tip: 'Both you and the rider rate each other after the ride.',
    icon: '🏁',
    color: '#448AFF',
  },
  {
    num: '09',
    title: 'Cash Out Your Earnings',
    sub: 'Instant or standard payout',
    body: 'Go to Cashout, pick your amount with the slider, choose Instant or Standard payout, and tap Cash Out. HMU First members get free instant payouts. Free tier pays $1 or 1%.',
    tip: 'Your first payout may take 1-2 days while Stripe verifies your account. We\'ll text you when it\'s ready.',
    icon: '💰',
    color: '#00E676',
  },
];

export default function DriverGuidePage() {
  return (
    <div style={{
      background: '#080808', color: '#fff', minHeight: '100svh',
      fontFamily: 'var(--font-body, DM Sans, sans-serif)',
    }}>
      {/* Hero */}
      <div style={{
        padding: '60px 20px 40px', textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(0,230,118,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚗</div>
        <h1 style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: '36px', lineHeight: 1.1, marginBottom: '12px',
        }}>
          HOW DRIVERS<br />GET PAID ON HMU
        </h1>
        <p style={{ fontSize: '15px', color: '#888', maxWidth: '340px', margin: '0 auto', lineHeight: 1.5 }}>
          Welcome to HMU ATL. We&apos;re Atlanta-based and built this for Atlanta drivers. Here&apos;s how the whole ride works, start to finish.
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
            href="/sign-in?type=driver"
            style={{
              display: 'inline-block', padding: '16px 48px', borderRadius: '100px',
              background: '#00E676', color: '#080808', fontWeight: 700, fontSize: '16px',
              textDecoration: 'none',
            }}
          >
            Start Driving
          </a>
          <p style={{ fontSize: '12px', color: '#555', marginTop: '12px' }}>
            Questions? We&apos;re real people in Atlanta. Text us anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
