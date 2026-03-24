'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import { Footer } from '@/components/landing/footer';
import styles from './driver.module.css';

export default function DriverLandingClient() {
  const router = useRouter();
  const [earnedToday, setEarnedToday] = useState('140');
  const [simKeep, setSimKeep] = useState('$122.31');
  const [simTook, setSimTook] = useState('$17.69');
  const [simNote, setSimNote] = useState('First $50 at 10% + $90 at 15%');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');

  const PHONE_REGEX = /^(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validatePhone = (val: string) => {
    if (!val) return 'Phone number is required';
    if (!PHONE_REGEX.test(val.trim())) return 'Enter a valid US phone number';
    return '';
  };

  const validateEmail = (val: string) => {
    if (!val) return 'Email is required';
    if (!EMAIL_REGEX.test(val.trim())) return 'Enter a valid email address';
    return '';
  };

  // Meta Pixel: driver landing viewed
  useEffect(() => {
    fbEvent('ViewContent', { content_name: 'Driver Landing', content_category: 'driver_funnel' });
  }, []);

  // Scroll reveal
  useEffect(() => {
    const reveals = document.querySelectorAll(`.${styles.reveal}`);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Fee calculator — total daily earnings breakdown
  useEffect(() => {
    const total = parseFloat(earnedToday) || 0;

    if (total <= 0) {
      setSimKeep('$0.00');
      setSimTook('$0.00');
      setSimNote('Enter how much you want to earn today');
      return;
    }

    // ~4.4% effective Stripe cost per $20 avg ride (2.9% + $0.30/$20)
    const STRIPE_RATIO = 0.956;
    const DAILY_CAP = 40;
    const TIERS = [
      { prev: 0,   upTo: 50,       rate: 0.10, label: 'First $50' },
      { prev: 50,  upTo: 150,      rate: 0.15, label: '$50–$150' },
      { prev: 150, upTo: 300,      rate: 0.20, label: '$150–$300' },
      { prev: 300, upTo: Infinity, rate: 0.25, label: 'Over $300' },
    ];

    let rawFee = 0;
    let remaining = total;
    const parts: string[] = [];

    for (const { prev, upTo, rate, label } of TIERS) {
      if (remaining <= 0) break;
      const tierSize = upTo === Infinity ? remaining : upTo - prev;
      const inTier = Math.min(remaining, tierSize);
      rawFee += inTier * STRIPE_RATIO * rate;
      parts.push(`${label} at ${(rate * 100).toFixed(0)}%`);
      remaining -= inTier;
    }

    const capHit = rawFee >= DAILY_CAP;
    const totalFee = Math.min(rawFee, DAILY_CAP);
    const kept = total - totalFee;

    setSimKeep('$' + kept.toFixed(2));
    setSimTook('$' + totalFee.toFixed(2));

    if (capHit) {
      setSimNote('🔥 <strong>Daily cap hit — everything after this is all yours, $0 to HMU</strong>');
    } else {
      setSimNote(parts.join(' + '));
    }
  }, [earnedToday]);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    const pErr = validatePhone(phone);
    const eErr = validateEmail(email);
    setPhoneError(pErr);
    setEmailError(eErr);
    if (pErr || eErr) return;
    setIsSubmitting(true);
    posthog.capture('driver_signup_form_submitted', { phone: phone ? 'provided' : 'empty', email: email ? 'provided' : 'empty' });
    fbEvent('Lead', { content_name: 'Driver Signup Form', content_category: 'driver_funnel' });
    setTimeout(() => router.push('/sign-up?type=driver'), 800);
  };

  return (
    <div className={styles.container}>
      {/* Noise overlay */}
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU ATL</Link>
        <div className={styles.navActions}>
          <Link href="/sign-in?type=driver" className={styles.navSignIn}>Sign In</Link>
          <Link href="/sign-up?type=driver" className={styles.navCta} onClick={() => { posthog.capture('driver_nav_cta_clicked'); fbCustomEvent('DriverCTAClick', { location: 'nav' }); }}>Verify Payments</Link>
        </div>
      </nav>

      {/* TICKER */}
      <div className={styles.ticker}>
        <div className={styles.tickerInner}>
          <div className={styles.tickerItem}>You set the price</div>
          <div className={styles.tickerItem}>The less you make — the less we take</div>
          <div className={styles.tickerItem}>Hit your cap — we take zero</div>
          <div className={styles.tickerItem}>Cash App • Venmo • Zelle • Bank — always free</div>
          <div className={styles.tickerItem}>Payment secured upfront</div>
          <div className={styles.tickerItem}>No show — still paid</div>
          <div className={styles.tickerItem}>You set the price</div>
          <div className={styles.tickerItem}>The less you make — the less we take</div>
          <div className={styles.tickerItem}>Hit your cap — we take zero</div>
          <div className={styles.tickerItem}>Cash App • Venmo • Zelle • Bank — always free</div>
          <div className={styles.tickerItem}>Payment secured upfront</div>
          <div className={styles.tickerItem}>No show — still paid</div>
        </div>
      </div>

      {/* LAUNCH OFFER BANNER */}
      <div className={`${styles.fadeUp}`} style={{
        animationDelay: '0s',
        background: 'linear-gradient(135deg, rgba(0,230,118,0.08) 0%, rgba(0,230,118,0.02) 100%)',
        border: '1px solid rgba(0,230,118,0.25)',
        borderRadius: 16,
        padding: '24px 20px',
        margin: '100px 20px 0',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-block', background: '#fff', color: '#080808',
            fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
            padding: '4px 12px', borderRadius: 100, marginBottom: 8,
          }}>
            DRIVERS
          </span>
        </div>
        <div style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: 'clamp(32px, 8vw, 52px)',
          lineHeight: 1,
          color: 'var(--green)',
          marginBottom: 8,
        }}>
          FREE $500<a href="#offer-details" style={{ fontSize: '0.45em', verticalAlign: 'super', color: 'var(--gray)', textDecoration: 'none' }}>*</a>
        </div>
        <div style={{
          fontFamily: 'var(--font-body, DM Sans, sans-serif)',
          fontSize: 15,
          color: 'var(--gray-light)',
          lineHeight: 1.5,
        }}>
          Keep <strong style={{ color: '#fff' }}>100% of your earnings</strong> while you get started.
          Zero platform fees.
        </div>
      </div>

      {/* HERO */}
      <section className={styles.hero} style={{ paddingTop: 40 }}>
        <div className={`${styles.heroEyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0s' }}>
          For ATL Driver-Preneurs
        </div>
        <h1 className={styles.heroHeadline}>
          <span className={`${styles.fadeUp} ${styles.lineGreen}`} style={{ display: 'block', animationDelay: '0s' }}>Passenger</span>
          <span className={`${styles.fadeUp}`} style={{ display: 'block', animationDelay: '0.1s' }}>Payment</span>
          <span className={`${styles.fadeUp} ${styles.lineDim}`} style={{ display: 'block', animationDelay: '0.2s' }}>Verification</span>
        </h1>
        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
          Quit Raw Doggin&apos; Your Cash Rides. <strong>Know Before You Go.</strong> Don&apos;t Push Up Without It.
        </p>
        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <Link href="/sign-up?type=driver" className={styles.btnPrimary} onClick={() => { posthog.capture('driver_hero_cta_clicked'); fbCustomEvent('DriverCTAClick', { location: 'hero' }); }}>Verify My Passenger&apos;s Payment</Link>
          <a href="#how" className={styles.btnGhost}>See how it works ↓</a>
        </div>
        <div className={`${styles.heroTrust} ${styles.fadeUp}`} style={{ animationDelay: '0.5s' }}>
          <div className={styles.trustDot} />
          <p className={styles.trustText}>Drivers live in ATL right now — <strong>try it free today</strong></p>
        </div>
      </section>

      {/* PAIN */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>The Problem</p>
        <h2 className={`${styles.painHeadline} ${styles.reveal}`}>
          Other Apps <span className={styles.strike}>Playin in Our Face</span>
        </h2>
        <p className={styles.reveal} style={{ fontSize: 16, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 8 }}>
          You&apos;re putting miles on your car, burning gas, blocking time — and they set your rate,
          take their cut no matter what, and leave you waiting when riders waste your time.
        </p>
        <div className={styles.painCards}>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div className={styles.painIcon}>⏱</div>
            <div>
              <div className={styles.painCardTitle}>They set your price. You just drive.</div>
              <div className={styles.painCardBody}>Uber, Lyft — they calculate what you make. Same flat cut whether you did 1 ride or 20. That&apos;s not a business, that&apos;s a job with worse hours.</div>
            </div>
          </div>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div className={styles.painIcon}>🚗</div>
            <div>
              <div className={styles.painCardTitle}>You pull up. They not ready.</div>
              <div className={styles.painCardBody}>You drove 12 minutes to get there. Now they &quot;5 more minutes.&quot; That&apos;s gas, time, and another ride you missed while you sat there waiting.</div>
            </div>
          </div>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div className={styles.painIcon}>👻</div>
            <div>
              <div className={styles.painCardTitle}>They cancel. You get nothing.</div>
              <div className={styles.painCardBody}>They accepted, you drove over, now they ghost. Other platforms give you a small fee — eventually. HMU protects your time from jump.</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={styles.section} id="how">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>How It Works</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span className={styles.green}>How</span><br />Driverpreneurs<br />Get Paid
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>Post your availability. Set your price. Rider pays before you move. Done.</p>
        <div className={styles.steps}>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>01</div>
            <div>
              <div className={styles.stepTitle}>You post your HMU</div>
              <div className={styles.stepBody}>Tell the city you&apos;re available. Your area, your time, <span className={styles.highlight}>your minimum price.</span> Riders in your area see your post and your rating.</div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>02</div>
            <div>
              <div className={styles.stepTitle}>Rider taps COO — money locked</div>
              <div className={styles.stepBody}>When a rider confirms, <span className={styles.highlight}>payment is held before you go anywhere.</span> Not a promise. The money is secured the second they say BET.</div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>03</div>
            <div>
              <div className={styles.stepTitle}>You show up. They better show up.</div>
              <div className={styles.stepBody}>You tap HERE when you arrive. <span className={styles.highlight}>If they&apos;re not ready in 10 minutes — no-show fee. You still eat.</span></div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>04</div>
            <div>
              <div className={styles.stepTitle}>End ride. Get your money.</div>
              <div className={styles.stepBody}>Tap End Ride. Rider has 45 minutes to dispute or <span className={styles.highlight}>payment releases automatically to your Cash App, Venmo, Zelle, or bank.</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* PAYMENT PROTECTION */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.protectionBadge}>🔒 Driver Protection</div>
        <h2 className={`${styles.protectionHeadline} ${styles.reveal}`}>
          Make Money<br /><span style={{ color: 'var(--green)' }}>Doin Rides</span>
        </h2>
        <p className={`${styles.protectionBody} ${styles.reveal}`}>
          We <strong>secure the payment upfront</strong> before you ever leave your block.
          Once you&apos;ve made it to the pickup, the rider needs a real reason not to pay.
        </p>
        <div className={styles.paidCards}>
          <div className={`${styles.paidCard} ${styles.reveal}`}>
            <div className={styles.paidSituation}>Situation 01</div>
            <div className={styles.paidHeadlineText}>No Response</div>
            <div className={styles.paidResult}>Get Paid</div>
          </div>
          <div className={`${styles.paidCard} ${styles.reveal}`}>
            <div className={styles.paidSituation}>Situation 02</div>
            <div className={styles.paidHeadlineText}>Still Getting Dressed</div>
            <div className={styles.paidResult}>Still Gettin Paid</div>
          </div>
          <div className={`${styles.paidCard} ${styles.reveal}`}>
            <div className={styles.paidSituation}>Situation 03</div>
            <div className={styles.paidHeadlineText}>Wastin Your Time</div>
            <div className={styles.paidResult}>Get Paid</div>
          </div>
        </div>
      </section>

      {/* ETA TRACKING */}
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Live Tracking</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Stop Guessing<br />Where To<br /><span className={styles.green}>Pull Up</span>
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>
          See exactly where the rider is. They see exactly where you are. No more &ldquo;where you at&rdquo; texts. ETA updates in real-time.
        </p>

        <div className={styles.reveal} style={{
          background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20, padding: '32px 24px', position: 'relative', overflow: 'hidden',
          marginBottom: 20,
        }}>
          {/* Faux map grid */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`v${i}`} style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(i + 1) * 12.5}%`, width: 1, background: '#fff',
              }} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`h${i}`} style={{
                position: 'absolute', left: 0, right: 0,
                top: `${(i + 1) * 16.6}%`, height: 1, background: '#fff',
              }} />
            ))}
          </div>

          {/* Route animation */}
          <svg viewBox="0 0 300 120" style={{ width: '100%', height: 'auto', position: 'relative', zIndex: 1 }}>
            <path
              d="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
              fill="none" stroke="rgba(0,230,118,0.3)" strokeWidth="2" strokeDasharray="6,4"
            />
            <path
              d="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30"
              fill="none" stroke="#00E676" strokeWidth="2.5"
              strokeDasharray="180" strokeDashoffset="60" strokeLinecap="round"
            >
              <animate attributeName="stroke-dashoffset" from="180" to="0" dur="3s" repeatCount="indefinite" />
            </path>
            {/* Driver dot (you - moving) */}
            <circle r="8" fill="#00E676" opacity="0.9">
              <animateMotion path="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle r="4" fill="#fff">
              <animateMotion path="M 40 90 C 80 90, 100 40, 150 50 S 220 20, 260 30" dur="3s" repeatCount="indefinite" />
            </circle>
            {/* Rider dot (stationary) */}
            <circle cx="260" cy="30" r="8" fill="#448AFF" opacity="0.9" />
            <circle cx="260" cy="30" r="4" fill="#fff" />
            <text x="40" y="110" fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">YOU</text>
            <text x="260" y="18" fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">RIDER</text>
          </svg>

          {/* ETA display */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#00E676', lineHeight: 1 }}>4 MIN</div>
              <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>ETA</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', lineHeight: 1 }}>1.2 MI</div>
              <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>To Pickup</div>
            </div>
          </div>
        </div>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: '\uD83D\uDCCD', text: 'Real-time GPS — rider sees you OTW, you see their pin' },
            { icon: '\u23F1\uFE0F', text: '10-min no-show timer starts when you tap HERE' },
            { icon: '\uD83D\uDCAC', text: 'In-ride chat — no need to share your phone number' },
            { icon: '\uD83D\uDCB5', text: 'Cash Mode — accept cash rides with ETA tracking. 3 free/month, unlimited with HMU First' },
            { icon: '\uD83D\uDD10', text: 'Rider info stays private — you see display name only' },
          ].map(f => (
            <div key={f.text} className={styles.reveal} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              fontSize: 14, color: '#bbb', lineHeight: 1.4,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>
      </section>

      {/* HOW WE PAY — PROGRESSIVE FEES */}
      <section className={styles.section} id="how-we-pay">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>How We Pay</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          The Less You<br />Make, The Less<br /><span className={styles.green}>We Take</span>
        </h2>

        <p className={`${styles.feeIntro} ${styles.reveal}`}>
          Other apps take the same flat cut whether you did one ride or ten.{' '}
          <strong>We don&apos;t do that.</strong> Your first $50 every day, we only take 10%.
          The more you earn, the more we earn — but we never go above 25%.
          And once you hit your daily cap, <strong>we take zero for the rest of the day.</strong>
        </p>

        {/* Progressive tier bars */}
        <div className={`${styles.tierBars} ${styles.reveal}`}>
          <div className={styles.tierBar}>
            <div className={styles.tierBarFill} style={{ width: '90%' }} />
            <div className={styles.tierBarContent}>
              <span className={styles.tierBarLabel}>First $50 today</span>
              <div className={styles.tierBarRight}>
                <span className={styles.tierBarRate}>We take 10%</span>
                <span className={styles.tierBarKeep}>You keep 90%</span>
              </div>
            </div>
          </div>
          <div className={styles.tierBar}>
            <div className={styles.tierBarFill} style={{ width: '85%' }} />
            <div className={styles.tierBarContent}>
              <span className={styles.tierBarLabel}>$50–$150 today</span>
              <div className={styles.tierBarRight}>
                <span className={styles.tierBarRate}>We take 15%</span>
                <span className={styles.tierBarKeep}>You keep 85%</span>
              </div>
            </div>
          </div>
          <div className={styles.tierBar}>
            <div className={styles.tierBarFill} style={{ width: '80%' }} />
            <div className={styles.tierBarContent}>
              <span className={styles.tierBarLabel}>$150–$300 today</span>
              <div className={styles.tierBarRight}>
                <span className={styles.tierBarRate}>We take 20%</span>
                <span className={styles.tierBarKeep}>You keep 80%</span>
              </div>
            </div>
          </div>
          <div className={styles.tierBar}>
            <div className={styles.tierBarFill} style={{ width: '75%' }} />
            <div className={styles.tierBarContent}>
              <span className={styles.tierBarLabel}>Over $300 today</span>
              <div className={styles.tierBarRight}>
                <span className={styles.tierBarRate}>We take 25%</span>
                <span className={styles.tierBarKeep}>You keep 75%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Daily cap callout */}
        <div className={`${styles.capCard} ${styles.reveal}`}>
          <div className={styles.capCardTitle}>Daily Cap: $40 max. Weekly Cap: $150 max.</div>
          <div className={styles.capCardBody}>
            No matter how many rides you do, <strong>HMU ATL never takes more than $40 from you in a single day.</strong>{' '}
            Hit your cap and every ride after that is yours — zero platform fee.
            Resets midnight ET every day. Weekly cap resets every Sunday.
          </div>
        </div>

        {/* Live fee simulator */}
        <div className={`${styles.simulator} ${styles.reveal}`}>
          <div className={styles.simulatorLabel}>Try The Math</div>
          <div className={styles.simulatorRow}>
            <label htmlFor="sim-earned">You Make ($)</label>
            <input
              id="sim-earned"
              type="number"
              className={styles.simInput}
              value={earnedToday}
              min={0}
              max={1000}
              onChange={(e) => setEarnedToday(e.target.value)}
            />
          </div>
          <div className={styles.simResult}>
            <div className={styles.simResultItem}>
              <div className={styles.simResultLabel}>You Keep</div>
              <div className={styles.simResultValueGreen}>{simKeep}</div>
            </div>
            <div className={styles.simResultItem}>
              <div className={styles.simResultLabel}>HMU Takes</div>
              <div className={styles.simResultValueDim}>{simTook}</div>
            </div>
          </div>
          <div className={styles.simResultSub}>out of ${earnedToday || '0'} earned today</div>
          <div
            className={styles.simNote}
            dangerouslySetInnerHTML={{ __html: simNote }}
          />
        </div>

        {/* Receipt mockup */}
        <p className={`${styles.sectionLabel} ${styles.reveal}`} style={{ marginTop: 32 }}>What Your Receipt Looks Like</p>
        <div className={`${styles.receipt} ${styles.reveal}`}>
          <div className={styles.receiptTitle}>Normal ride — your first ride today</div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Rider paid</span>
            <span className={styles.receiptValue}>$20.00</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>HMU took (10%)</span>
            <span className={styles.receiptValueSmall}>$1.91</span>
          </div>
          <div className={styles.receiptRowHighlight}>
            <span className={styles.receiptLabelGreen}>You kept</span>
            <span className={styles.receiptValueGreen}>$18.09</span>
          </div>
        </div>

        <div className={`${styles.receiptCap} ${styles.reveal}`}>
          <div className={styles.receiptCapEmoji}>🔥</div>
          <div className={styles.receiptCapKept}>$20.00</div>
          <div className={styles.receiptCapTook}>HMU took: $0.00</div>
          <div className={styles.receiptCapMsg}>Daily cap hit — rest of today is ALL yours</div>
        </div>

        {/* Tier comparison */}
        <p className={`${styles.sectionLabel} ${styles.reveal}`} style={{ marginTop: 40 }}>Free vs HMU First</p>
        <div className={styles.tiersGrid}>
          <div className={`${styles.tierCard} ${styles.reveal}`}>
            <div className={styles.tierName}>Free</div>
            <div className={styles.tierDesc}>Start earning with zero upfront cost</div>
            <ul className={styles.tierFeatures}>
              <li>Progressive rate — starts at 10%, first $50/day</li>
              <li>Daily cap: $40 max platform fee</li>
              <li>Weekly cap: $150 max platform fee</li>
              <li>Set your own price</li>
              <li>Payment secured upfront</li>
              <li>No-show protection</li>
              <li>Payout next morning (6am batch)</li>
              <li>3 cash rides/month included</li>
              <li className={styles.featureLocked}>Priority placement in driver feed</li>
              <li className={styles.featureLocked}>Instant payouts</li>
              <li className={styles.featureLocked}>Read rider comments</li>
              <li className={styles.featureLocked}>Unlimited cash rides</li>
            </ul>
          </div>
          <div className={`${styles.tierCard} ${styles.tierCardFeatured} ${styles.reveal}`}>
            <div className={styles.tierBadge}>HMU First</div>
            <div className={styles.tierName}>$9.99<span className={styles.tierNameSub}>/mo</span></div>
            <div className={styles.tierDesc}>Flat 12% — lower cap — instant money</div>
            <ul className={styles.tierFeatures}>
              <li>Flat 12% rate on every ride — never more</li>
              <li>Daily cap: $25 max platform fee (lower)</li>
              <li>Weekly cap: $100 max platform fee (lower)</li>
              <li>Instant payout the second ride ends</li>
              <li>Priority placement — shown first to riders</li>
              <li>Read what riders said about you</li>
              <li>HMU First badge on your profile</li>
              <li>Unlimited cash rides — no counter, no packs needed</li>
            </ul>
            <div className={styles.savingsCallout}>
              3 rides/day at $20? HMU First pays for itself and you pocket{' '}
              <strong style={{ color: 'var(--green)' }}>~$180 more per month</strong> vs free.
            </div>
          </div>
        </div>
      </section>

      {/* PAYOUT METHODS */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="payout-methods">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>How You Get Paid</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Your Money,<br /><span className={styles.green}>Your Way</span>
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>
          Pick how you want to get paid when you sign up. Switch anytime.
          Cash App, Venmo, Zelle, and bank transfers are always free.
        </p>

        <div className={styles.methodsGrid}>
          <div className={`${styles.methodCard} ${styles.methodCardBest} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>💸</div>
              <div>
                <div className={styles.methodName}>Cash App</div>
                <div className={styles.methodSpeed}>Instant • Most popular in ATL</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeeFree}>FREE</div>
              <div className={styles.methodBestTag}>Most popular</div>
            </div>
          </div>
          <div className={`${styles.methodCard} ${styles.methodCardBest} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>💙</div>
              <div>
                <div className={styles.methodName}>Venmo</div>
                <div className={styles.methodSpeed}>Instant</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeeFree}>FREE</div>
            </div>
          </div>
          <div className={`${styles.methodCard} ${styles.methodCardBest} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>🏦</div>
              <div>
                <div className={styles.methodName}>Zelle</div>
                <div className={styles.methodSpeed}>Instant bank transfer</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeeFree}>FREE</div>
            </div>
          </div>
          <div className={`${styles.methodCard} ${styles.methodCardBest} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>🏧</div>
              <div>
                <div className={styles.methodName}>Bank Account</div>
                <div className={styles.methodSpeed}>Next morning (Free tier) or instant (HMU First)</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeeFree}>FREE</div>
            </div>
          </div>
          <div className={`${styles.methodCard} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>💳</div>
              <div>
                <div className={styles.methodName}>Debit Card</div>
                <div className={styles.methodSpeed}>Instant push to any Visa/Mastercard debit</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeePaid}>0.5% fee</div>
              <div className={styles.methodNote}>~$0.10 on $20</div>
            </div>
          </div>
          <div className={`${styles.methodCard} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>🅿️</div>
              <div>
                <div className={styles.methodName}>PayPal</div>
                <div className={styles.methodSpeed}>Instant</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={styles.methodFeePaid}>1% fee</div>
              <div className={styles.methodNote}>~$0.20 on $20</div>
            </div>
          </div>
        </div>

        <div className={`${styles.methodsNote} ${styles.reveal}`}>
          <strong>Apple Pay note:</strong> Apple Pay is a spending tool — Apple doesn&apos;t allow anyone to receive payouts to it. Use Cash App or Venmo instead and get paid just as fast, for free.
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className={styles.section} style={{ padding: '48px 0' }}>
        <div className={styles.proofMarqueeWrap}>
          <div className={styles.proofMarquee}>
            <div className={styles.proofPill}>💰 &quot;First $50 I only paid $4 in fees — wild&quot; — <span>ATL Driver</span></div>
            <div className={styles.proofPill}>🔒 &quot;Cap hit on a Saturday — free rides rest of the day&quot; — <span>Decatur</span></div>
            <div className={styles.proofPill}>💸 &quot;Cash App instant every time&quot; — <span>Bankhead Driver</span></div>
            <div className={styles.proofPill}>⏱ &quot;No more waiting for cancel fees&quot; — <span>East ATL</span></div>
            <div className={styles.proofPill}>🚗 &quot;They not ready? Still paid&quot; — <span>Midtown</span></div>
            <div className={styles.proofPill}>⭐ &quot;92% Chill rating after 40 rides&quot; — <span>OG Driver</span></div>
            <div className={styles.proofPill}>💰 &quot;First $50 I only paid $4 in fees — wild&quot; — <span>ATL Driver</span></div>
            <div className={styles.proofPill}>🔒 &quot;Cap hit on a Saturday — free rides rest of the day&quot; — <span>Decatur</span></div>
            <div className={styles.proofPill}>💸 &quot;Cash App instant every time&quot; — <span>Bankhead Driver</span></div>
            <div className={styles.proofPill}>⏱ &quot;No more waiting for cancel fees&quot; — <span>East ATL</span></div>
            <div className={styles.proofPill}>🚗 &quot;They not ready? Still paid&quot; — <span>Midtown</span></div>
            <div className={styles.proofPill}>⭐ &quot;92% Chill rating after 40 rides&quot; — <span>OG Driver</span></div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={styles.ctaSection} id="signup">
        <p className={`${styles.ctaEyebrow} ${styles.reveal}`}>Ready to Run It?</p>
        <h2 className={`${styles.ctaHeadline} ${styles.reveal}`}>
          Start Verifying<br /><span className={styles.blockGreen}>Passenger Payments</span>
        </h2>
        <p className={`${styles.ctaSub} ${styles.reveal}`}>
          No subscription required to start.<br />
          Sign up, set your price, post your first HMU.
        </p>
        <form className={`${styles.ctaForm} ${styles.reveal}`} onSubmit={handleSignup}>
          <div className={styles.inputWrap}>
            <input
              type="tel"
              className={`${styles.ctaInput} ${phoneError ? styles.ctaInputError : ''}`}
              placeholder="Your phone number"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(validatePhone(e.target.value)); }}
              onBlur={() => setPhoneError(validatePhone(phone))}
            />
            {phoneError && <p className={styles.fieldError}>{phoneError}</p>}
          </div>
          <div className={styles.inputWrap}>
            <input
              type="email"
              className={`${styles.ctaInput} ${emailError ? styles.ctaInputError : ''}`}
              placeholder="Your email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(validateEmail(e.target.value)); }}
              onBlur={() => setEmailError(validateEmail(email))}
            />
            {emailError && <p className={styles.fieldError}>{emailError}</p>}
          </div>
          <button
            type="submit"
            className={`${styles.ctaSubmit} ${isSubmitting ? styles.ctaSubmitLoading : ''}`}
          >
            {isSubmitting ? 'Setting up verification...' : 'Verify My Passenger\u2019s Payment \u2014 Free'}
          </button>
          <p className={styles.ctaFine}>Free to start. No credit card. Cancel anytime.</p>
        </form>
      </section>

      {/* OFFER DETAILS */}
      <section id="offer-details" style={{
        padding: '40px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            fontFamily: 'var(--font-mono, Space Mono, monospace)',
            fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
            color: 'var(--gray)', marginBottom: 12,
          }}>
            * Launch Offer Details
          </div>
          <div style={{
            fontSize: 13, color: 'var(--gray)', lineHeight: 1.7,
          }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: 'var(--gray-light)' }}>FREE $500 Launch Offer:</strong> New drivers
              pay 0% platform fees until any of the following conditions are met &mdash; whichever comes first:
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
              <li>15 completed rides</li>
              <li>$500 in total earnings</li>
              <li>30 days from signup</li>
            </ul>
            <p style={{ marginBottom: 10 }}>
              Offer terms are <strong style={{ color: 'var(--gray-light)' }}>locked at the time you sign up</strong>.
              If we change the offer later, your original terms are honored in full.
            </p>
            <p style={{ marginBottom: 10 }}>
              After the offer period, standard progressive platform fees apply (10&ndash;25% with daily and weekly caps).
              Drivers on HMU First ($9.99/mo) pay a flat 12% with lower caps.
            </p>
            <p>
              Standard payment processing applies to all transactions. Platform fees are separate and are what this offer waives.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />
    </div>
  );
}
