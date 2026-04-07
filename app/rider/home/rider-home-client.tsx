'use client';

import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { posthog } from '@/components/analytics/posthog-provider';
import { PendingActionBanner } from '@/components/pending-action-banner';

const COMPARE_RIDES = [
  { label: 'Work commute (10 mi)', uber: 18, hmu: 10 },
  { label: 'Daycare pickup (5 mi)', uber: 14, hmu: 8 },
  { label: 'Grocery run + stops (8 mi)', uber: 22, hmu: 12 },
  { label: 'Across town (15 mi)', uber: 28, hmu: 15 },
  { label: 'Airport (20 mi)', uber: 38, hmu: 22 },
];

const USE_CASES = [
  { icon: '\uD83C\uDFE2', label: 'Ride to work' },
  { icon: '\uD83D\uDC76', label: 'Daycare pickup' },
  { icon: '\uD83D\uDED2', label: 'Grocery store' },
  { icon: '\uD83D\uDECD\uFE0F', label: 'Mall / shopping' },
  { icon: '\uD83D\uDCB3', label: 'Pay a bill' },
  { icon: '\u2702\uFE0F', label: 'Barber / stylist' },
  { icon: '\uD83D\uDCA8', label: 'Tattoo appointment' },
  { icon: '\uD83D\uDCBC', label: 'Travel to clients' },
  { icon: '\uD83D\uDD04', label: 'Round trip errands' },
  { icon: '\uD83D\uDEE3\uFE0F', label: 'Long distance' },
];

const RATINGS = [
  { emoji: '\u2705', label: 'CHILL', desc: 'Good vibes, smooth ride' },
  { emoji: '\uD83D\uDE0E', label: 'Cool AF', desc: 'Great energy, would ride again' },
  { emoji: '\uD83D\uDC40', label: 'Kinda Creepy', desc: 'Something felt off' },
  { emoji: '\uD83D\uDEA9', label: 'WEIRDO', desc: 'Safety concern flagged' },
];

export default function RiderHomeClient() {
  const { isSignedIn } = useUser();

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .rider-home { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding-top: 56px; }
        .section { padding: 40px 20px; }
        .section + .section { border-top: 1px solid var(--border); }
        .section-mono { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; }
        .section-head { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 36px; line-height: 1.05; margin-bottom: 12px; }
        .section-sub { font-size: 15px; color: var(--gray-light); line-height: 1.6; margin-bottom: 24px; }

        /* Hero */
        .hero { padding: 56px 20px 40px; text-align: center; }
        .hero-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 52px; line-height: 0.95; margin-bottom: 16px; }
        .hero-accent { color: var(--green); }
        .hero-sub { font-size: 16px; color: var(--gray-light); line-height: 1.6; max-width: 340px; margin: 0 auto 28px; }
        .hero-cta { display: inline-block; background: var(--green); color: var(--black); font-weight: 700; font-size: 17px; padding: 16px 40px; border-radius: 100px; text-decoration: none; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s, box-shadow 0.15s; }
        .hero-cta:hover { transform: scale(1.03); box-shadow: 0 0 32px rgba(0,230,118,0.25); }

        /* Price compare */
        .compare-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .compare-table th { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 2px; text-transform: uppercase; padding: 0 0 12px; text-align: left; }
        .compare-table th:nth-child(2), .compare-table th:nth-child(3) { text-align: right; }
        .compare-row { border-bottom: 1px solid var(--border); }
        .compare-row td { padding: 14px 0; font-size: 14px; }
        .compare-row td:first-child { color: var(--gray-light); padding-right: 12px; }
        .compare-row td:nth-child(2) { text-align: right; color: #FF5252; text-decoration: line-through; font-family: var(--font-mono, monospace); font-size: 15px; padding-right: 16px; }
        .compare-row td:nth-child(3) { text-align: right; color: var(--green); font-weight: 700; font-family: var(--font-mono, monospace); font-size: 15px; }
        .savings-row td { padding: 16px 0 0; font-weight: 700; font-size: 15px; }
        .savings-row td:first-child { color: #fff; }
        .savings-row td:nth-child(2) { text-align: right; text-decoration: none; color: #FF5252; font-family: var(--font-mono, monospace); }
        .savings-row td:nth-child(3) { text-align: right; color: var(--green); font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 24px; }
        .no-fees-pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,230,118,0.08); border: 1px solid rgba(0,230,118,0.2); border-radius: 100px; padding: 8px 16px; font-size: 13px; color: var(--green); font-weight: 600; margin-top: 20px; }

        /* Use cases */
        .use-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .use-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--gray-light); }
        .use-icon { font-size: 22px; flex-shrink: 0; }

        /* How it works */
        .steps { display: flex; flex-direction: column; gap: 0; }
        .step { display: flex; gap: 16px; }
        .step-line { display: flex; flex-direction: column; align-items: center; width: 32px; flex-shrink: 0; }
        .step-dot { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,230,118,0.12); border: 2px solid var(--green); display: flex; align-items: center; justify-content: center; font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 16px; color: var(--green); flex-shrink: 0; }
        .step-connector { width: 2px; flex: 1; background: rgba(0,230,118,0.15); min-height: 24px; }
        .step-content { padding-bottom: 28px; }
        .step-title { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
        .step-desc { font-size: 13px; color: var(--gray); line-height: 1.5; }

        /* Ratings */
        .rating-grid { display: flex; flex-direction: column; gap: 10px; }
        .rating-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; }
        .rating-emoji { font-size: 28px; flex-shrink: 0; }
        .rating-label { font-weight: 700; font-size: 15px; }
        .rating-desc { font-size: 12px; color: var(--gray); margin-top: 2px; }

        /* Safety */
        .safety-list { display: flex; flex-direction: column; gap: 12px; }
        .safety-item { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: var(--gray-light); line-height: 1.5; }
        .safety-check { color: var(--green); font-size: 16px; flex-shrink: 0; margin-top: 2px; }

        /* Driver callout */
        .driver-callout { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 24px 20px; text-align: center; }
        .driver-callout-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; margin-bottom: 8px; }
        .driver-callout-sub { font-size: 14px; color: var(--gray-light); line-height: 1.6; margin-bottom: 20px; }
        .driver-callout-cta { display: inline-block; background: transparent; border: 1px solid var(--green); color: var(--green); font-weight: 600; font-size: 15px; padding: 12px 32px; border-radius: 100px; text-decoration: none; transition: all 0.15s; }
        .driver-callout-cta:hover { background: rgba(0,230,118,0.1); }

        /* Bottom CTA */
        .bottom-cta { position: fixed; bottom: 0; left: 0; right: 0; padding: 16px 20px; background: linear-gradient(to top, rgba(8,8,8,0.98) 70%, transparent); z-index: 30; }
        .bottom-cta-btn { display: block; width: 100%; padding: 18px; border-radius: 100px; border: none; background: var(--green); color: var(--black); font-weight: 700; font-size: 17px; cursor: pointer; text-decoration: none; text-align: center; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s; }
        .bottom-cta-btn:hover { transform: scale(1.02); }
      `}</style>

      <div className="rider-home">
        {/* Pending actions */}
        {isSignedIn && (
          <div style={{ padding: '12px 0 0' }}>
            <PendingActionBanner maxActions={2} />
          </div>
        )}

        {/* Hero */}
        <div className="hero">
          <h1 className="hero-title">
            YOUR RIDE.<br />
            <span className="hero-accent">YOUR PRICE.</span>
          </h1>
          <p className="hero-sub">
            Skip the surge pricing and corporate fees. Book local ATL drivers directly — you name the price, they accept or pass.
          </p>
          <Link
            href={isSignedIn ? '/rider/browse' : '/sign-up?type=rider'}
            className="hero-cta"
            onClick={() => posthog.capture('rider_hero_cta_clicked', { signedIn: !!isSignedIn })}
          >
            {isSignedIn ? 'Browse Drivers' : 'Get Started — Free'}
          </Link>
        </div>

        {/* Price Comparison */}
        <div className="section">
          <p className="section-mono">Real Talk</p>
          <h2 className="section-head">SAVE 30-50% VS UBER & LYFT</h2>
          <p className="section-sub">
            No surge pricing. No booking fees. No service fees. No &ldquo;busy area&rdquo; markup. Just what you and the driver agree on.
          </p>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Ride</th>
                <th>Uber/Lyft</th>
                <th>HMU</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_RIDES.map((r) => (
                <tr key={r.label} className="compare-row">
                  <td>{r.label}</td>
                  <td>${r.uber}</td>
                  <td>${r.hmu}</td>
                </tr>
              ))}
              <tr className="savings-row">
                <td>Total (5 rides)</td>
                <td>${COMPARE_RIDES.reduce((s, r) => s + r.uber, 0)}</td>
                <td>${COMPARE_RIDES.reduce((s, r) => s + r.hmu, 0)}</td>
              </tr>
            </tbody>
          </table>
          <div className="no-fees-pill">
            No booking fees, no service fees, no surge
          </div>
        </div>

        {/* What people use it for */}
        <div className="section">
          <p className="section-mono">Rides For</p>
          <h2 className="section-head">WHEREVER YOU NEED TO GO</h2>
          <p className="section-sub">
            Everyday rides for real life. Multi-stop, round trip, and long distance available.
          </p>
          <div className="use-grid">
            {USE_CASES.map((u) => (
              <div key={u.label} className="use-card">
                <span className="use-icon">{u.icon}</span>
                {u.label}
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="section">
          <p className="section-mono">How It Works</p>
          <h2 className="section-head">3 TAPS TO A RIDE</h2>
          <div className="steps">
            <div className="step">
              <div className="step-line">
                <div className="step-dot">1</div>
                <div className="step-connector" />
              </div>
              <div className="step-content">
                <div className="step-title">Find a driver</div>
                <div className="step-desc">
                  Browse local drivers by area, price, schedule, and ratings. Every driver has a share link — tap it from IG, Twitter, or a group chat.
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-line">
                <div className="step-dot">2</div>
                <div className="step-connector" />
              </div>
              <div className="step-content">
                <div className="step-title">Name your price</div>
                <div className="step-desc">
                  Tell them where you&apos;re going and what you&apos;re offering. The driver sees your request and decides — no algorithm setting your price.
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-line">
                <div className="step-dot">3</div>
                <div className="step-connector" />
              </div>
              <div className="step-content">
                <div className="step-title">Ride safe, pay fair</div>
                <div className="step-desc">
                  Payment is held securely until the ride is done. Rate your driver after — CHILL, Cool AF, or flag a concern. Your rating protects the next rider.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ratings = Safety */}
        <div className="section">
          <p className="section-mono">Safety First</p>
          <h2 className="section-head">RATE EVERY RIDE. SEE EVERY RATING.</h2>
          <p className="section-sub">
            Every driver&apos;s rating history is public. Drivers with safety flags get reviewed. You always know who&apos;s pulling up.
          </p>
          <div className="rating-grid">
            {RATINGS.map((r) => (
              <div key={r.label} className="rating-card">
                <span className="rating-emoji">{r.emoji}</span>
                <div>
                  <div className="rating-label">{r.label}</div>
                  <div className="rating-desc">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature highlights */}
        <div className="section">
          <p className="section-mono">Why HMU</p>
          <h2 className="section-head">BUILT FOR HOW YOU ACTUALLY MOVE</h2>
          <p className="section-sub">
            Not another rideshare app. A real platform built for ATL.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '\uD83D\uDCB0', title: 'Name Your Price', desc: 'No algorithms. You say what you\'re paying. Driver accepts or passes.' },
              { icon: '\uD83D\uDD12', title: 'Payment Secured Before Pickup', desc: 'Your card is held when you tap Pull Up. Driver knows funds are real before they pull up.' },
              { icon: '\uD83D\uDCCD', title: 'Live ETA Tracking', desc: 'See your driver\'s location in real-time once they\'re OTW. Know exactly when they\'re pulling up.' },
              { icon: '\uD83D\uDCAC', title: 'In-Ride Chat', desc: 'Message your driver during the ride. No need to share your phone number.' },
              { icon: '\uD83D\uDD10', title: 'Your Info Stays Private', desc: 'Drivers see your display name only. Legal name, phone, and payment details are never shared.' },
              { icon: '\uD83D\uDCB5', title: 'Cash Rides Available', desc: 'Some drivers accept cash. Look for the CASH OK badge. No card needed — just agree on price and pay in person.' },
              { icon: '\uD83D\uDEE1\uFE0F', title: 'Verified Drivers Only', desc: 'Video intro + identity check required. Every driver\'s rating history is public.' },
            ].map(f => (
              <div key={f.title} style={{
                background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: '#888', lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ETA Map Visual */}
        <div className="section">
          <p className="section-mono">Live Tracking</p>
          <h2 className="section-head">KNOW EXACTLY WHEN THEY&apos;RE PULLING UP</h2>
          <p className="section-sub">
            Real-time ETA updates from the moment your driver goes OTW.
          </p>

          {/* Mini map illustration */}
          <div style={{
            background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '32px 24px', position: 'relative', overflow: 'hidden',
            marginBottom: 20,
          }}>
            {/* Faux map grid */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${(i + 1) * 12.5}%`, width: 1, background: '#fff',
                }} />
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(i + 1) * 16.6}%`, height: 1, background: '#fff',
                }} />
              ))}
            </div>

            {/* Route line */}
            <svg viewBox="0 0 300 120" style={{ width: '100%', height: 'auto', position: 'relative', zIndex: 1 }}>
              {/* Dashed route path */}
              <path
                d="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
                fill="none"
                stroke="rgba(0,230,118,0.3)"
                strokeWidth="2"
                strokeDasharray="6,4"
              />
              {/* Animated progress line */}
              <path
                d="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
                fill="none"
                stroke="#00E676"
                strokeWidth="2.5"
                strokeDasharray="180"
                strokeDashoffset="60"
                strokeLinecap="round"
              >
                <animate attributeName="stroke-dashoffset" from="180" to="0" dur="3s" repeatCount="indefinite" />
              </path>

              {/* Driver dot (moving) */}
              <circle r="8" fill="#00E676" opacity="0.9">
                <animateMotion
                  path="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="4" fill="#fff">
                <animateMotion
                  path="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </circle>

              {/* Rider dot (stationary) */}
              <circle cx="260" cy="30" r="8" fill="#448AFF" opacity="0.9" />
              <circle cx="260" cy="30" r="4" fill="#fff" />

              {/* Labels */}
              <text x="40" y="110" fill="#888" fontSize="9" fontFamily="var(--font-mono, monospace)" textAnchor="middle">DRIVER</text>
              <text x="260" y="18" fill="#888" fontSize="9" fontFamily="var(--font-mono, monospace)" textAnchor="middle">YOU</text>
            </svg>

            {/* ETA display */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 36, color: '#00E676', lineHeight: 1,
                }}>
                  4 MIN
                </div>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>
                  ETA
                </div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 36, color: '#fff', lineHeight: 1,
                }}>
                  1.2 MI
                </div>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>
                  Away
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety details */}
        <div className="section">
          <p className="section-mono">Built Different</p>
          <h2 className="section-head">DRIVERS ARE VERIFIED. ETA IS TRACKED.</h2>
          <div className="safety-list">
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              Know how far away your driver is and ETA. They no show, you no pay.
            </div>
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              Payment held in escrow — you&apos;re never charged until the ride is done
            </div>
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              Video intros — see your driver before they pull up
            </div>
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              45-minute dispute window after every ride
            </div>
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              3 WEIRDO flags from different riders = automatic review
            </div>
            <div className="safety-item">
              <span className="safety-check">{'\u2713'}</span>
              Drivers require payment-ready riders — no time wasters
            </div>
          </div>
        </div>

        {/* Driver callout */}
        <div className="section" style={{ paddingBottom: '120px' }}>
          <div className="driver-callout">
            <div className="driver-callout-title">GOT A CAR? EARN ON YOUR SCHEDULE.</div>
            <p className="driver-callout-sub">
              Drivers on HMU keep 88-100% of every ride. No corporate cut eating your earnings. Set your own areas, prices, and hours.
            </p>
            <Link href="/sign-up?type=driver" className="driver-callout-cta" onClick={() => posthog.capture('rider_page_driver_cta_clicked')}>
              Start Driving
            </Link>
          </div>
        </div>

        {/* Sticky bottom CTA */}
        <div className="bottom-cta">
          <Link
            href={isSignedIn ? '/rider/browse' : '/sign-up?type=rider'}
            className="bottom-cta-btn"
            onClick={() => posthog.capture('rider_sticky_cta_clicked', { signedIn: !!isSignedIn })}
          >
            {isSignedIn ? 'Browse Drivers' : 'Stop Overpaying For Rides'}
          </Link>
        </div>
      </div>
    </>
  );
}
