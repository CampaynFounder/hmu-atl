'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// Toggle [data-visible] on any element with [data-reveal] when it scrolls
// into view. CSS handles the actual animation. Single observer per page.
function useScrollReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (reduce) {
      els.forEach((el) => el.setAttribute('data-visible', 'true'));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-visible', 'true');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// Tick a number from 0 to `value` once when scrolled into view. Plain text
// node — preserves the typography of its parent. Honors reduced-motion.
function Counter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1400,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        obs.disconnect();
        if (reduce) {
          setN(value);
          return;
        }
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          setN(value * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}

interface Props {
  city: string;
  cityShort: string;
  marketSlug: string;
}

interface SubmittedState {
  name: string;
  email: string;
  eventName: string;
}

export function EventsPageClient({ city, cityShort, marketSlug }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

  useScrollReveal();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      role: String(fd.get('role') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim() || null,
      social_handle: String(fd.get('social_handle') || '').trim() || null,
      event_name: String(fd.get('event_name') || '').trim(),
      event_date: String(fd.get('event_date') || '').trim() || null,
      expected_attendance: String(fd.get('attendance') || '').trim(),
      notes: String(fd.get('notes') || '').trim() || null,
      market_slug: marketSlug,
    };

    if (!payload.name || !payload.role || !payload.email || !payload.event_name) {
      setError('Please fill in name, role, email, and event name.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/events/inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Submission failed (${res.status})`);
      }
      setSubmitted({
        name: payload.name,
        email: payload.email,
        eventName: payload.event_name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.wordmark}>
          HMU<span className={styles.market}>{cityShort}</span>
        </Link>
        <div className={styles.navMeta}>
          EVENT PARTNERSHIPS · <span className={styles.accent}>2026</span>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden="true">
          <video
            className={styles.heroVideo}
            src="/events-hero.mp4"
            poster="/events-hero-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <div className={styles.heroScrim} />
        </div>
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>For {cityShort} Event Organizers &amp; Venues</div>
          <h1 className={styles.heroTitle}>
            Surge pricing<br />
            is <span className={styles.strike}>killing</span>{' '}
            <span className={styles.accent}>your gate.</span>
          </h1>
          <p className={styles.heroSub}>
            When rideshare hits <strong>3.5×</strong> on event nights, your guests don&apos;t pay it — they stay home.
            Partner with HMU for <span className={styles.hl}>flat-rate round trips</span> that keep the floor packed and bar tabs longer.
          </p>
          <a href="#partner" className={styles.heroCta}>
            Become a Partner
            <span className={styles.heroCtaArrow}>→</span>
          </a>
        </div>
      </header>

      <div className={styles.problemSection}>
        <div className={styles.problemInner}>
          <div className={styles.sectionTag} data-reveal>▸ The Problem</div>
          <h2 className={styles.h2} data-reveal>
            The surge chain hurts everyone but the <span className={styles.danger}>rideshare app.</span>
          </h2>
          <p className={styles.lede} data-reveal>
            Every event night in {city}, the same thing happens. And it costs you real money.
          </p>

          <div className={styles.surgeChain} data-reveal>
            <div className={styles.chainStep}>
              <div className={styles.chainNum}>01 · Trigger</div>
              <div className={styles.chainAmount}>
                <Counter value={3.5} decimals={1} suffix="×" />
              </div>
              <div className={styles.chainLabel}>Surge Hits</div>
              <div className={styles.chainDesc}>
                A normal $15 Uber from Midtown becomes $52. Lyft mirrors within minutes.
              </div>
            </div>
            <div className={styles.chainStep}>
              <div className={styles.chainNum}>02 · Reaction</div>
              <div className={styles.chainAmount}>
                <Counter value={38} suffix="%" />
              </div>
              <div className={styles.chainLabel}>No-Shows Spike</div>
              <div className={styles.chainDesc}>
                Guests cancel, leave early, or pre-game harder at home to skip round-trip ride costs.
              </div>
            </div>
            <div className={styles.chainStep}>
              <div className={styles.chainNum}>03 · Impact</div>
              <div className={styles.chainAmount}>$$$</div>
              <div className={styles.chainLabel}>Revenue Gone</div>
              <div className={styles.chainDesc}>
                Lower headcount = fewer drinks, smaller tabs, weaker word-of-mouth, fewer returns.
              </div>
            </div>
          </div>

          <div className={styles.problemSummary} data-reveal>
            <strong>The math is brutal:</strong> a guest paying $100 round-trip on Uber instead of $25 round-trip is a guest with $75 less to spend at your bar — or a guest who doesn&apos;t show up at all.
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTag} data-reveal>▸ The Solution</div>
        <h2 className={styles.h2} data-reveal>
          Flat rates, <span className={styles.accent}>locked in</span> before doors open.
        </h2>

        <div className={styles.solutionGrid}>
          <div className={styles.solutionText} data-reveal>
            <h3 className={styles.solutionH3}>
              Your event.<br />
              <span className={styles.accent}>Our drivers.</span><br />
              One price.
            </h3>
            <p>
              HMU partners with vetted {cityShort} drivers who already know the city. We coordinate with you on event date, expected attendance, and key pickup zones — then publish a <strong>flat round-trip rate</strong> for your guests. No surge. No bait-and-switch.
            </p>
            <p>
              Promote it on your event page, your IG story, your ticket confirmation email. Guests <span className={styles.vocab}>HMU</span>, drivers <span className={styles.vocab}>Pull Up</span>, riders <span className={styles.vocab}>BET</span> — and everyone knows the price <strong>before they leave the house.</strong>
            </p>
          </div>

          <div className={styles.solutionVisual} data-reveal>
            <div className={styles.priceCompare}>
              <div className={styles.priceSurge}>
                <div className={styles.priceLabel}>Surge Night</div>
                <div className={styles.priceAmount}>
                  <Counter value={52} prefix="$" />
                </div>
                <div className={styles.priceNote}>Each way · variable</div>
              </div>
              <div className={styles.priceVs}>VS</div>
              <div className={styles.priceHmu}>
                <div className={styles.priceLabel}>HMU Flat</div>
                <div className={styles.priceAmount}>
                  <Counter value={25} prefix="$" />
                </div>
                <div className={styles.priceNote}>Round trip · locked</div>
              </div>
            </div>
            <div className={styles.priceCompare}>
              <div className={styles.priceSurge}>
                <div className={styles.priceLabel}>Surge Night</div>
                <div className={styles.priceAmount}>
                  <Counter value={104} prefix="$" />
                </div>
                <div className={styles.priceNote}>Round trip total</div>
              </div>
              <div className={styles.priceVs}>VS</div>
              <div className={styles.priceHmu}>
                <div className={styles.priceLabel}>HMU Total</div>
                <div className={styles.priceAmount}>
                  <Counter value={25} prefix="$" />
                </div>
                <div className={styles.priceNote}>All in</div>
              </div>
            </div>
            <div className={styles.savingsCallout}>
              <div className={styles.savingsBig}>
                <Counter value={79} prefix="$" duration={1700} />
              </div>
              <div className={styles.savingsSmall}>
                Back in your guest&apos;s pocket — and on your tab
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTight}`}>
        <div className={styles.sectionTag} data-reveal>▸ Why Partner</div>
        <h2 className={styles.h2} data-reveal>
          Built for {cityShort} events.<br />
          Built for <span className={styles.accent}>{cityShort} drivers.</span>
        </h2>

        <div className={styles.benefits} data-reveal>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>A · Headcount</div>
            <h4>Higher Attendance</h4>
            <p>When the round trip is $25 instead of $100, the &quot;should I even go?&quot; question disappears. Guests show up, and they bring friends.</p>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>B · Spend</div>
            <h4>Bigger Tabs</h4>
            <p>Money saved on rides becomes money spent at your bar, your merch table, your VIP upgrades. Average ticket goes up, not down.</p>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>C · Cost</div>
            <h4>Zero To You</h4>
            <p>No platform fee, no minimum spend, no exclusivity contracts. We make our margin on the rides — you get the marketing asset for free.</p>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>D · Trust</div>
            <h4>Vetted Locals</h4>
            <p>Every driver in our network is verified, {cityShort}-based, and rated. They know the venues, the parking quirks, the fastest routes home.</p>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>E · Promo</div>
            <h4>Co-Branded Assets</h4>
            <p>We design the flyer, the IG asset, the email blurb. You drop it into your existing event marketing — it ships looking like part of the show.</p>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitTag}>F · Data</div>
            <h4>Live Dashboard</h4>
            <p>See live ride volume, pickup hot zones, and guest origin points during your event. Plan next time&apos;s marketing spend with real data.</p>
          </div>
        </div>
      </section>

      <div className={styles.howSection}>
        <div className={styles.howInner}>
          <div className={styles.sectionTag} data-reveal>▸ How It Works</div>
          <h2 className={styles.h2} data-reveal>
            Four steps. <span className={styles.accent}>Two weeks.</span>
          </h2>

          <div className={styles.steps} data-reveal>
            <div className={styles.step}>
              <div className={styles.stepNum}>01</div>
              <h4>Submit Inquiry</h4>
              <p>Fill out the form below with your event date, venue, and expected headcount.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>02</div>
              <h4>We Scope Rate</h4>
              <p>Our team prices a round-trip flat rate based on pickup zones and driver availability.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>03</div>
              <h4>You Promote</h4>
              <p>We hand you co-branded assets. Drop the rate code in your ticket emails and social.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>04</div>
              <h4>Full House</h4>
              <p>Drivers stage up, guests ride flat-rate, you pull live stats from your dashboard.</p>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTag} data-reveal>▸ Pilot Impact</div>
        <h2 className={styles.h2} data-reveal>
          What happens when <span className={styles.accent}>guests show up.</span>
        </h2>
        <p className={styles.lede} data-reveal>
          Projected outcomes based on a typical 500-person {cityShort} event with HMU partnership vs. surge-only nights.
        </p>

        <div className={styles.impact} data-reveal>
          <div className={styles.impactStat}>
            <div className={styles.impactNum}>
              <Counter value={22} prefix="+" suffix="%" />
            </div>
            <div className={styles.impactLabel}>Attendance Lift</div>
          </div>
          <div className={styles.impactStat}>
            <div className={styles.impactNum}>
              <Counter value={31} prefix="+$" />
            </div>
            <div className={styles.impactLabel}>Avg Spend / Guest</div>
          </div>
          <div className={styles.impactStat}>
            <div className={styles.impactNum}>$0</div>
            <div className={styles.impactLabel}>Cost To Event</div>
          </div>
        </div>
      </section>

      <div className={styles.formSection} id="partner">
        <div className={styles.formInner} data-reveal>
          <div className={styles.formHeader}>
            <div className={styles.sectionTag}>▸ Partner Inquiry</div>
            <h2 className={styles.h2}>
              Let&apos;s talk about your<br />
              <span className={styles.accent}>next event.</span>
            </h2>
            <p>
              Tell us more about your upcoming event. We&apos;re happy to partner to make it a success.
            </p>
          </div>

          {submitted ? (
            <div className={styles.successWrap}>
              <div className={styles.successCheck}>✓</div>
              <h3 className={styles.successHead}>
                Thanks, {submitted.name.split(' ')[0]}.
              </h3>
              <p className={styles.successBody}>
                We&apos;ll reply to <strong>{submitted.email}</strong> within 48 hours with a proposal for{' '}
                <span className={styles.accent}>{submitted.eventName}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label htmlFor="name">Your Name</label>
                  <input type="text" id="name" name="name" required placeholder="Jane Smith" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="role">Role</label>
                  <select id="role" name="role" required defaultValue="">
                    <option value="" disabled>Select…</option>
                    <option>Event Organizer / Promoter</option>
                    <option>Venue Owner / Manager</option>
                    <option>Booking Agent</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label htmlFor="email">Email</label>
                  <input type="email" id="email" name="email" required placeholder="you@venue.com" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="phone">Phone (optional)</label>
                  <input type="tel" id="phone" name="phone" placeholder="(404) 555-0100" />
                </div>
              </div>

              <div className={`${styles.formRow} ${styles.formRowFull}`}>
                <div className={styles.field}>
                  <label htmlFor="social_handle">IG / TikTok / Social (optional)</label>
                  <input
                    type="text"
                    id="social_handle"
                    name="social_handle"
                    placeholder="@yourvenue or instagram.com/yourvenue"
                    maxLength={200}
                  />
                </div>
              </div>

              <div className={`${styles.formRow} ${styles.formRowFull}`}>
                <div className={styles.field}>
                  <label htmlFor="event_name">Event or Venue Name</label>
                  <input type="text" id="event_name" name="event_name" required placeholder={`Summer Block Party @ ${cityShort}`} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label htmlFor="event_date">Event Date</label>
                  <input type="date" id="event_date" name="event_date" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="attendance">Expected Attendance</label>
                  <select id="attendance" name="attendance" required defaultValue="">
                    <option value="" disabled>Select…</option>
                    <option>Under 250</option>
                    <option>250 – 500</option>
                    <option>500 – 1,000</option>
                    <option>1,000 – 2,500</option>
                    <option>2,500+</option>
                  </select>
                </div>
              </div>

              <div className={`${styles.formRow} ${styles.formRowFull}`}>
                <div className={styles.field}>
                  <label htmlFor="notes">Tell us more (venue address, recurring vs. one-off, etc.)</label>
                  <textarea id="notes" name="notes" placeholder="We host monthly at our Beltline location, expecting heavy Uber surge…" />
                </div>
              </div>

              <button type="submit" className={styles.formSubmit} disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit Inquiry →'}
              </button>
              {error && <div className={styles.formError}>{error}</div>}
              <div className={styles.formNote}>
                We reply within 48 hours · No spam · No commitments
              </div>
            </form>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <div>HMU <span className={styles.accent}>{cityShort}</span> · {city.toUpperCase()}</div>
        <div>EVENT PARTNERSHIPS · <span className={styles.accent}>2026</span></div>
      </footer>
    </div>
  );
}
