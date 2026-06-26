import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/landing/footer';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { getFaq } from '@/lib/marketing/faq';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const canonical = `https://${brand.host}/faq`;
  const description =
    'Answers about HMU Cash Ride: upfront driver pay, real-time in-ride GPS tracking for safety, blasting a request to all nearby drivers, Down Bad rides during hard times, cash deliveries, driver earnings, and where HMU is available.';
  return {
    title: 'HMU Cash Ride FAQ — Safety, Earnings, Blast, Deliveries',
    description,
    alternates: { canonical },
    openGraph: {
      title: 'HMU Cash Ride FAQ',
      description,
      url: canonical,
      siteName: 'HMUCASHRIDE',
      locale: 'en_US',
      type: 'website',
      images: [{ url: brand.ogImage, width: 1200, height: 630, alt: 'HMU Cash Ride FAQ' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'HMU Cash Ride FAQ',
      description,
      images: [brand.ogImage],
    },
  };
}

export default async function FaqPage() {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const faq = getFaq(brand.city);

  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: 'var(--font-body, DM Sans, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main
        style={{
          flex: 1,
          padding: '64px 20px 48px',
          maxWidth: 760,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono, Space Mono, monospace)',
            fontSize: 11,
            letterSpacing: 4,
            color: '#888',
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          HMU {brand.cityShort} · FAQ
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
            fontSize: 48,
            lineHeight: 1.04,
            margin: '0 0 16px',
          }}
        >
          Frequently Asked Questions
        </h1>

        <p style={{ color: '#bbb', fontSize: 16, lineHeight: 1.6, margin: '0 0 36px', maxWidth: 620 }}>
          Everything you need to know about getting paid upfront, riding safely with real-time GPS
          tracking, blasting a request to all nearby drivers, Down Bad rides, and cash deliveries on{' '}
          {brand.city}&rsquo;s fastest-growing cash ride and delivery platform.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {faq.map((item) => (
            <details
              key={item.q}
              style={{
                background: '#141414',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: '18px 20px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  fontSize: 17,
                  fontWeight: 600,
                  color: '#fff',
                }}
              >
                {item.q}
              </summary>
              <p style={{ color: '#bbb', fontSize: 15, lineHeight: 1.65, margin: '12px 0 0' }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Link
            href="/rider"
            style={{
              background: '#00E676',
              color: '#080808',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 24px',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            Get a ride
          </Link>
          <Link
            href="/driver"
            style={{
              background: 'transparent',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 24px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.16)',
              textDecoration: 'none',
            }}
          >
            Drive &amp; earn $150+
          </Link>
        </div>
      </main>

      <Footer brandCity={brand.cityShort} />
    </div>
  );
}
