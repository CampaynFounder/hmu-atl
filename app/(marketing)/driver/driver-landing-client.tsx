'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import { Footer } from '@/components/landing/footer';
import ShowcaseCarousel from '@/components/driver/showcase-carousel';
import { CmsProvider, useCmsContext } from '@/lib/cms/provider';
import { useZone } from '@/lib/cms/use-zone';
import { useFlag } from '@/lib/cms/use-flag';
import type { ContentMap, FlagMap } from '@/lib/cms/types';
import { getDefaultSectionOrder } from '@/lib/cms/section-registry';
import styles from './driver.module.css';

export default function DriverLandingClient({ initialContent, initialFlags, sectionOrder, funnelStage, brandLabel = 'HMU ATL' }: { initialContent?: ContentMap; initialFlags?: FlagMap; sectionOrder?: string[]; funnelStage?: string; brandLabel?: string }) {
  return (
    <CmsProvider initialContent={initialContent ?? {}} initialFlags={initialFlags} sectionOrder={sectionOrder} funnelStage={funnelStage}>
      <DriverLandingInner brandLabel={brandLabel} />
    </CmsProvider>
  );
}

function DriverLandingInner({ brandLabel }: { brandLabel: string }) {
  const router = useRouter();

  // CMS zones
  const tickerItems = useZone<string[]>('ticker_items', ['You set the price', 'The less you make — the less we take', 'Hit your cap — we take zero', 'Cash App • Venmo • Zelle • Bank — always free', 'Payment secured upfront', 'No show — still paid']);
  const tickerSpeed = useZone('ticker_speed', '18');
  const heroEyebrow = useZone('hero_eyebrow', 'For ATL Driver-Preneurs');
  const heroLine1 = useZone('hero_headline_line1', 'Keep More.');
  const heroLine2 = useZone('hero_headline_line2', 'Ride<span style="color:var(--green)">Fair</span> &gt; Ride<span style="opacity:0.25">share</span>');
  const heroSub = useZone('hero_subheadline', 'You Drive. You Thrive. Stop Letting Algorithms Determine Your Worth. <strong>Your Pay. Your Way.</strong> HMU.');
  const heroCtaPrimary = useZone('hero_cta_primary', 'Keep More $$$ From My Rides');
  const heroCtaSecondary = useZone('hero_cta_secondary', 'See how it works ↓');
  const heroTrust = useZone('hero_trust_text', 'Drivers live in ATL right now — <strong>try it free today</strong>');
  const painLabel = useZone('pain_label', 'The Problem');
  const painHeadline = useZone('pain_headline', 'Other Apps <span style="text-decoration:line-through;text-decoration-color:var(--green)">Playin in Our Face</span>');
  const painBody = useZone('pain_body', "You're putting miles on your car, burning gas, blocking time — and they set your rate, take their cut no matter what, and leave you waiting when riders waste your time.");
  const painCards = useZone<Array<{ icon: string; title: string; body: string }>>('pain_cards', [
    { icon: '⏱', title: 'They set your price. You just drive.', body: "Uber, Lyft — they calculate what you make. Same flat cut whether you did 1 ride or 20. That's not a business, that's a job with worse hours." },
    { icon: '🚗', title: 'You pull up. They not ready.', body: 'You drove 12 minutes to get there. Now they "5 more minutes." That\'s gas, time, and another ride you missed while you sat there waiting.' },
    { icon: '👻', title: 'They cancel. You get nothing.', body: "They accepted, you drove over, now they ghost. Other platforms give you a small fee — eventually. HMU protects your time from jump." },
  ]);
  const howLabel = useZone('how_label', 'How It Works');
  const howHeadline = useZone('how_headline', '<span style="color:var(--green)">How</span><br />Driverpreneurs<br />Get Paid');
  const howSub = useZone('how_subheadline', 'Post your availability. Set your price. Rider pays before you move. Done.');
  const howSteps = useZone<Array<{ num: string; title: string; body: string }>>('how_steps', [
    { num: '01', title: 'You post your HMU', body: "Tell the city you're available. Your area, your time, your minimum price. Riders in your area see your post and your rating." },
    { num: '02', title: 'Rider taps Pull Up — money locked', body: "When a rider confirms, payment is held before you go anywhere. Not a promise. The money is secured the second they say BET." },
    { num: '03', title: 'You show up. They better show up.', body: "You tap HERE when you arrive. If they're not ready in 10 minutes — no-show fee. You still eat." },
    { num: '04', title: 'End ride. Get your money.', body: "Tap End Ride. Rider has 45 minutes to dispute or payment releases automatically to your Cash App, Venmo, Zelle, or bank." },
  ]);
  const protectionBadge = useZone('protection_badge', '🔒 Driver Protection');
  const protectionHeadline = useZone('protection_headline', 'Make Money<br /><span style="color: var(--green)">Doin Rides</span>');
  const protectionBody = useZone('protection_body', 'We <strong>secure the payment upfront</strong> before you ever leave your block. Once you\'ve made it to the pickup, the rider needs a real reason not to pay.');
  const protectionCards = useZone<Array<{ situation: string; headline: string; result: string }>>('protection_cards', [
    { situation: 'Situation 01', headline: 'No Response', result: 'Get Paid' },
    { situation: 'Situation 02', headline: 'Still Getting Dressed', result: 'Still Gettin Paid' },
    { situation: 'Situation 03', headline: 'Wastin Your Time', result: 'Get Paid' },
  ]);
  const trackingLabel = useZone('tracking_label', 'Live Tracking');
  const trackingHeadline = useZone('tracking_headline', 'Stop Guessing<br />Where To<br /><span style="color:var(--green)">Pull Up</span>');
  const trackingSub = useZone('tracking_subheadline', 'See exactly where the rider is. They see exactly where you are. No more "where you at" texts. ETA updates in real-time.');
  const trackingFeatures = useZone<Array<{ icon: string; text: string }>>('tracking_features', [
    { icon: '📍', text: 'Real-time GPS — rider sees you OTW, you see their pin' },
    { icon: '⏱️', text: '10-min no-show timer starts when you tap HERE' },
    { icon: '💬', text: 'In-ride chat — no need to share your phone number' },
    { icon: '💵', text: 'Cash Mode — accept cash rides with ETA tracking. 3 free/month, unlimited with HMU First' },
    { icon: '🔐', text: 'Rider info stays private — you see display name only' },
  ]);
  const feesLabel = useZone('fees_label', 'How We Pay');
  const feesHeadline = useZone('fees_headline', 'The Less You<br />Make, The Less<br /><span style="color:var(--green)">We Take</span>');
  const feesIntro = useZone('fees_intro', "Other apps take the same flat cut whether you did one ride or ten. <strong>We don't do that.</strong> Your first $50 every day, we only take 10%. The more you earn, the more we earn — but we never go above 25%. And once you hit your daily cap, <strong>we take zero for the rest of the day.</strong>");
  const feeTiers = useZone<Array<{ label: string; rate: string; keep: string; width: string }>>('fee_tiers', [
    { label: 'First $50 today', rate: 'We take 10%', keep: 'You keep 90%', width: '90%' },
    { label: '$50–$150 today', rate: 'We take 15%', keep: 'You keep 85%', width: '85%' },
    { label: '$150–$300 today', rate: 'We take 20%', keep: 'You keep 80%', width: '80%' },
    { label: 'Over $300 today', rate: 'We take 25%', keep: 'You keep 75%', width: '75%' },
  ]);
  const capCard = useZone<{ title: string; body: string }>('cap_card', {
    title: 'Daily Cap: $40 max. Weekly Cap: $150 max.',
    body: "No matter how many rides you do, <strong>HMU ATL never takes more than $40 from you in a single day.</strong> Hit your cap and every ride after that is yours — zero platform fee. Resets midnight ET every day. Weekly cap resets every Sunday.",
  });
  const payoutLabel = useZone('payout_label', 'How You Get Paid');
  const payoutHeadline = useZone('payout_headline', 'Your Money,<br /><span style="color:var(--green)">Your Way</span>');
  const payoutSub = useZone('payout_subheadline', 'Pick how you want to get paid when you sign up. Switch anytime. Cash App, Venmo, Zelle, and bank transfers are always free.');
  const payoutMethods = useZone<Array<{ icon: string; name: string; speed: string; fee: string; best?: boolean; bestTag?: string; note?: string }>>('payout_methods', [
    { icon: '💸', name: 'Cash App', speed: 'Instant • Most popular in ATL', fee: 'FREE', best: true, bestTag: 'Most popular' },
    { icon: '💙', name: 'Venmo', speed: 'Instant', fee: 'FREE', best: true },
    { icon: '🏦', name: 'Zelle', speed: 'Instant bank transfer', fee: 'FREE', best: true },
    { icon: '🏧', name: 'Bank Account', speed: 'Next morning (Free tier) or instant (HMU First)', fee: 'FREE', best: true },
    { icon: '💳', name: 'Debit Card', speed: 'Instant push to any Visa/Mastercard debit', fee: '0.5% fee', note: '~$0.10 on $20' },
    { icon: '🅿️', name: 'PayPal', speed: 'Instant', fee: '1% fee', note: '~$0.20 on $20' },
  ]);
  const payoutAppleNote = useZone('payout_apple_note', "<strong>Apple Pay note:</strong> Apple Pay is a spending tool — Apple doesn't allow anyone to receive payouts to it. Use Cash App or Venmo instead and get paid just as fast, for free.");
  const socialProofPills = useZone<Array<{ emoji: string; quote: string; author: string }>>('social_proof_pills', [
    { emoji: '💰', quote: 'First $50 I only paid $4 in fees — wild', author: 'ATL Driver' },
    { emoji: '🔒', quote: 'Cap hit on a Saturday — free rides rest of the day', author: 'Decatur' },
    { emoji: '💸', quote: 'Cash App instant every time', author: 'Bankhead Driver' },
    { emoji: '⏱', quote: 'No more waiting for cancel fees', author: 'East ATL' },
    { emoji: '🚗', quote: 'They not ready? Still paid', author: 'Midtown' },
    { emoji: '⭐', quote: '92% Chill rating after 40 rides', author: 'OG Driver' },
  ]);
  const ctaEyebrow = useZone('cta_eyebrow', 'Ready to Run It?');
  const ctaHeadline = useZone('cta_headline', 'Start Earning More Per Ride');
  const ctaSub = useZone('cta_subheadline', 'No subscription required to start. Sign up, set your price, post your first HMU.');
  const ctaButtonText = useZone('cta_button_text', 'Keep More $$$ From My Rides');
  const ctaFinePrint = useZone('cta_fine_print', 'Free to start. No credit card. Cancel anytime.');
  const navCtaText = useZone('nav_cta_text', 'Make More Driving');

  // Feature flags
  const showPainSection = useFlag('driver_landing.pain_section', true);
  const showHowSection = useFlag('driver_landing.how_section', true);
  const showProtectionSection = useFlag('driver_landing.protection_section', true);
  const showTrackingSection = useFlag('driver_landing.tracking_section', true);
  const showFeesSection = useFlag('driver_landing.fees_section', true);
  const showPayoutSection = useFlag('driver_landing.payout_section', true);
  const showSocialProof = useFlag('driver_landing.social_proof', true);
  const showCtaSection = useFlag('driver_landing.cta_section', true);

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

  // Meta Pixel: driver landing viewed (with funnel stage)
  const { funnelStage: currentFunnelStage } = useCmsContext();
  useEffect(() => {
    fbEvent('ViewContent', { content_name: `Driver Landing - ${currentFunnelStage}`, content_category: 'driver_funnel', funnel_stage: currentFunnelStage, value: 9.99, currency: 'USD' });
    fbCustomEvent(`FunnelView_${currentFunnelStage}`, { audience: 'driver' });
  }, [currentFunnelStage]);

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const pErr = validatePhone(phone);
    const eErr = validateEmail(email);
    setPhoneError(pErr);
    setEmailError(eErr);
    if (pErr || eErr) return;
    setIsSubmitting(true);
    const params = new URLSearchParams(window.location.search);
    const currentStage = params.get('utm_funnel') || 'awareness';
    const currentPersona = params.get('utm_persona') || null;

    // Analytics: PostHog + Meta Pixel with funnel stage + persona
    posthog.capture('lead_captured', { lead_type: 'driver', funnel_stage: currentStage, persona: currentPersona, audience: 'driver', source: 'driver_landing', phone: phone ? 'provided' : 'empty', email: email ? 'provided' : 'empty' });
    fbEvent('Lead', { content_name: 'Driver Signup Form', content_category: `driver_${currentStage}` });
    fbCustomEvent(`FunnelLead_${currentStage}`, { audience: 'driver', persona: currentPersona });
    if (currentPersona) fbCustomEvent(`PersonaLead_${currentPersona}`, { audience: 'driver', funnel_stage: currentStage });

    // Store lead before redirecting
    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || null,
        phone: phone || null,
        lead_type: 'driver',
        source: 'driver_landing',
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        funnel_stage: currentStage,
        persona: currentPersona,
        audience: 'driver',
      }),
    }).catch(() => {});

    const signUpParams = new URLSearchParams({ type: 'driver' });
    if (currentPersona) signUpParams.set('persona', currentPersona);
    if (currentStage !== 'awareness') signUpParams.set('funnel_stage', currentStage);
    setTimeout(() => router.push(`/sign-up?${signUpParams}`), 800);
  };

  // Build sign-up URL that carries persona + funnel stage through
  const { sectionOrder: ctxSectionOrder, funnelStage: ctxFunnelStage } = useCmsContext();
  const [signUpUrl, setSignUpUrl] = useState('/sign-up?type=driver');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sp = new URLSearchParams({ type: 'driver' });
    const p = params.get('utm_persona');
    const f = params.get('utm_funnel');
    if (p) sp.set('persona', p);
    if (f && f !== 'awareness') sp.set('funnel_stage', f);
    setSignUpUrl(`/sign-up?${sp}`);
  }, []);

  // Dynamic section ordering — checks if a section should render based on the layout
  const activeSections = new Set(
    ctxSectionOrder.length > 0 ? ctxSectionOrder : getDefaultSectionOrder('driver_landing')
  );
  const isActive = (key: string) => activeSections.has(key);

  return (
    <div className={styles.container}>
      {/* Noise overlay */}
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>{brandLabel}</Link>
        <div className={styles.navActions}>
          <Link href="/sign-in?type=driver" className={styles.navSignIn}>Sign In</Link>
          <Link href={signUpUrl} className={styles.navCta} onClick={() => { posthog.capture('driver_nav_cta_clicked'); fbCustomEvent('DriverCTAClick', { location: 'nav' }); }}>{navCtaText}</Link>
        </div>
      </nav>

      {/* TICKER */}
      {isActive('ticker') && (
      <div className={styles.ticker}>
        <div className={styles.tickerInner} style={{ animationDuration: `${tickerSpeed}s` }}>
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <div key={i} className={styles.tickerItem}>{item}</div>
          ))}
        </div>
      </div>
      )}

      {/* HMU SHOWCASE CAROUSEL */}
      <div style={{ margin: '100px 20px 0', position: 'relative', zIndex: 2 }}>
        <ShowcaseCarousel />
      </div>

      {/* HERO */}
      {isActive('hero') && (
      <section className={styles.hero} style={{ paddingTop: 40 }}>
        <div className={`${styles.heroEyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0s' }}>
          {heroEyebrow}
        </div>
        <h1 className={styles.heroHeadline}>
          <span className={`${styles.fadeUp} ${styles.lineGreen}`} style={{ display: 'block', animationDelay: '0s' }}>{heroLine1}</span>
          <span className={`${styles.fadeUp}`} style={{ display: 'block', animationDelay: '0.1s' }} dangerouslySetInnerHTML={{ __html: heroLine2 }} />
        </h1>
        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }} dangerouslySetInnerHTML={{ __html: heroSub }} />
        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <Link href={signUpUrl} className={styles.btnPrimary} onClick={() => { posthog.capture('driver_hero_cta_clicked'); fbCustomEvent('DriverCTAClick', { location: 'hero' }); }}>{heroCtaPrimary}</Link>
          <a href="#how" className={styles.btnGhost}>{heroCtaSecondary}</a>
        </div>
        <div className={`${styles.heroTrust} ${styles.fadeUp}`} style={{ animationDelay: '0.5s' }}>
          <div className={styles.trustDot} />
          <p className={styles.trustText} dangerouslySetInnerHTML={{ __html: heroTrust }} />
        </div>
      </section>
      )}

      {/* PAIN */}
      {isActive('pain') && showPainSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>{painLabel}</p>
        <h2 className={`${styles.painHeadline} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: painHeadline }} />
        <p className={styles.reveal} style={{ fontSize: 16, color: 'var(--gray-light)', lineHeight: 1.6, marginBottom: 8 }}>
          {painBody}
        </p>
        <div className={styles.painCards}>
          {painCards.map((card, i) => (
          <div key={i} className={`${styles.painCard} ${styles.reveal}`}>
            <div className={styles.painIcon}>{card.icon}</div>
            <div>
              <div className={styles.painCardTitle}>{card.title}</div>
              <div className={styles.painCardBody}>{card.body}</div>
            </div>
          </div>
          ))}
        </div>
      </section>
      )}

      {/* HOW IT WORKS */}
      {isActive('how_it_works') && showHowSection && (
      <section className={styles.section} id="how">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>{howLabel}</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span dangerouslySetInnerHTML={{ __html: howHeadline }} />
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>{howSub}</p>
        <div className={styles.steps}>
          {howSteps.map((step, i) => (
          <div key={i} className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>{step.num}</div>
            <div>
              <div className={styles.stepTitle}>{step.title}</div>
              <div className={styles.stepBody}>{step.body}</div>
            </div>
          </div>
          ))}
        </div>
      </section>
      )}

      {/* PAYMENT PROTECTION */}
      {isActive('protection') && showProtectionSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.protectionBadge}>{protectionBadge}</div>
        <h2 className={`${styles.protectionHeadline} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: protectionHeadline }} />
        <p className={`${styles.protectionBody} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: protectionBody }} />
        <div className={styles.paidCards}>
          {protectionCards.map((card, i) => (
          <div key={i} className={`${styles.paidCard} ${styles.reveal}`}>
            <div className={styles.paidSituation}>{card.situation}</div>
            <div className={styles.paidHeadlineText}>{card.headline}</div>
            <div className={styles.paidResult}>{card.result}</div>
          </div>
          ))}
        </div>
      </section>
      )}

      {/* ETA TRACKING */}
      {isActive('tracking') && showTrackingSection && (
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>{trackingLabel}</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: trackingHeadline }} />
        <p className={`${styles.sectionSub} ${styles.reveal}`}>{trackingSub}</p>

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
          {trackingFeatures.map((f, i) => (
            <div key={i} className={styles.reveal} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              fontSize: 14, color: '#bbb', lineHeight: 1.4,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>
      </section>
      )}

      {/* HOW WE PAY — PROGRESSIVE FEES */}
      {isActive('fees') && showFeesSection && (
      <section className={styles.section} id="how-we-pay">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>{feesLabel}</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: feesHeadline }} />

        <p className={`${styles.feeIntro} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: feesIntro }} />

        {/* Progressive tier bars */}
        <div className={`${styles.tierBars} ${styles.reveal}`}>
          {feeTiers.map((tier, i) => (
          <div key={i} className={styles.tierBar}>
            <div className={styles.tierBarFill} style={{ width: tier.width }} />
            <div className={styles.tierBarContent}>
              <span className={styles.tierBarLabel}>{tier.label}</span>
              <div className={styles.tierBarRight}>
                <span className={styles.tierBarRate}>{tier.rate}</span>
                <span className={styles.tierBarKeep}>{tier.keep}</span>
              </div>
            </div>
          </div>
          ))}
        </div>

        {/* Daily cap callout */}
        <div className={`${styles.capCard} ${styles.reveal}`}>
          <div className={styles.capCardTitle}>{capCard.title}</div>
          <div className={styles.capCardBody} dangerouslySetInnerHTML={{ __html: capCard.body }} />
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
      )}

      {/* PAYOUT METHODS */}
      {isActive('payout') && showPayoutSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`} id="payout-methods">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>{payoutLabel}</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: payoutHeadline }} />
        <p className={`${styles.sectionSub} ${styles.reveal}`}>
          {payoutSub}
        </p>

        <div className={styles.methodsGrid}>
          {payoutMethods.map((method, i) => (
          <div key={i} className={`${styles.methodCard} ${method.best ? styles.methodCardBest : ''} ${styles.reveal}`}>
            <div className={styles.methodLeft}>
              <div className={styles.methodIcon}>{method.icon}</div>
              <div>
                <div className={styles.methodName}>{method.name}</div>
                <div className={styles.methodSpeed}>{method.speed}</div>
              </div>
            </div>
            <div className={styles.methodRight}>
              <div className={method.fee === 'FREE' ? styles.methodFeeFree : styles.methodFeePaid}>{method.fee}</div>
              {method.bestTag && <div className={styles.methodBestTag}>{method.bestTag}</div>}
              {method.note && <div className={styles.methodNote}>{method.note}</div>}
            </div>
          </div>
          ))}
        </div>

        <div className={`${styles.methodsNote} ${styles.reveal}`} dangerouslySetInnerHTML={{ __html: payoutAppleNote }} />
      </section>
      )}

      {/* SOCIAL PROOF */}
      {isActive('social_proof') && showSocialProof && (
      <section className={styles.section} style={{ padding: '48px 0' }}>
        <div className={styles.proofMarqueeWrap}>
          <div className={styles.proofMarquee}>
            {[...socialProofPills, ...socialProofPills].map((pill, i) => (
              <div key={i} className={styles.proofPill}>{pill.emoji} &quot;{pill.quote}&quot; — <span>{pill.author}</span></div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* FINAL CTA */}
      {isActive('cta') && showCtaSection && (
      <section className={styles.ctaSection} id="signup">
        <p className={`${styles.ctaEyebrow} ${styles.reveal}`}>{ctaEyebrow}</p>
        <h2 className={`${styles.ctaHeadline} ${styles.reveal}`}>
          Start Earning<br /><span className={styles.blockGreen}>More Per Ride</span>
        </h2>
        <p className={`${styles.ctaSub} ${styles.reveal}`}>
          {ctaSub}
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
            {isSubmitting ? 'Setting you up...' : ctaButtonText}
          </button>
          <p className={styles.ctaFine}>{ctaFinePrint}</p>
        </form>
      </section>
      )}

      {/* OFFER DETAILS */}
      {isActive('offer_details') && (
      <section id="offer-details" style={{
        padding: '40px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            fontFamily: 'var(--font-mono, Space Mono, monospace)',
            fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
            color: 'var(--gray)', marginBottom: 12,
          }}>
            Fee Structure
          </div>
          <div style={{
            fontSize: 13, color: 'var(--gray)', lineHeight: 1.7,
          }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: 'var(--gray-light)' }}>Progressive fees:</strong> The less you make, the less we take.
              Platform fees range from 10&ndash;25% based on your daily earnings, with daily ($40) and weekly ($150) caps.
            </p>
            <p style={{ marginBottom: 10 }}>
              Drivers on <strong style={{ color: 'var(--gray-light)' }}>HMU First ($9.99/mo)</strong> pay a flat 12% with lower caps ($25/day, $100/week) plus instant payouts after every ride.
            </p>
            <p>
              Standard payment processing applies to all transactions. Payouts via Cash App, Venmo, Zelle, and bank are always free.
            </p>
          </div>
        </div>
      </section>
      )}

      {/* FOOTER */}
      <Footer />
    </div>
  );
}
