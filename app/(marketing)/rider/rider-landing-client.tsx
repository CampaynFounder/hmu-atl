'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import { Footer } from '@/components/landing/footer';
import styles from './rider.module.css';

export default function RiderLandingClient() {
  const router = useRouter();
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const pErr = validatePhone(phone);
    const eErr = validateEmail(email);
    setPhoneError(pErr);
    setEmailError(eErr);
    if (pErr || eErr) return;
    setIsSubmitting(true);
    try {
      posthog.capture('rider_signup_form_submitted', {
        phone: phone ? 'provided' : 'empty',
        email: email ? 'provided' : 'empty',
      });
    } catch (_) {
      // posthog may not be initialized
    }

    // Store lead before redirecting
    const params = new URLSearchParams(window.location.search);
    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || null,
        phone: phone || null,
        lead_type: 'rider',
        source: 'rider_landing',
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
      }),
    }).catch(() => {});

    setTimeout(() => router.push('/sign-up?type=rider'), 800);
  };

  const testimonials = [
    { quote: 'Saved $24 going to the airport. Never using Uber again.', author: 'Marcus, East Atlanta' },
    { quote: 'My driver was chill af. We actually had a real conversation.', author: 'Keya, Decatur' },
    { quote: 'The escrow thing is genius. I feel safe knowing my money is protected.', author: 'Darius, Buckhead' },
    { quote: 'I matched with the same driver three times now. It\'s like having a homie with a car.', author: 'Nia, Midtown' },
    { quote: '$8 from Midtown to Downtown. Uber wanted $22. Do the math.', author: 'Jaylen, West End' },
    { quote: 'Video intros sold me. I knew who was pulling up before they got there.', author: 'Tasha, College Park' },
  ];

  return (
    <div className={styles.container}>
      {/* Noise overlay */}
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU ATL</Link>
        <div className={styles.navActions}>
          <Link href="/sign-in" className={styles.navSignIn}>Sign In</Link>
          <Link
            href="/sign-up?type=rider"
            className={styles.navCta}
            onClick={() => { try { posthog.capture('rider_nav_cta_clicked'); } catch (_) {} }}
          >
            Lock In
          </Link>
        </div>
      </nav>

      {/* TICKER */}
      <div className={styles.ticker}>
        <div className={styles.tickerInner}>
          <div className={styles.tickerItem}>Skip the Surge</div>
          <div className={styles.tickerItem}>Save Up to 60%</div>
          <div className={styles.tickerItem}>Escrow Protected</div>
          <div className={styles.tickerItem}>No Corporate Middleman</div>
          <div className={styles.tickerItem}>Real ATL Drivers</div>
          <div className={styles.tickerItem}>Skip the Surge</div>
          <div className={styles.tickerItem}>Save Up to 60%</div>
          <div className={styles.tickerItem}>Escrow Protected</div>
          <div className={styles.tickerItem}>No Corporate Middleman</div>
          <div className={styles.tickerItem}>Real ATL Drivers</div>
        </div>
      </div>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={`${styles.heroEyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0s' }}>
          Peer-to-Peer Rides &bull; Metro Atlanta
        </div>
        <h1 className={styles.heroHeadline}>
          <span className={`${styles.fadeUp}`} style={{ display: 'block', animationDelay: '0s' }}>STOP PAYING</span>
          <span className={`${styles.fadeUp} ${styles.lineGreen}`} style={{ display: 'block', animationDelay: '0.1s' }}>SURGE PRICES.</span>
        </h1>
        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
          HMU connects you directly with local Atlanta drivers. <strong>Fair prices. Secured payments.</strong> No corporate cut inflating your fare.
        </p>
        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <Link
            href="/sign-up?type=rider"
            className={styles.btnPrimary}
            onClick={() => { try { posthog.capture('rider_hero_cta_clicked'); } catch (_) {} }}
          >
            SIGN UP FREE
          </Link>
          <a href="#how-it-works" className={styles.btnGhost}>See how it works &darr;</a>
        </div>
        <div className={`${styles.heroTrust} ${styles.fadeUp}`} style={{ animationDelay: '0.5s' }}>
          <div className={styles.trustDot} />
          <p className={styles.trustText}>Drivers live in ATL right now &mdash; <strong>rides starting at $5</strong></p>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>The Problem</p>
        <h2 className={`${styles.painHeadline} ${styles.reveal}`}>TIRED OF THIS?</h2>
        <div className={styles.painCards}>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div>
              <div className={styles.painCardTitle}>$45 for a 20-minute ride</div>
              <div className={styles.painCardBody}>Uber and Lyft jack up prices whenever they want. Surge pricing at 2am? That&apos;s your whole night&apos;s budget.</div>
            </div>
          </div>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div>
              <div className={styles.painCardTitle}>Random driver every time</div>
              <div className={styles.painCardBody}>No relationship, no trust. Just a stranger with an app and a rating that means nothing.</div>
            </div>
          </div>
          <div className={`${styles.painCard} ${styles.reveal}`}>
            <div>
              <div className={styles.painCardTitle}>Money gone before the ride starts</div>
              <div className={styles.painCardBody}>You get charged immediately. Driver cancels? Good luck getting that refund fast.</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={styles.section} id="how-it-works">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>How It Works</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span className={styles.green}>How HMU</span><br />Works For<br />Riders
        </h2>
        <p className={`${styles.sectionSub} ${styles.reveal}`}>Post what you need. Pick who you trust. Pay when it&apos;s real.</p>
        <div className={styles.steps}>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>01</div>
            <div>
              <div className={styles.stepTitle}>Post Your Ride</div>
              <div className={styles.stepBody}>Drop your pickup, destination, and what you want to pay. <span className={styles.highlight}>Drivers in your area see it instantly.</span></div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>02</div>
            <div>
              <div className={styles.stepTitle}>Browse Drivers</div>
              <div className={styles.stepBody}>Swipe through available drivers. See their <span className={styles.highlight}>Chill Score, video intro, and reviews</span> from real riders.</div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>03</div>
            <div>
              <div className={styles.stepTitle}>Lock In & Pay</div>
              <div className={styles.stepBody}>Tap Pull Up to confirm. <span className={styles.highlight}>Your payment is held in escrow</span> &mdash; driver doesn&apos;t get paid until you arrive safe.</div>
            </div>
          </div>
          <div className={`${styles.step} ${styles.reveal}`}>
            <div className={styles.stepNum}>04</div>
            <div>
              <div className={styles.stepTitle}>Ride & Rate</div>
              <div className={styles.stepBody}><span className={styles.highlight}>Track your driver in real-time.</span> Rate them after. Build the community you trust.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING COMPARISON */}
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Real Routes</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Real Routes.<br /><span className={styles.green}>Real Savings.</span>
        </h2>
        <div className={styles.pricingCards}>
          <div className={`${styles.pricingCard} ${styles.reveal}`}>
            <div className={styles.pricingRoute}>Buckhead &rarr; Airport</div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>HMU</span>
              <span className={styles.pricingHmu}>$18</span>
            </div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>Uber</span>
              <span className={styles.pricingUber}>$45</span>
            </div>
            <div className={styles.pricingSave}>Save 60%</div>
          </div>
          <div className={`${styles.pricingCard} ${styles.reveal}`}>
            <div className={styles.pricingRoute}>Midtown &rarr; Downtown</div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>HMU</span>
              <span className={styles.pricingHmu}>$8</span>
            </div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>Uber</span>
              <span className={styles.pricingUber}>$22</span>
            </div>
            <div className={styles.pricingSave}>Save 64%</div>
          </div>
          <div className={`${styles.pricingCard} ${styles.reveal}`}>
            <div className={styles.pricingRoute}>Decatur &rarr; Buckhead</div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>HMU</span>
              <span className={styles.pricingHmu}>$15</span>
            </div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>Uber</span>
              <span className={styles.pricingUber}>$38</span>
            </div>
            <div className={styles.pricingSave}>Save 61%</div>
          </div>
        </div>
      </section>

      {/* SAFETY & TRUST */}
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Trust & Safety</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Your Safety.<br /><span className={styles.green}>Our Priority.</span>
        </h2>
        <div className={styles.safetyGrid}>
          <div className={`${styles.safetyCard} ${styles.reveal}`}>
            <div className={styles.safetyIcon}>&#128274;</div>
            <div className={styles.safetyTitle}>Escrow Protection</div>
            <div className={styles.safetyBody}>Your money is held until you arrive. If something goes wrong, you dispute &mdash; funds stay locked.</div>
          </div>
          <div className={`${styles.safetyCard} ${styles.reveal}`}>
            <div className={styles.safetyIcon}>&#9996;&#65039;</div>
            <div className={styles.safetyTitle}>Chill Score</div>
            <div className={styles.safetyBody}>Every driver has a community rating. CHILL, Cool AF, or red flags &mdash; you see it all before you ride.</div>
          </div>
          <div className={`${styles.safetyCard} ${styles.reveal}`}>
            <div className={styles.safetyIcon}>&#127909;</div>
            <div className={styles.safetyTitle}>Video Intros</div>
            <div className={styles.safetyBody}>See your driver before you book. Real face, real person, no catfishing.</div>
          </div>
          <div className={`${styles.safetyCard} ${styles.reveal}`}>
            <div className={styles.safetyIcon}>&#9201;</div>
            <div className={styles.safetyTitle}>45-Min Dispute Window</div>
            <div className={styles.safetyBody}>After every ride, you have 45 minutes to flag anything. We hold the funds until it&apos;s resolved.</div>
          </div>
        </div>
      </section>

      {/* OG STATUS */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={`${styles.ogCard} ${styles.reveal}`}>
          <div className={styles.ogBadge}>OG Status</div>
          <h2 className={styles.ogTitle}>BECOME AN OG</h2>
          <p className={styles.ogBody}>
            Complete <strong>10 rides with zero disputes</strong> and unlock OG status.
            See driver comments. Get priority matching with top-rated drivers.
            You earned it.
          </p>
        </div>
      </section>

      {/* PAYMENT METHODS */}
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Payments</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          Pay <span className={styles.green}>Your Way</span>
        </h2>
        <div className={styles.paymentGrid}>
          <div className={`${styles.paymentCard} ${styles.reveal}`}>
            <div className={styles.paymentIcon}>&#63743;</div>
            <div className={styles.paymentName}>Apple Pay</div>
            <div className={styles.paymentBadge}>Supported</div>
          </div>
          <div className={`${styles.paymentCard} ${styles.reveal}`}>
            <div className={styles.paymentIcon}>G</div>
            <div className={styles.paymentName}>Google Pay</div>
            <div className={styles.paymentBadge}>Supported</div>
          </div>
          <div className={`${styles.paymentCard} ${styles.reveal}`}>
            <div className={styles.paymentIcon}>$</div>
            <div className={styles.paymentName}>Cash App Pay</div>
            <div className={styles.paymentBadge}>Supported</div>
          </div>
          <div className={`${styles.paymentCard} ${styles.reveal}`}>
            <div className={styles.paymentIcon}>&#128179;</div>
            <div className={styles.paymentName}>Debit / Credit</div>
            <div className={styles.paymentBadge}>Supported</div>
          </div>
        </div>
        <div className={`${styles.paymentNote} ${styles.reveal}`}>
          <strong>Secure payments.</strong> All payments processed through Stripe. Your card info never touches our servers.
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className={styles.testimonialSection}>
        <p className={styles.testimonialLabel}>What Riders Say</p>
        <div className={styles.marqueeWrap}>
          <div className={`${styles.marqueeTrack} ${styles.marqueeRow1}`}>
            {[...testimonials, ...testimonials].map((t, i) => (
              <div key={`t1-${i}`} className={styles.testimonialPill}>
                <span className={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</span>
                <span className={styles.testimonialAuthor}>&mdash; {t.author}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.marqueeWrap} style={{ marginTop: 12 }}>
          <div className={`${styles.marqueeTrack} ${styles.marqueeRow2}`}>
            {[...testimonials.slice(3), ...testimonials.slice(0, 3), ...testimonials.slice(3), ...testimonials.slice(0, 3)].map((t, i) => (
              <div key={`t2-${i}`} className={styles.testimonialPill}>
                <span className={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</span>
                <span className={styles.testimonialAuthor}>&mdash; {t.author}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={styles.ctaSection} id="signup">
        <p className={`${styles.ctaEyebrow} ${styles.reveal}`}>Ready to Save?</p>
        <h2 className={`${styles.ctaHeadline} ${styles.reveal}`}>
          Skip The Surge.<br /><span className={styles.blockGreen}>Ride For Less.</span>
        </h2>
        <p className={`${styles.ctaSub} ${styles.reveal}`}>
          Join 500+ riders on the waitlist.<br />
          Sign up free. No credit card required.
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
            {isSubmitting ? 'Setting you up...' : 'LOCK IN'}
          </button>
          <p className={styles.ctaFine}>Free to sign up. No credit card. Cancel anytime.</p>
        </form>
      </section>

      {/* FOOTER */}
      <Footer />
    </div>
  );
}
