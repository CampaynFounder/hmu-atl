'use client';

import { useEffect, useState } from 'react';
import { posthog } from '@/components/analytics/posthog-provider';
import type { RiderBrowseBannerConfig } from '@/lib/admin/rider-browse-banner';

interface Props {
  config: RiderBrowseBannerConfig;
  // Hide for already-converted drivers — the banner is a recruit pitch.
  hideForDriver?: boolean;
}

const DISMISS_KEY = 'hmu_browse_banner_dismissed';

/**
 * Top-of-/rider/browse driver recruit banner. Premium feel: rotating
 * conic-gradient laser outline + soft pulse glow. Whole surface is tappable.
 * Mobile-first (390px target) with desktop comfort up to ~640px width.
 *
 * - Skipped server-side when config.enabled === false (component never renders)
 * - Dismissible per session via sessionStorage so a returning rider doesn't
 *   see it five times an hour
 * - External http(s) URLs open in a new tab; internal paths stay in-tab
 */
export default function BrowseBanner({ config, hideForDriver = false }: Props) {
  const [dismissed, setDismissed] = useState(false);
  // Hydration guard — sessionStorage is unavailable during SSR; render
  // unconditionally on the server, then hide once we know it's dismissed.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch { /* storage disabled — banner stays visible */ }
    setHydrated(true);
  }, []);

  if (!config.enabled || hideForDriver) return null;
  if (hydrated && dismissed) return null;

  const isExternal = /^https?:\/\//i.test(config.cta_url);
  const linkProps = isExternal
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};

  const handleClick = () => {
    posthog.capture('browse_banner_cta_clicked', {
      ctaUrl: config.cta_url,
      headline: config.headline,
    });
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
    posthog.capture('browse_banner_dismissed');
  };

  return (
    <div style={{
      // Outer wrapper. The /rider/browse header already provides 20px
      // horizontal padding so we only need vertical breathing room here for
      // the laser glow to bloom without clipping the elements above/below.
      padding: '0 0 14px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <a
        href={config.cta_url}
        onClick={handleClick}
        {...linkProps}
        style={{
          // The animated conic gradient lives in `::before` (see <style/> below).
          // The visible surface is this anchor — it sits on top with a 2px
          // inset so the rotating gradient peeks out as a laser outline.
          position: 'relative',
          display: 'block',
          width: '100%',
          padding: 2,
          borderRadius: 18,
          textDecoration: 'none',
          color: 'inherit',
          // The animated outline is placed via a wrapper className so we can
          // keep the keyframes scoped to one <style> tag.
        }}
        className="hmu-browse-banner-anchor"
      >
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #141414 100%)',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          overflow: 'hidden',
        }}>
          {/* Subtle inner glow — pulses to draw the eye without movement noise */}
          <div
            aria-hidden
            className="hmu-browse-banner-pulse"
            style={{
              position: 'absolute',
              inset: -1,
              borderRadius: 16,
              pointerEvents: 'none',
            }}
          />

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            flex: 1,
          }}>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 22,
              lineHeight: 1.05,
              color: '#fff',
              letterSpacing: 0.5,
            }}>
              {config.headline}
            </div>
            {config.subhead && (
              <div style={{
                fontSize: 12,
                color: '#bbb',
                marginTop: 4,
                lineHeight: 1.4,
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}>
                {config.subhead}
              </div>
            )}
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 100,
            background: '#00E676',
            color: '#080808',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 0.3,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {config.cta_text}
            <span style={{ fontSize: 14 }}>→</span>
          </div>
        </div>

        {/* Dismiss × — small, sits in the top-right corner; does not steal the
            tap unless explicitly clicked. */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss banner"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: '#888',
            fontSize: 14,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          ×
        </button>
      </a>

      <style>{`
        .hmu-browse-banner-anchor {
          background: conic-gradient(
            from var(--angle, 0deg),
            #00E676 0%,
            #00B8D4 25%,
            #FFB300 50%,
            #00B8D4 75%,
            #00E676 100%
          );
          --angle: 0deg;
          animation: hmuBannerRotate 4s linear infinite;
        }
        .hmu-browse-banner-pulse {
          box-shadow:
            0 0 0 0 rgba(0,230,118,0.0),
            inset 0 0 24px 2px rgba(0,230,118,0.08);
          animation: hmuBannerPulse 2s ease-in-out infinite;
        }
        @keyframes hmuBannerRotate {
          0%   { --angle:   0deg; }
          100% { --angle: 360deg; }
        }
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes hmuBannerPulse {
          0%, 100% {
            box-shadow:
              0 0 18px 0 rgba(0,230,118,0.18),
              inset 0 0 24px 2px rgba(0,230,118,0.05);
          }
          50% {
            box-shadow:
              0 0 28px 4px rgba(0,230,118,0.32),
              inset 0 0 24px 2px rgba(0,230,118,0.10);
          }
        }
        /* Browsers without @property fall back to a static gradient — still
           premium-looking, just not rotating. */
        @supports not (background: conic-gradient(from 0deg, red, blue)) {
          .hmu-browse-banner-anchor {
            background: linear-gradient(135deg, #00E676, #00B8D4, #FFB300, #00E676);
            animation: none;
          }
        }
        /* Honor reduced-motion — kill the rotation + pulse; gradient stays. */
        @media (prefers-reduced-motion: reduce) {
          .hmu-browse-banner-anchor { animation: none; }
          .hmu-browse-banner-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
