'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Footer } from '@/components/landing/footer';
import styles from './page.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function HomePage() {
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
      // For now, log to console — wire up to API/PostHog later
      console.log('Waitlist signup:', { email, city, userType });
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
        <Link href="/" className={styles.navLogo}>HMU ATL</Link>
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
          Launching Q2 2026 &bull; Metro Atlanta
        </div>

        <h1 className={`${styles.heroHeadline} ${styles.fadeUp}`} style={{ animationDelay: '0.1s' }}>
          <span className={styles.lineWhite}>HATE Blank Trips?</span>
          <span className={styles.lineGreen}>Get Atlanta&apos;s UpFront Driver Payment Platform.</span>
        </h1>

        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.2s' }}>
          Ride Scammers Hate HMU. They Go Ghost? You Get Paid. You Cancel? They Lose Nothing.
        </p>

        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
          <Link href="/rider" className={styles.btnOutline}>I NEED A RIDE</Link>
          <Link href="/driver" className={styles.btnPrimary}>I WANT TO DRIVE</Link>
        </div>

        <div className={`${styles.statsRow} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>127+</span>
            <span className={styles.statLabel}>Drivers Ready</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>$8</span>
            <span className={styles.statLabel}>Avg. Ride</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>60%</span>
            <span className={styles.statLabel}>Savings</span>
          </div>
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
                <div className={styles.step}>
                  <div className={styles.stepNum}>01</div>
                  <div>
                    <div className={styles.stepTitle}>Post Your Ride</div>
                    <div className={styles.stepBody}>Tell us where you&apos;re going and your price</div>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>02</div>
                  <div>
                    <div className={styles.stepTitle}>Match With a Driver</div>
                    <div className={styles.stepBody}>Swipe through available drivers in your area</div>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>03</div>
                  <div>
                    <div className={styles.stepTitle}>Pay &amp; Ride</div>
                    <div className={styles.stepBody}>Payment held in escrow. Released after safe arrival.</div>
                  </div>
                </div>
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
                <div className={styles.step}>
                  <div className={styles.stepNum}>01</div>
                  <div>
                    <div className={styles.stepTitle}>Go Live</div>
                    <div className={styles.stepBody}>Post your availability to the feed</div>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>02</div>
                  <div>
                    <div className={styles.stepTitle}>Accept Rides</div>
                    <div className={styles.stepBody}>Choose the rides that work for you</div>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>03</div>
                  <div>
                    <div className={styles.stepTitle}>Get Paid</div>
                    <div className={styles.stepBody}>Money secured before you pull up. Keep up to 90%.</div>
                  </div>
                </div>
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
            <div className={styles.whyCard}>
              <div className={styles.whyCardIcon}>📉</div>
              <div className={styles.whyCardTitle}>Save Up to 60%</div>
              <div className={styles.whyCardDesc}>
                No surge pricing. No corporate markup. Just fair rides between neighbors.
              </div>
            </div>

            <div className={styles.whyCard}>
              <div className={styles.whyCardIcon}>🔒</div>
              <div className={styles.whyCardTitle}>Money Secured First</div>
              <div className={styles.whyCardDesc}>
                Escrow holds payment before the driver pulls up. No chasing payments.
              </div>
            </div>

            <div className={styles.whyCard}>
              <div className={styles.whyCardIcon}>🤝</div>
              <div className={styles.whyCardTitle}>Community Trust</div>
              <div className={styles.whyCardDesc}>
                Chill Score ratings. Video intros. Real people, verified by their neighbors.
              </div>
            </div>

            <div className={styles.whyCard}>
              <div className={styles.whyCardIcon}>💸</div>
              <div className={styles.whyCardTitle}>Driver Keeps More</div>
              <div className={styles.whyCardDesc}>
                Drivers keep 88-90% of every ride. Daily fee cap means the rest is all theirs.
              </div>
            </div>
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
            <div className={styles.pricingCard}>
              <div className={styles.pricingRoute}>Buckhead → Airport</div>
              <div className={styles.pricingPrices}>
                <span className={styles.pricingHmu}>$18</span>
                <span className={styles.pricingUber}>$45</span>
              </div>
              <div className={styles.pricingSave}>Save $27 (60%)</div>
            </div>

            <div className={styles.pricingCard}>
              <div className={styles.pricingRoute}>Midtown → Downtown</div>
              <div className={styles.pricingPrices}>
                <span className={styles.pricingHmu}>$8</span>
                <span className={styles.pricingUber}>$22</span>
              </div>
              <div className={styles.pricingSave}>Save $14 (64%)</div>
            </div>

            <div className={styles.pricingCard}>
              <div className={styles.pricingRoute}>Decatur → Buckhead</div>
              <div className={styles.pricingPrices}>
                <span className={styles.pricingHmu}>$15</span>
                <span className={styles.pricingUber}>$38</span>
              </div>
              <div className={styles.pricingSave}>Save $23 (61%)</div>
            </div>
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
            We&apos;re starting in Metro Atlanta, but HMU is coming to more cities.
            Drop your info and we&apos;ll let you know when we launch near you.
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
                FIRST $500 FREE &bull; OG PRICING FOR OG DRIVERS
              </div>
              <h3 className={styles.dualCtaHeading}>
                WANT TO <span className={styles.green}>DRIVE?</span>
              </h3>
              <p className={styles.dualCtaDesc}>
                Set your price. Keep up to 90%. Daily fee cap means more money in your pocket.
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
                Skip the surge. Save up to 60% on every ride across Metro Atlanta.
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
      <Footer />
    </div>
  );
}
