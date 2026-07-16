'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import { fbEvent } from '@/components/analytics/meta-pixel';
import { Footer } from '@/components/landing/footer';
import { AppStoreBadges } from '@/components/landing/app-store-badges';
import { RIDES_COMPLETED_LABEL, MAX_SAVINGS_PCT } from '@/lib/marketing/stats';
import styles from './appstore.module.css';

const TICKER_ITEMS = [
  'Now on iOS + Android',
  `Rides up to ${MAX_SAVINGS_PCT}% cheaper`,
  'Cash App • Venmo • Zelle • Cash',
  'Verified local drivers',
  'Payment secured upfront',
  'No subscription to start',
];

const VALUE_CARDS = [
  {
    icon: '💸',
    title: 'Rides that don’t rob you',
    body: `Set your price and pay real Atlantans directly. Riders save up to <strong>${MAX_SAVINGS_PCT}% vs Uber</strong> on comparable routes.`,
  },
  {
    icon: '💳',
    title: 'Pay your way',
    body: 'Cash App, Venmo, Zelle, bank, or straight <strong>cash</strong>. No forced card, no hidden platform markup.',
  },
  {
    icon: '📍',
    title: 'Live GPS the whole way',
    body: 'Watch your driver pull up in real time. In-app chat means <strong>no sharing your number</strong>.',
  },
  {
    icon: '🔒',
    title: 'Secured before you move',
    body: 'Payment is locked upfront, so drivers get paid and riders are protected. <strong>Everybody eats.</strong>',
  },
];

const STEPS = [
  { num: '01', title: 'Download + verify your number', body: 'Grab the app free from the App Store or Google Play. One text to verify — you’re in.' },
  { num: '02', title: 'Post your HMU or tap a driver', body: 'Say where you’re headed and <span class="' + styles.highlight + '">set your price</span>. Local drivers nearby see it instantly.' },
  { num: '03', title: 'Pay secure, get matched', body: 'Payment is held upfront the second you both say BET. No cash fumbling at pickup.' },
  { num: '04', title: 'Pull up. Chill. Arrive.', body: 'Track the ride live, chat in-app, and get where you’re going for way less.' },
];

const PROOF_PILLS = [
  { emoji: '💰', quote: 'Half what Uber wanted', author: 'Rider · Midtown' },
  { emoji: '🚗', quote: 'Driver pulled up in 4 min', author: 'Rider · East ATL' },
  { emoji: '💸', quote: 'Paid straight to my Cash App', author: 'Driver · Bankhead' },
  { emoji: '🔒', quote: 'Money locked before I moved', author: 'Driver · Decatur' },
  { emoji: '⭐', quote: 'Real people, real rides', author: 'Rider · Westside' },
  { emoji: '📍', quote: 'Watched him the whole way', author: 'Rider · Buckhead' },
];

export default function AppstoreLandingClient({ brandCity = 'Atlanta', brandLabel = 'HMU ATL' }: { brandCity?: string; brandLabel?: string }) {
  // Analytics: page + store-intent view
  useEffect(() => {
    posthog.capture('appstore_landing_viewed', { brand_city: brandCity });
    fbEvent('ViewContent', { content_name: 'App Store Landing', content_category: 'app_download' });
  }, [brandCity]);

  // Scroll reveal (same pattern as driver/rider landings)
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

  // Fire a conversion event whenever a store badge (an <a>) is clicked anywhere
  // in the two badge groups. Delegated so we don't fork AppStoreBadges.
  const trackStoreClick = (location: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const store = /play\.google\.com/.test(anchor.href) ? 'google_play' : 'app_store';
    posthog.capture('app_store_click', { store, location, brand_city: brandCity });
    fbEvent('Lead', { content_name: 'App Download', content_category: store });
  };

  return (
    <div className={styles.container}>
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU</Link>
        <a href="#get" className={styles.navCta}>Get the App</a>
      </nav>

      {/* TICKER */}
      <div className={styles.ticker}>
        <div className={styles.tickerInner}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className={styles.tickerItem}>{item}</span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <header className={styles.hero}>
        <div className={styles.heroEyebrow}>Now on iPhone &amp; Android</div>
        <h1 className={styles.heroHeadline}>
          HMU.<br />
          <span className={styles.lineGreen}>Get The App.</span>
        </h1>
        <p className={styles.heroSub}>
          Metro {brandCity}&rsquo;s peer-to-peer cash ride app. Rides up to <strong>{MAX_SAVINGS_PCT}% cheaper</strong> than Uber, drivers keep more, and payment&rsquo;s locked upfront. <strong>Download free.</strong>
        </p>

        <div className={styles.badgesWrap} onClickCapture={trackStoreClick('hero')}>
          <AppStoreBadges align="start" />
        </div>

        <div className={styles.heroTrust}>
          <span className={styles.trustDot} />
          <span className={styles.trustText}>
            <strong>{RIDES_COMPLETED_LABEL}</strong> rides completed &mdash; live in {brandCity} right now
          </span>
        </div>
      </header>

      {/* STAT STRIP */}
      <div className={styles.statStrip}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{RIDES_COMPLETED_LABEL}</div>
          <div className={styles.statLabel}>Rides completed</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{MAX_SAVINGS_PCT}%</div>
          <div className={styles.statLabel}>Cheaper vs Uber</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>$0</div>
          <div className={styles.statLabel}>To start</div>
        </div>
      </div>

      {/* WHY HMU */}
      <section className={styles.section}>
        <div className={`${styles.sectionLabel} ${styles.reveal}`}>Why HMU</div>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          A Ride App<br />That Actually<br /><span className={styles.green}>Rides For You</span>
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>
          Big apps set the price and take their cut no matter what. HMU flips it &mdash; riders and drivers deal direct.
        </p>
        <div className={styles.valueGrid}>
          {VALUE_CARDS.map((c) => (
            <div key={c.title} className={`${styles.valueCard} ${styles.reveal}`}>
              <span className={styles.valueIcon}>{c.icon}</span>
              <div>
                <div className={styles.valueTitle}>{c.title}</div>
                <div className={styles.valueBody} dangerouslySetInnerHTML={{ __html: c.body }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={styles.sectionAlt} style={{ padding: '72px 20px' }}>
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>How It Works</div>
          <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
            <span className={styles.green}>Four Taps</span><br />To Rolling
          </h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`}>
            From download to drop-off. No surge, no surprises.
          </p>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <div key={s.num} className={`${styles.step} ${styles.reveal}`}>
                <div className={styles.stepNum}>{s.num}</div>
                <div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepBody} dangerouslySetInnerHTML={{ __html: s.body }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RIDER / DRIVER SPLIT */}
      <section className={styles.section}>
        <div className={`${styles.sectionLabel} ${styles.reveal}`}>One App, Two Ways to Win</div>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Ride or <span className={styles.green}>Drive</span>
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>
          The same download works both ways. Pick your side when you sign up.
        </p>
        <div className={styles.splitGrid}>
          <div className={`${styles.splitCard} ${styles.splitCardRider} ${styles.reveal}`}>
            <span className={styles.splitBadge}>For Riders</span>
            <div className={styles.splitName}>Get There For Less</div>
            <p className={styles.splitDesc}>Cheaper rides across Metro {brandCity} from real local drivers.</p>
            <ul className={styles.splitFeatures}>
              <li>Save up to {MAX_SAVINGS_PCT}% vs Uber &amp; Lyft</li>
              <li>Pay with Cash App, Venmo, Zelle or cash</li>
              <li>Live GPS + private in-app chat</li>
              <li>Payment protected until you arrive</li>
            </ul>
          </div>
          <div className={`${styles.splitCard} ${styles.reveal}`}>
            <span className={styles.splitBadge}>For Drivers</span>
            <div className={styles.splitName}>Keep More Per Ride</div>
            <p className={styles.splitDesc}>Set your own price and get paid the moment the rider gets in.</p>
            <ul className={styles.splitFeatures}>
              <li>You set the price, you keep more</li>
              <li>Paid upfront &mdash; money locked before you roll</li>
              <li>Instant payouts to Cash App, Venmo, Zelle</li>
              <li>No subscription required to start</li>
            </ul>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className={styles.sectionAlt} style={{ padding: '48px 0' }}>
        <div className={styles.proofMarqueeWrap}>
          <div className={styles.proofMarquee}>
            {[...PROOF_PILLS, ...PROOF_PILLS].map((p, i) => (
              <span key={i} className={styles.proofPill}>
                {p.emoji} &ldquo;{p.quote}&rdquo; <span>&mdash; {p.author}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="get" className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <div className={styles.ctaEyebrow}>Ready to Roll?</div>
          <h2 className={styles.ctaHeadline}>
            Download<br /><span className={styles.blockGreen}>{brandLabel}</span>
          </h2>
          <p className={styles.ctaSub}>
            Free on iPhone and Android. Verify your number and take your first ride today.
          </p>
          <div onClickCapture={trackStoreClick('footer_cta')}>
            <AppStoreBadges align="center" />
          </div>
          <p className={styles.ctaFine}>Free to download. No subscription. Cancel anytime.</p>
        </div>
      </section>

      <Footer brandCity={brandCity} />
    </div>
  );
}
