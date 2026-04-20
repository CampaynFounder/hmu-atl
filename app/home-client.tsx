'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Footer } from '@/components/landing/footer';
import { CmsProvider } from '@/lib/cms/provider';
import { useZone } from '@/lib/cms/use-zone';
import { useFlag } from '@/lib/cms/use-flag';
import type { ContentMap, FlagMap } from '@/lib/cms/types';
import styles from './page.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function HomePageClient({
  initialContent = {},
  initialFlags = {},
  brandCity = 'Atlanta',
  brandCityShort = 'ATL',
}: {
  initialContent?: ContentMap;
  initialFlags?: FlagMap;
  brandCity?: string;
  brandCityShort?: string;
}) {
  return (
    <CmsProvider initialContent={initialContent} initialFlags={initialFlags}>
      <HomePageInner brandCity={brandCity} brandCityShort={brandCityShort} />
    </CmsProvider>
  );
}

function HomePageInner({ brandCity, brandCityShort }: { brandCity: string; brandCityShort: string }) {
  // CMS zones
  const heroBadge = useZone('hero_badge', `Launching Q2 2026 • Metro ${brandCity}`);
  const heroLine1 = useZone('hero_headline_line1', 'HATE Blank Trips?');
  const heroLine2 = useZone('hero_headline_line2', `Get ${brandCity}'s UpFront Driver Payment Platform.`);
  const heroSub = useZone('hero_subheadline', 'Ride Scammers Hate HMU. They Go Ghost? You Get Paid. You Cancel? They Lose Nothing.');
  const heroStats = useZone<Array<{ value: string; label: string }>>('hero_stats', [
    { value: '127+', label: 'Drivers Ready' },
    { value: '$8', label: 'Avg. Ride' },
    { value: '60%', label: 'Savings' },
  ]);
  const howRiderSteps = useZone<Array<{ num: string; title: string; body: string }>>('how_rider_steps', [
    { num: '01', title: 'Post Your Ride', body: "Tell us where you're going and your price" },
    { num: '02', title: 'Match With a Driver', body: 'Swipe through available drivers in your area' },
    { num: '03', title: 'Pay & Ride', body: 'Payment held in escrow. Released after safe arrival.' },
  ]);
  const howDriverSteps = useZone<Array<{ num: string; title: string; body: string }>>('how_driver_steps', [
    { num: '01', title: 'Go Live', body: 'Post your availability to the feed' },
    { num: '02', title: 'Accept Rides', body: 'Choose the rides that work for you' },
    { num: '03', title: 'Get Paid', body: 'Money secured before you pull up. Keep up to 90%.' },
  ]);
  const whyCards = useZone<Array<{ icon: string; title: string; desc: string }>>('why_cards', [
    { icon: '📉', title: 'Save Up to 60%', desc: 'No surge pricing. No corporate markup. Just fair rides between neighbors.' },
    { icon: '🔒', title: 'Money Secured First', desc: 'Escrow holds payment before the driver pulls up. No chasing payments.' },
    { icon: '🤝', title: 'Community Trust', desc: 'Chill Score ratings. Video intros. Real people, verified by their neighbors.' },
    { icon: '💸', title: 'Driver Keeps More', desc: 'Drivers keep 88-90% of every ride. Daily fee cap means the rest is all theirs.' },
  ]);
  const pricingRoutes = useZone<Array<{ route: string; hmu: string; uber: string; save: string }>>('pricing_routes', [
    { route: 'Buckhead → Airport', hmu: '$18', uber: '$45', save: 'Save $27 (60%)' },
    { route: 'Midtown → Downtown', hmu: '$8', uber: '$22', save: 'Save $14 (64%)' },
    { route: 'Decatur → Buckhead', hmu: '$15', uber: '$38', save: 'Save $23 (61%)' },
  ]);
  const waitlistHeadline = useZone('waitlist_headline', `NOT IN ${brandCity.toUpperCase()}?`);
  const waitlistSub = useZone('waitlist_subheadline', `We're starting in Metro ${brandCity}, but HMU is coming to more cities. Drop your info and we'll let you know when we launch near you.`);
  const driverCtaBanner = useZone('driver_cta_banner', 'FIRST $500 FREE • OG PRICING FOR OG DRIVERS');
  const driverCtaDesc = useZone('driver_cta_desc', 'Set your price. Keep up to 90%. Daily fee cap means more money in your pocket.');
  const riderCtaDesc = useZone('rider_cta_desc', `Skip the surge. Save up to 60% on every ride across Metro ${brandCity}.`);

  const [isDark, setIsDark] = useState(true);
  const [userType, setUserType] = useState<'rider' | 'driver'>('rider');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [emailError, setEmailError] = useState('');
  const [cityError, setCityError] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Time-based theme: 6am-6pm = light, 6pm-6am = dark
  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 6 || hour >= 18);
    };
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
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

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setEmailError('Enter a valid email');
      hasError = true;
    } else {
      setEmailError('');
    }

    if (!city.trim()) {
      setCityError('Enter your city');
      hasError = true;
    } else {
      setCityError('');
    }

    if (hasError) return;

    setIsSubmitting(true);
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          lead_type: userType || 'rider',
          source: 'homepage_waitlist',
        }),
      }).catch(() => {});
      setWaitlistSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`${styles.container} ${!isDark ? styles.light : ''}`}>
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU {brandCityShort}</Link>
        <div className={styles.navActions}>
          <div className={styles.themeToggle}>
            <span className={styles.themeIcon}>{isDark ? '🌙' : '☀️'}</span>
          </div>
          <Link href="/sign-in" className={styles.navSignIn}>Sign In</Link>
          <a href="#get-started" className={styles.navCta}>Sign Up</a>
        </div>
      </nav>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={`${styles.heroBadge} ${styles.fadeUp}`}>
          <span className={styles.pulsingDot}>
            <span className={styles.pulsingDotPing} />
            <span className={styles.pulsingDotInner} />
          </span>
          {heroBadge}
        </div>

        <h1 className={`${styles.heroHeadline} ${styles.fadeUp}`} style={{ animationDelay: '0.1s' }}>
          <span className={styles.lineWhite}>{heroLine1}</span>
          <span className={styles.lineGreen}>{heroLine2}</span>
        </h1>

        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.2s' }}>
          {heroSub}
        </p>

        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
          <Link href="/rider" className={styles.btnOutline}>I NEED A RIDE</Link>
          <Link href="/driver" className={styles.btnPrimary}>I WANT TO DRIVE</Link>
        </div>

        <div className={`${styles.statsRow} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          {heroStats.map((stat, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {i > 0 && <div className={styles.statDivider} />}
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.sectionInner}>
          <div className={styles.reveal}>
            <h2 className={styles.sectionHeadline}>
              HOW IT <span className={styles.green}>WORKS</span>
            </h2>
          </div>

          <div className={`${styles.howGrid} ${styles.reveal}`}>
            <div className={styles.howColumn}>
              <div className={styles.howColumnTitle}>
                <span className={styles.howColumnTitleIcon}>🚗</span>
                FOR <span className={styles.green}>RIDERS</span>
              </div>
              <div className={styles.steps}>
                {howRiderSteps.map((step, i) => (
                <div key={i} className={styles.step}>
                  <div className={styles.stepNum}>{step.num}</div>
                  <div>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <div className={styles.stepBody}>{step.body}</div>
                  </div>
                </div>
                ))}
              </div>
              <Link href="/rider" className={styles.howLink}>
                Learn more <span>→</span>
              </Link>
            </div>

            <div className={styles.howColumn}>
              <div className={styles.howColumnTitle}>
                <span className={styles.howColumnTitleIcon}>💰</span>
                FOR <span className={styles.green}>DRIVERS</span>
              </div>
              <div className={styles.steps}>
                {howDriverSteps.map((step, i) => (
                <div key={i} className={styles.step}>
                  <div className={styles.stepNum}>{step.num}</div>
                  <div>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <div className={styles.stepBody}>{step.body}</div>
                  </div>
                </div>
                ))}
              </div>
              <Link href="/driver" className={styles.howLink}>
                Learn more <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* WHY HMU? */}
      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.reveal}>
            <h2 className={styles.sectionHeadline}>
              WHY <span className={styles.green}>HMU?</span>
            </h2>
          </div>

          <div className={`${styles.whyGrid} ${styles.reveal}`}>
            {whyCards.map((card, i) => (
            <div key={i} className={styles.whyCard}>
              <div className={styles.whyCardIcon}>{card.icon}</div>
              <div className={styles.whyCardTitle}>{card.title}</div>
              <div className={styles.whyCardDesc}>{card.desc}</div>
            </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING SNAPSHOT */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.sectionInner}>
          <div className={styles.reveal}>
            <h2 className={styles.sectionHeadline}>
              REAL ATL ROUTES. <span className={styles.green}>REAL SAVINGS.</span>
            </h2>
          </div>

          <div className={`${styles.pricingGrid} ${styles.reveal}`}>
            {pricingRoutes.map((route, i) => (
            <div key={i} className={styles.pricingCard}>
              <div className={styles.pricingRoute}>{route.route}</div>
              <div className={styles.pricingPrices}>
                <span className={styles.pricingHmu}>{route.hmu}</span>
                <span className={styles.pricingUber}>{route.uber}</span>
              </div>
              <div className={styles.pricingSave}>{route.save}</div>
            </div>
            ))}
          </div>
        </div>
      </section>

      {/* CITY WAITLIST */}
      <section className={`${styles.waitlistSection} ${styles.reveal}`}>
        <div className={styles.waitlistInner}>
          <h2 className={styles.waitlistHeadline}>
            NOT IN <span className={styles.green}>ATLANTA?</span>
          </h2>
          <p className={styles.waitlistSub}>
            {waitlistSub}
          </p>

          {waitlistSubmitted ? (
            <div className={styles.waitlistSuccess}>
              <div className={styles.waitlistSuccessIcon}>✅</div>
              <div className={styles.waitlistSuccessTitle}>YOU&apos;RE ON THE LIST</div>
              <div className={styles.waitlistSuccessMsg}>
                We&apos;ll hit you up when HMU launches in your city. Stay tuned.
              </div>
            </div>
          ) : (
            <form className={styles.waitlistForm} onSubmit={handleWaitlistSubmit}>
              <div className={styles.waitlistRow}>
                <div style={{ flex: 1 }}>
                  <input
                    type="email"
                    className={styles.waitlistInput}
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  />
                  {emailError && <div className={styles.waitlistError}>{emailError}</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    className={styles.waitlistInput}
                    placeholder="Your city (e.g. Houston, Dallas)"
                    value={city}
                    onChange={(e) => { setCity(e.target.value); setCityError(''); }}
                  />
                  {cityError && <div className={styles.waitlistError}>{cityError}</div>}
                </div>
              </div>

              <div className={styles.waitlistTypeRow}>
                <button
                  type="button"
                  className={`${styles.waitlistTypeBtn} ${userType === 'rider' ? styles.waitlistTypeBtnActive : ''}`}
                  onClick={() => setUserType('rider')}
                >
                  🚗 I want to ride
                </button>
                <button
                  type="button"
                  className={`${styles.waitlistTypeBtn} ${userType === 'driver' ? styles.waitlistTypeBtnActive : ''}`}
                  onClick={() => setUserType('driver')}
                >
                  💰 I want to drive
                </button>
              </div>

              <button
                type="submit"
                className={styles.waitlistSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'JOINING...' : 'JOIN THE WAITLIST'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* DUAL CTA */}
      <section className={styles.section} id="get-started">
        <div className={styles.sectionInner}>
          <div className={styles.reveal}>
            <h2 className={styles.sectionHeadline}>
              GET <span className={styles.green}>STARTED</span>
            </h2>
          </div>

          <div className={`${styles.dualCtaGrid} ${styles.reveal}`}>
            <div className={`${styles.dualCtaCard} ${styles.dualCtaCardDriver}`}>
              <div className={`${styles.ogBanner} ${isDark ? styles.ogBannerDark : styles.ogBannerLight}`}>
                {driverCtaBanner}
              </div>
              <h3 className={styles.dualCtaHeading}>
                WANT TO <span className={styles.green}>DRIVE?</span>
              </h3>
              <p className={styles.dualCtaDesc}>
                {driverCtaDesc}
              </p>
              <Link href="/sign-up?type=driver" className={`${styles.dualCtaBtn} ${styles.dualCtaBtnFilled}`}>
                SIGN UP NOW
              </Link>
            </div>

            <div className={`${styles.dualCtaCard} ${styles.dualCtaCardRider}`}>
              <h3 className={styles.dualCtaHeading}>
                NEED A <span className={styles.green}>RIDE?</span>
              </h3>
              <p className={styles.dualCtaDesc}>
                {riderCtaDesc}
              </p>
              <Link href="/sign-up?type=rider" className={`${styles.dualCtaBtn} ${styles.dualCtaBtnOutline}`}>
                SIGN UP AS RIDER
              </Link>
            </div>
          </div>

          <div className={`${styles.dualCtaSignIn} ${styles.reveal}`}>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <Footer brandCity={brandCity} />
    </div>
  );
}
