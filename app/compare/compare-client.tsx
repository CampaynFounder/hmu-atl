'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Footer } from '@/components/landing/footer';
import { CmsProvider } from '@/lib/cms/provider';
import { useZone } from '@/lib/cms/use-zone';
import type { ContentMap, FlagMap } from '@/lib/cms/types';
import type { CompareSnapshot } from '@/lib/payments/strategies/compare-snapshot';
import styles from './compare.module.css';

type GridColumn = { key: string; label: string };
type GridRow = {
  platform: string;
  tagline?: string;
  highlight?: boolean;
  derive?: string;
  cells?: Record<string, string>;
};
type MathItem = { label: string; value: string };
type Scenario = {
  platform: string;
  highlight?: boolean;
  derive?: string;
  rideTotal?: string;
  platformTake?: string;
  driverKeeps?: string;
  breakdown?: string;
};
type FaqItem = { q: string; a?: string; derive?: string };

// Replace {{exampleFare}} (and any future tokens) in admin-authored strings
// without overwriting HMU pricing numbers, which always come from the snapshot.
function interpolate(s: string | undefined, snapshot: CompareSnapshot): string {
  if (!s) return '';
  return s.replace(/\{\{exampleFare\}\}/g, snapshot.exampleFareLabel);
}

export default function ComparePageClient({
  initialContent = {},
  initialFlags = {},
  brandCity = 'Atlanta',
  brandCityShort = 'ATL',
  snapshot,
}: {
  initialContent?: ContentMap;
  initialFlags?: FlagMap;
  brandCity?: string;
  brandCityShort?: string;
  snapshot: CompareSnapshot;
}) {
  return (
    <CmsProvider initialContent={initialContent} initialFlags={initialFlags}>
      <ComparePageInner brandCity={brandCity} brandCityShort={brandCityShort} snapshot={snapshot} />
    </CmsProvider>
  );
}

function ComparePageInner({
  brandCity,
  brandCityShort,
  snapshot,
}: {
  brandCity: string;
  brandCityShort: string;
  snapshot: CompareSnapshot;
}) {
  // Hero
  const heroEyebrow = useZone('hero_eyebrow', 'Always Free. No 30-Day Trick.');
  const heroLine1 = useZone('hero_headline_line1', 'Other Apps Make Sure THEY Get Paid.');
  const heroLine2 = useZone('hero_headline_line2', 'HMU Makes Sure DRIVERS Get Paid.');
  const heroSub = useZone(
    'hero_subheadline',
    'We secure the deposit. You handle the rest in cash, Cash App, Apple Pay — whatever works. We were built to <strong>validate rider payments</strong>, not collect fees from your fares.',
  );
  const heroCtaLabel = useZone('hero_cta_label', 'Sign Up — Free Forever');
  const heroCtaHref = useZone('hero_cta_href', '/sign-up?type=driver');

  // Thesis
  const thesisLabel = useZone('thesis_label', 'Why HMU Exists');
  const thesisHeadline = useZone('thesis_headline', "We're Not Trying to Replace Uber.");
  const thesisParagraph = useZone(
    'thesis_paragraph',
    "Drivers don't need another platform for GPS. They don't need another middleman taking a cut of every fare. <strong>HMU was built for the Urban Driver-Preneur</strong> — the driver who has Cash App, Apple Pay, can collect their own cash, and may have several other ways to make money. We do the one thing rideshare apps were ever actually useful for: <strong>we validate that the rider can pay before you burn gas.</strong> That's it. The rest is yours.",
  );

  // Comparison grid
  const gridLabel = useZone('grid_label', 'The Math');
  const gridHeadline = useZone('grid_headline', 'Who Actually Takes Your Money');
  const gridSub = useZone(
    'grid_subheadline',
    'Compare what each platform charges drivers. Same ride, very different paychecks.',
  );
  const gridColumns = useZone<GridColumn[]>('grid_columns', [
    { key: 'feeShare', label: 'Cut of Your Fare' },
    { key: 'monthlyCost', label: 'Cost Per Month' },
    { key: 'joinCost', label: 'Cost to Join' },
    { key: 'cashAllowed', label: 'Off-Platform Cash' },
    { key: 'youKeepExample', label: 'You Keep On a {{exampleFare}} Ride' },
  ]);
  const gridRows = useZone<GridRow[]>('grid_rows', []);
  const gridFootnote = useZone('grid_footnote', '');

  // Membership callout
  const memLabel = useZone('membership_callout_label', 'Wait — Membership Apps Are Cheaper, Right?');
  const memHeadline = useZone('membership_callout_headline', '$25/day Isn’t “Low Monthly Fees.” It’s $750/month.');
  const memBody = useZone('membership_callout_body', '');
  const memMath = useZone<MathItem[]>('membership_callout_math', []);

  // Worked example
  const exLabel = useZone('example_label', 'On A {{exampleFare}} Ride');
  const exHeadline = useZone('example_headline', 'Same Ride. Different Paycheck.');
  const exScenarios = useZone<Scenario[]>('example_scenarios', []);

  // FAQ
  const faqLabel = useZone('faq_label', 'Honest Answers');
  const faqHeadline = useZone('faq_headline', 'What You’re Probably Wondering');
  const faqItems = useZone<FaqItem[]>('faq_items', []);

  // Final CTA
  const ctaEyebrow = useZone('cta_eyebrow', 'Ready to Run It?');
  const ctaHeadline = useZone('cta_headline', 'Stop Working For Middlemen.');
  const ctaSub = useZone('cta_subheadline', '');
  const ctaPrimaryLabel = useZone('cta_primary_label', 'Sign Up — Free Forever');
  const ctaPrimaryHref = useZone('cta_primary_href', '/sign-up?type=driver');
  const ctaSecondaryLabel = useZone('cta_secondary_label', 'How Deposits Work');
  const ctaSecondaryHref = useZone('cta_secondary_href', '/guide/driver');

  // Resolve cells per row: HMU row pulls from the live config snapshot.
  const resolveCells = (row: GridRow): Record<string, string> => {
    if (row.derive === 'hmu_deposit_only') {
      return snapshot.gridCells as unknown as Record<string, string>;
    }
    const cells = row.cells ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(cells)) {
      out[k] = interpolate(v, snapshot);
    }
    return out;
  };
  const resolveScenario = (s: Scenario): Required<Pick<Scenario, 'rideTotal' | 'platformTake' | 'driverKeeps' | 'breakdown'>> => {
    if (s.derive === 'hmu_deposit_only') return snapshot.scenario;
    return {
      rideTotal: interpolate(s.rideTotal, snapshot),
      platformTake: interpolate(s.platformTake, snapshot),
      driverKeeps: interpolate(s.driverKeeps, snapshot),
      breakdown: interpolate(s.breakdown, snapshot),
    };
  };
  const resolveFaqAnswer = (item: FaqItem): string => {
    if (item.derive === 'hmu_take_answer') return snapshot.hmuTakeAnswer;
    return item.a ?? '';
  };

  // Scroll reveal — copy of the production marketing pattern. Sections marked
  // with `.reveal` fade-and-rise once 8% in view; one-shot.
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
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.noiseBg} />

      {/* NAV (local — global header is suppressed for marketing pages) */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>HMU {brandCityShort}</Link>
        <div className={styles.navActions}>
          <Link href="/sign-in" className={styles.navSignIn}>Sign In</Link>
          <Link href={heroCtaHref} className={styles.navCta}>Sign Up</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={`${styles.heroEyebrow} ${styles.fadeUp}`}>
            {heroEyebrow}
          </div>
          <h1 className={`${styles.heroHeadline} ${styles.fadeUp}`} style={{ animationDelay: '0.1s' }}>
            <span className={styles.lineWhite}>{heroLine1}</span>
            <span className={styles.lineGreen}>{heroLine2}</span>
          </h1>
          <p
            className={`${styles.heroSub} ${styles.fadeUp}`}
            style={{ animationDelay: '0.2s' }}
            dangerouslySetInnerHTML={{ __html: heroSub }}
          />
          <div className={`${styles.heroCtaGroup} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
            <Link href={heroCtaHref} className={styles.btnPrimary}>{heroCtaLabel}</Link>
          </div>
        </div>
      </section>

      {/* THESIS */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={`${styles.sectionInnerNarrow} ${styles.reveal}`}>
          <div className={styles.sectionLabel}>{thesisLabel}</div>
          <h2 className={styles.sectionHeadline}>{thesisHeadline}</h2>
          <p className={styles.thesisBody} dangerouslySetInnerHTML={{ __html: thesisParagraph }} />
        </div>
      </section>

      {/* COMPARISON GRID */}
      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionInnerNarrow} ${styles.reveal} ${styles.centered}`}>
            <div className={`${styles.sectionLabel} ${styles.sectionLabelGreen}`}>{gridLabel}</div>
            <h2 className={styles.sectionHeadline}>{gridHeadline}</h2>
            <p className={styles.sectionSub}>{gridSub}</p>
          </div>

          <div className={`${styles.gridWrap} ${styles.reveal}`}>
            {/* Desktop table */}
            <div className={styles.gridTable}>
              <table>
                <thead>
                  <tr>
                    <th>Platform</th>
                    {gridColumns.map((col) => (
                      <th key={col.key}>{interpolate(col.label, snapshot)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((row, i) => {
                    const cells = resolveCells(row);
                    return (
                      <tr key={i} className={row.highlight ? styles.gridRowHighlight : ''}>
                        <td>
                          <div className={styles.gridPlatform}>{row.platform}</div>
                          {row.tagline && <div className={styles.gridTagline}>{row.tagline}</div>}
                        </td>
                        {gridColumns.map((col) => (
                          <td key={col.key} className={row.highlight ? styles.gridCellHighlight : ''}>
                            {cells[col.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className={styles.gridCards}>
              {gridRows.map((row, i) => {
                const cells = resolveCells(row);
                return (
                  <div
                    key={i}
                    className={`${styles.gridCard} ${row.highlight ? styles.gridCardHighlight : ''}`}
                  >
                    <div className={styles.gridCardPlatform}>{row.platform}</div>
                    {row.tagline && <div className={styles.gridCardTagline}>{row.tagline}</div>}
                    <div className={styles.gridCardRows}>
                      {gridColumns.map((col) => (
                        <div key={col.key} className={styles.gridCardRow}>
                          <span className={styles.gridCardRowLabel}>{interpolate(col.label, snapshot)}</span>
                          <span className={styles.gridCardRowValue}>{cells[col.key] ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {gridFootnote && (
              <div
                className={styles.gridFootnote}
                dangerouslySetInnerHTML={{ __html: gridFootnote }}
              />
            )}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP CALLOUT */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={`${styles.sectionInnerNarrow} ${styles.reveal} ${styles.centered}`}>
          <div className={styles.sectionLabel}>{memLabel}</div>
          <h2 className={styles.sectionHeadline}>{memHeadline}</h2>
          {memBody && (
            <div className={styles.memBody} dangerouslySetInnerHTML={{ __html: memBody }} />
          )}
        </div>
        {memMath.length > 0 && (
          <div className={`${styles.mathGrid} ${styles.reveal}`}>
            {memMath.map((item, i) => (
              <div
                key={i}
                className={`${styles.mathCard} ${item.value === '$0/mo' ? styles.mathCardHighlight : ''}`}
              >
                <div className={styles.mathLabel}>{item.label}</div>
                <div className={styles.mathValue}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WORKED EXAMPLE */}
      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionInnerNarrow} ${styles.reveal} ${styles.centered}`}>
            <div className={`${styles.sectionLabel} ${styles.sectionLabelGreen}`}>{interpolate(exLabel, snapshot)}</div>
            <h2 className={styles.sectionHeadline}>{exHeadline}</h2>
          </div>

          <div className={`${styles.scenarioGrid} ${styles.reveal}`}>
            {exScenarios.map((s, i) => {
              const r = resolveScenario(s);
              return (
                <div
                  key={i}
                  className={`${styles.scenarioCard} ${s.highlight ? styles.scenarioCardHighlight : ''}`}
                >
                  <div className={styles.scenarioPlatform}>{s.platform}</div>
                  <div className={styles.scenarioRideTotal}>Ride total {r.rideTotal}</div>

                  <div className={styles.scenarioReceipt}>
                    <div className={styles.scenarioReceiptRow}>
                      <span className={styles.scenarioReceiptLabel}>Platform takes</span>
                      <span className={styles.scenarioReceiptValue}>{r.platformTake}</span>
                    </div>
                    <div className={`${styles.scenarioReceiptRow} ${styles.scenarioKeepRow}`}>
                      <span className={styles.scenarioReceiptLabel}>Driver keeps</span>
                      <span className={styles.scenarioReceiptValue}>{r.driverKeeps}</span>
                    </div>
                  </div>

                  <div className={styles.scenarioBreakdown}>{r.breakdown}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionInnerNarrow} ${styles.reveal} ${styles.centered}`}>
            <div className={styles.sectionLabel}>{faqLabel}</div>
            <h2 className={styles.sectionHeadline}>{faqHeadline}</h2>
          </div>

          <div className={`${styles.faqList} ${styles.reveal}`} style={{ maxWidth: 760, margin: '32px auto 0' }}>
            {faqItems.map((item, i) => (
              <details key={i} className={styles.faqItem}>
                <summary className={styles.faqSummary}>
                  <span>{item.q}</span>
                  <span className={styles.faqIcon}>+</span>
                </summary>
                <div className={styles.faqAnswer}>{resolveFaqAnswer(item)}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={`${styles.finalCta} ${styles.reveal}`}>
        <div className={styles.finalCtaInner}>
          <div className={`${styles.sectionLabel} ${styles.sectionLabelGreen}`}>{ctaEyebrow}</div>
          <h2 className={styles.finalCtaHeadline}>{ctaHeadline}</h2>
          {ctaSub && <p className={styles.finalCtaSub}>{ctaSub}</p>}
          <div className={styles.finalCtaButtons}>
            <Link href={ctaPrimaryHref} className={styles.btnPrimary}>{ctaPrimaryLabel}</Link>
            <Link href={ctaSecondaryHref} className={styles.btnGhost}>{ctaSecondaryLabel}</Link>
          </div>
        </div>
      </section>

      <Footer brandCity={brandCity} />
    </div>
  );
}
