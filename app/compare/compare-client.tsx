'use client';

import Link from 'next/link';
import { Footer } from '@/components/landing/footer';
import { CmsProvider } from '@/lib/cms/provider';
import { useZone } from '@/lib/cms/use-zone';
import type { ContentMap, FlagMap } from '@/lib/cms/types';
import type { CompareSnapshot } from '@/lib/payments/strategies/compare-snapshot';

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
    if (s.derive === 'hmu_deposit_only') {
      return snapshot.scenario;
    }
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

  return (
    <div className="bg-[#080808] text-white min-h-screen" style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      {/* Local nav (marketing pages skip the global header) */}
      <nav className="sticky top-0 z-40 bg-[#080808]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-white text-[22px] tracking-wide" style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}>
            HMU {brandCityShort}
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm text-zinc-300 hover:text-white">Sign In</Link>
            <Link
              href={heroCtaHref}
              className="text-sm font-semibold text-black bg-[#00E676] hover:bg-[#00C864] px-4 py-2 rounded-lg transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block px-4 py-2 mb-6 rounded-full border border-[#00E676]/30 bg-[#00E676]/5 text-[#00E676] text-xs uppercase tracking-[0.2em]">
            {heroEyebrow}
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: '0.5px' }}
          >
            <span className="block text-white">{heroLine1}</span>
            <span className="block text-[#00E676] mt-2">{heroLine2}</span>
          </h1>
          <p
            className="text-lg sm:text-xl text-zinc-300 max-w-3xl mx-auto mb-8 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: heroSub }}
          />
          <Link
            href={heroCtaHref}
            className="inline-block bg-[#00E676] hover:bg-[#00C864] text-black font-bold px-8 py-4 rounded-xl text-base transition-colors"
          >
            {heroCtaLabel}
          </Link>
        </div>
      </section>

      {/* THESIS */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5 bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-4">{thesisLabel}</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6" style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}>
            {thesisHeadline}
          </h2>
          <p
            className="text-base sm:text-lg text-zinc-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: thesisParagraph }}
          />
        </div>
      </section>

      {/* COMPARISON GRID */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#00E676] mb-4">{gridLabel}</div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}>
              {gridHeadline}
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">{gridSub}</p>
          </div>

          {/* Desktop: table; Mobile: stacked cards */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="text-left text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-6 py-4">Platform</th>
                  {gridColumns.map((col) => (
                    <th key={col.key} className="text-left text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-6 py-4">
                      {interpolate(col.label, snapshot)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridRows.map((row, i) => {
                  const cells = resolveCells(row);
                  return (
                    <tr
                      key={i}
                      className={`border-t border-white/5 ${row.highlight ? 'bg-[#00E676]/[0.06]' : ''}`}
                    >
                      <td className="px-6 py-5">
                        <div className={`text-base font-bold ${row.highlight ? 'text-[#00E676]' : 'text-white'}`}>
                          {row.platform}
                        </div>
                        {row.tagline && (
                          <div className="text-xs text-zinc-500 mt-1">{row.tagline}</div>
                        )}
                      </td>
                      {gridColumns.map((col) => (
                        <td key={col.key} className="px-6 py-5 text-sm text-zinc-300">
                          {cells[col.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {gridRows.map((row, i) => {
              const cells = resolveCells(row);
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 ${row.highlight ? 'border-[#00E676]/40 bg-[#00E676]/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}
                >
                  <div className={`text-lg font-bold mb-1 ${row.highlight ? 'text-[#00E676]' : 'text-white'}`}>
                    {row.platform}
                  </div>
                  {row.tagline && (
                    <div className="text-xs text-zinc-500 mb-4">{row.tagline}</div>
                  )}
                  <dl className="space-y-2">
                    {gridColumns.map((col) => (
                      <div key={col.key} className="flex justify-between gap-4 text-sm">
                        <dt className="text-zinc-500">{interpolate(col.label, snapshot)}</dt>
                        <dd className="text-zinc-200 text-right">{cells[col.key] ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>

          {gridFootnote && (
            <div
              className="mt-6 text-zinc-500 text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: gridFootnote }}
            />
          )}
        </div>
      </section>

      {/* MEMBERSHIP CALLOUT */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5 bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-4 text-center">{memLabel}</div>
          <h2
            className="text-3xl sm:text-4xl font-bold text-center mb-6"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
          >
            {memHeadline}
          </h2>
          {memBody && (
            <div
              className="text-base sm:text-lg text-zinc-300 leading-relaxed text-center max-w-2xl mx-auto mb-10"
              dangerouslySetInnerHTML={{ __html: memBody }}
            />
          )}
          {memMath.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {memMath.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 sm:p-5 text-center ${
                    item.value === '$0/mo'
                      ? 'border-[#00E676]/40 bg-[#00E676]/[0.08]'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-2">{item.label}</div>
                  <div
                    className={`text-2xl sm:text-3xl font-bold ${item.value === '$0/mo' ? 'text-[#00E676]' : 'text-white'}`}
                    style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* WORKED EXAMPLE */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#00E676] mb-4">{interpolate(exLabel, snapshot)}</div>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
            >
              {exHeadline}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {exScenarios.map((s, i) => {
              const r = resolveScenario(s);
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-6 ${
                    s.highlight ? 'border-[#00E676]/40 bg-[#00E676]/[0.06]' : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className={`text-sm font-bold mb-1 ${s.highlight ? 'text-[#00E676]' : 'text-white'}`}>
                    {s.platform}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-4">Ride total {r.rideTotal}</div>

                  <dl className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm">
                      <dt className="text-zinc-500">Platform takes</dt>
                      <dd className="text-zinc-200 font-semibold">{r.platformTake}</dd>
                    </div>
                    <div className="flex justify-between text-sm">
                      <dt className="text-zinc-500">Driver keeps</dt>
                      <dd
                        className={`font-semibold ${s.highlight ? 'text-[#00E676]' : 'text-white'}`}
                        style={{ fontFamily: s.highlight ? "var(--font-display, 'Bebas Neue', sans-serif)" : undefined, fontSize: s.highlight ? '20px' : undefined }}
                      >
                        {r.driverKeeps}
                      </dd>
                    </div>
                  </dl>

                  <div className="text-xs text-zinc-400 leading-relaxed border-t border-white/5 pt-3">
                    {r.breakdown}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5 bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-4">{faqLabel}</div>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
            >
              {faqHeadline}
            </h2>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-white/10 bg-white/[0.02] open:bg-white/[0.04] transition-colors"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-white">
                  <span>{item.q}</span>
                  <span className="text-[#00E676] text-xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-5 pb-5 text-sm text-zinc-300 leading-relaxed">
                  {resolveFaqAnswer(item)}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-4 sm:px-6 lg:px-8 py-24 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00E676] mb-4">{ctaEyebrow}</div>
          <h2
            className="text-4xl sm:text-5xl font-bold mb-5"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)" }}
          >
            {ctaHeadline}
          </h2>
          {ctaSub && (
            <p className="text-base sm:text-lg text-zinc-300 leading-relaxed mb-8">
              {ctaSub}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href={ctaPrimaryHref}
              className="w-full sm:w-auto bg-[#00E676] hover:bg-[#00C864] text-black font-bold px-8 py-4 rounded-xl text-base transition-colors"
            >
              {ctaPrimaryLabel}
            </Link>
            <Link
              href={ctaSecondaryHref}
              className="w-full sm:w-auto border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors"
            >
              {ctaSecondaryLabel}
            </Link>
          </div>
        </div>
      </section>

      <Footer brandCity={brandCity} />
    </div>
  );
}
