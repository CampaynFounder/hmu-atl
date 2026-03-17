'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    setTimeout(() => router.push('/sign-up?type=driver'), 800);
  };

  return (
    <div className={styles.container}>
      {/* Noise overlay */}
      <div className={styles.noiseBg} />

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU ATL</Link>
        <Link href="/sign-up?type=driver" className={styles.navCta}>Lock In Free</Link>
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

      {/* HERO */}
      <section className={styles.hero}>
        <div className={`${styles.heroEyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0s' }}>
          For Driverpreneurs in Metro Atlanta
        </div>
        <h1 className={styles.heroHeadline}>
          <span className={`${styles.fadeUp} ${styles.lineGreen}`} style={{ display: 'block', animationDelay: '0s' }}>&lsquo;Payment Ready&rsquo;</span>
          <span className={`${styles.fadeUp}`} style={{ display: 'block', animationDelay: '0.1s' }}>Ride</span>
          <span className={`${styles.fadeUp} ${styles.lineDim}`} style={{ display: 'block', animationDelay: '0.2s' }}>Platform</span>
        </h1>
        <p className={`${styles.heroSub} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
          <strong>It&apos;s your ride. Your price.</strong> We Secure the Payment before you even pull up.
        </p>
        <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.4s' }}>
          <Link href="/sign-up?type=driver" className={styles.btnPrimary}>Lock In Now &mdash; It&rsquo;s Free</Link>
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
              <li className={styles.featureLocked}>Priority placement in driver feed</li>
              <li className={styles.featureLocked}>Instant payouts</li>
              <li className={styles.featureLocked}>Read rider comments</li>
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
          Sign Up Now<br /><span className={styles.blockGreen}>Try It Free</span>
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
            {isSubmitting ? 'Creating your account...' : 'Get \u2018Payment Ready\u2019 Riders \u2014 Free'}
          </button>
          <p className={styles.ctaFine}>Free to start. No credit card. Cancel anytime.</p>
        </form>
      </section>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <Link href="/" className={styles.footerLogo}>HMU ATL</Link>
        <div className={styles.footerLinks}>
          <Link href="/rider">Riders</Link>
          <a href="#how-we-pay">How We Pay</a>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
        </div>
      </footer>
    </div>
  );
}
