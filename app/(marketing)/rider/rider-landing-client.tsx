'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import { Footer } from '@/components/landing/footer';
import { CmsProvider, useCmsContext } from '@/lib/cms/provider';
import { useZone } from '@/lib/cms/use-zone';
import { useFlag } from '@/lib/cms/use-flag';
import type { ContentMap, FlagMap } from '@/lib/cms/types';
import { getDefaultSectionOrder } from '@/lib/cms/section-registry';
import styles from './rider.module.css';

export default function RiderLandingClient({ initialContent, initialFlags, sectionOrder, funnelStage }: { initialContent?: ContentMap; initialFlags?: FlagMap; sectionOrder?: string[]; funnelStage?: string }) {
  return (
    <CmsProvider initialContent={initialContent ?? {}} initialFlags={initialFlags} sectionOrder={sectionOrder} funnelStage={funnelStage}>
      <RiderLandingInner />
    </CmsProvider>
  );
}

function RiderLandingInner() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');

  // CMS zones
  const tickerItems = useZone<string[]>('ticker_items', ['Skip the Surge', 'Save Up to 60%', 'Escrow Protected', 'No Corporate Middleman', 'Real ATL Drivers']);
  const tickerSpeed = useZone('ticker_speed', '22');
  const heroEyebrow = useZone('hero_eyebrow', 'Peer-to-Peer Rides • Metro Atlanta');
  const heroLine1 = useZone('hero_headline_line1', 'STOP PAYING');
  const heroLine2 = useZone('hero_headline_line2', 'SURGE PRICES.');
  const heroSub = useZone('hero_subheadline', 'HMU connects you directly with local Atlanta drivers. <strong>Fair prices. Secured payments.</strong> No corporate cut inflating your fare.');
  const heroCtaPrimary = useZone('hero_cta_primary', 'SIGN UP FREE');
  const heroTrust = useZone('hero_trust_text', 'Drivers live in ATL right now — <strong>rides starting at $5</strong>');
  const painHeadline = useZone('pain_headline', 'TIRED OF THIS?');
  const riderPainCards = useZone<Array<{ title: string; body: string }>>('pain_cards', [
    { title: '$45 for a 20-minute ride', body: "Uber and Lyft jack up prices whenever they want. Surge pricing at 2am? That's your whole night's budget." },
    { title: 'Random driver every time', body: 'No relationship, no trust. Just a stranger with an app and a rating that means nothing.' },
    { title: 'Money gone before the ride starts', body: 'You get charged immediately. Driver cancels? Good luck getting that refund fast.' },
  ]);
  const howHeadline = useZone('how_headline', '<span style="color:var(--green)">How HMU</span><br />Works For<br />Riders');
  const howSub = useZone('how_subheadline', "Post what you need. Pick who you trust. Pay when it's real.");
  const howSteps = useZone<Array<{ num: string; title: string; body: string }>>('how_steps', [
    { num: '01', title: 'Post Your Ride', body: 'Drop your pickup, destination, and what you want to pay. Drivers in your area see it instantly.' },
    { num: '02', title: 'Browse Drivers', body: 'Swipe through available drivers. See their Chill Score, video intro, and reviews from real riders.' },
    { num: '03', title: 'Lock In & Pay', body: "Tap Pull Up to confirm. Your payment is held in escrow — driver doesn't get paid until you arrive safe." },
    { num: '04', title: 'Ride & Rate', body: 'Track your driver in real-time. Rate them after. Build the community you trust.' },
  ]);
  const pricingHeadline = useZone('pricing_headline', 'Real Routes.<br /><span style="color:var(--green)">Real Savings.</span>');
  const safetyHeadline = useZone('safety_headline', 'Your Safety.<br /><span style="color:var(--green)">Our Priority.</span>');
  const paymentHeadline = useZone('payment_headline', 'Pay <span style="color:var(--green)">Your Way</span>');
  const pricingRoutes = useZone<Array<{ route: string; hmu: string; uber: string; save: string }>>('pricing_routes', [
    { route: 'Buckhead → Airport', hmu: '$18', uber: '$45', save: 'Save 60%' },
    { route: 'Midtown → Downtown', hmu: '$8', uber: '$22', save: 'Save 64%' },
    { route: 'Decatur → Buckhead', hmu: '$15', uber: '$38', save: 'Save 61%' },
  ]);
  const safetyCards = useZone<Array<{ icon: string; title: string; body: string }>>('safety_cards', [
    { icon: '🔒', title: 'Escrow Protection', body: 'Your money is held until you arrive. If something goes wrong, you dispute — funds stay locked.' },
    { icon: '✌️', title: 'Chill Score', body: 'Every driver has a community rating. CHILL, Cool AF, or red flags — you see it all before you ride.' },
    { icon: '🎥', title: 'Video Intros', body: 'See your driver before you book. Real face, real person, no catfishing.' },
    { icon: '⏱', title: '45-Min Dispute Window', body: "After every ride, you have 45 minutes to flag anything. We hold the funds until it's resolved." },
  ]);
  const ogTitle = useZone('og_title', 'BECOME AN OG');
  const ogBody = useZone('og_body', 'Complete <strong>10 rides with zero disputes</strong> and unlock OG status. See driver comments. Get priority matching with top-rated drivers. You earned it.');
  const cmsTestimonials = useZone<Array<{ quote: string; author: string }>>('testimonials', [
    { quote: 'Saved $24 going to the airport. Never using Uber again.', author: 'Marcus, East Atlanta' },
    { quote: 'My driver was chill af. We actually had a real conversation.', author: 'Keya, Decatur' },
    { quote: 'The escrow thing is genius. I feel safe knowing my money is protected.', author: 'Darius, Buckhead' },
    { quote: "I matched with the same driver three times now. It's like having a homie with a car.", author: 'Nia, Midtown' },
    { quote: '$8 from Midtown to Downtown. Uber wanted $22. Do the math.', author: 'Jaylen, West End' },
    { quote: 'Video intros sold me. I knew who was pulling up before they got there.', author: 'Tasha, College Park' },
  ]);
  const ctaEyebrow = useZone('cta_eyebrow', 'Ready to Save?');
  const ctaHeadline = useZone('cta_headline', 'Skip The Surge. Ride For Less.');
  const ctaSub = useZone('cta_subheadline', 'Join 500+ riders on the waitlist. Sign up free. No credit card required.');
  const ctaButtonText = useZone('cta_button_text', 'LOCK IN');
  const ctaFinePrint = useZone('cta_fine_print', 'Free to sign up. No credit card. Cancel anytime.');
  const navCtaText = useZone('nav_cta_text', 'Lock In');

  // Feature flags
  const showPainSection = useFlag('rider_landing.pain_section', true);
  const showHowSection = useFlag('rider_landing.how_section', true);
  const showPricingSection = useFlag('rider_landing.pricing_section', true);
  const showSafetySection = useFlag('rider_landing.safety_section', true);
  const showOgSection = useFlag('rider_landing.og_section', true);
  const showTestimonials = useFlag('rider_landing.testimonials', true);
  const showCtaSection = useFlag('rider_landing.cta_section', true);

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
    const params = new URLSearchParams(window.location.search);
    const currentStage = params.get('utm_funnel') || 'awareness';
    const currentPersona = params.get('utm_persona') || null;

    try {
      posthog.capture('lead_captured', {
        lead_type: 'rider', funnel_stage: currentStage, persona: currentPersona, audience: 'rider',
        source: 'rider_landing', phone: phone ? 'provided' : 'empty', email: email ? 'provided' : 'empty',
      });
    } catch (_) {
      // posthog may not be initialized
    }

    // Store lead before redirecting
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
        funnel_stage: currentStage,
        persona: currentPersona,
        audience: 'rider',
      }),
    }).catch(() => {});

    const signUpParams = new URLSearchParams({ type: 'rider' });
    if (currentPersona) signUpParams.set('persona', currentPersona);
    if (currentStage !== 'awareness') signUpParams.set('funnel_stage', currentStage);
    setTimeout(() => router.push(`/sign-up?${signUpParams}`), 800);
  };

  const testimonials = cmsTestimonials;

  // Dynamic section ordering
  const { sectionOrder: ctxSectionOrder } = useCmsContext();
  const activeSections = new Set(
    ctxSectionOrder.length > 0 ? ctxSectionOrder : getDefaultSectionOrder('rider_landing')
  );
  const isActive = (key: string) => activeSections.has(key);

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
            {navCtaText}
          </Link>
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

      {/* HERO */}
      {isActive('hero') && (
      <section className={styles.hero}>
        <div className={`${styles.heroEyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0s' }}>
          {heroEyebrow}
        </div>
        <h1 className={styles.heroHeadline}>
          <span className={`${styles.fadeUp}`} style={{ display: 'block', animationDelay: '0s' }}>{heroLine1}</span>
          <span className={`${styles.fadeUp} ${styles.lineGreen}`} style={{ display: 'block', animationDelay: '0.1s' }}>{heroLine2}</span>
        </h1>
        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }} dangerouslySetInnerHTML={{ __html: heroSub }} />
        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <Link
            href="/sign-up?type=rider"
            className={styles.btnPrimary}
            onClick={() => { try { posthog.capture('rider_hero_cta_clicked'); } catch (_) {} }}
          >
            {heroCtaPrimary}
          </Link>
          <a href="#how-it-works" className={styles.btnGhost}>See how it works &darr;</a>
        </div>
        <div className={`${styles.heroTrust} ${styles.fadeUp}`} style={{ animationDelay: '0.5s' }}>
          <div className={styles.trustDot} />
          <p className={styles.trustText} dangerouslySetInnerHTML={{ __html: heroTrust }} />
        </div>
      </section>
      )}

      {/* PAIN POINTS */}
      {isActive('pain') && showPainSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>The Problem</p>
        <h2 className={`${styles.painHeadline} ${styles.reveal}`}>{painHeadline}</h2>
        <div className={styles.painCards}>
          {riderPainCards.map((card, i) => (
          <div key={i} className={`${styles.painCard} ${styles.reveal}`}>
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
      <section className={styles.section} id="how-it-works">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>How It Works</p>
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

      {/* PRICING COMPARISON */}
      {isActive('pricing') && showPricingSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`} id="pricing">
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Real Routes</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span dangerouslySetInnerHTML={{ __html: pricingHeadline }} />
        </h2>
        <div className={styles.pricingCards}>
          {pricingRoutes.map((route, i) => (
          <div key={i} className={`${styles.pricingCard} ${styles.reveal}`}>
            <div className={styles.pricingRoute}>{route.route}</div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>HMU</span>
              <span className={styles.pricingHmu}>{route.hmu}</span>
            </div>
            <div className={styles.pricingRow}>
              <span className={styles.pricingLabel}>Uber</span>
              <span className={styles.pricingUber}>{route.uber}</span>
            </div>
            <div className={styles.pricingSave}>{route.save}</div>
          </div>
          ))}
        </div>
      </section>
      )}

      {/* SAFETY & TRUST */}
      {isActive('safety') && showSafetySection && (
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Trust & Safety</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span dangerouslySetInnerHTML={{ __html: safetyHeadline }} />
        </h2>
        <div className={styles.safetyGrid}>
          {safetyCards.map((card, i) => (
          <div key={i} className={`${styles.safetyCard} ${styles.reveal}`}>
            <div className={styles.safetyIcon}>{card.icon}</div>
            <div className={styles.safetyTitle}>{card.title}</div>
            <div className={styles.safetyBody}>{card.body}</div>
          </div>
          ))}
        </div>
      </section>
      )}

      {/* OG STATUS */}
      {isActive('og_status') && showOgSection && (
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={`${styles.ogCard} ${styles.reveal}`}>
          <div className={styles.ogBadge}>OG Status</div>
          <h2 className={styles.ogTitle}>{ogTitle}</h2>
          <p className={styles.ogBody} dangerouslySetInnerHTML={{ __html: ogBody }} />
        </div>
      </section>
      )}

      {/* PAYMENT METHODS */}
      {isActive('payments') && (
      <section className={styles.section}>
        <p className={`${styles.sectionLabel} ${styles.reveal}`}>Payments</p>
        <h2 className={`${styles.sectionHeadline} ${styles.reveal}`}>
          <span dangerouslySetInnerHTML={{ __html: paymentHeadline }} />
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
      )}

      {/* TESTIMONIALS */}
      {isActive('testimonials') && (
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
      )}

      {/* FINAL CTA */}
      {isActive('cta') && showCtaSection && (
      <section className={styles.ctaSection} id="signup">
        <p className={`${styles.ctaEyebrow} ${styles.reveal}`}>{ctaEyebrow}</p>
        <h2 className={`${styles.ctaHeadline} ${styles.reveal}`}>
          Skip The Surge.<br /><span className={styles.blockGreen}>Ride For Less.</span>
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

      {/* FOOTER */}
      <Footer />
    </div>
  );
}
