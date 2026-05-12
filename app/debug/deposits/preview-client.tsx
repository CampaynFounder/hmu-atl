'use client';

import { useState } from 'react';
import { CountUp } from '@/components/shared/count-up';
import DepositsDetailSheet, { type BucketUnit } from '@/components/driver/deposits-detail-sheet';

// Public, unauthenticated preview of the Your Deposits detail sheet.
// Mirrors the mini tile in cashout-card.tsx — tap to open the overlay.
// Mock numbers so we don't depend on /api/driver/balance.
export default function DepositsPreviewClient() {
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<BucketUnit>('week');

  const mockTotal = 1358.0;
  const mockRides = 71;

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      padding: '32px 20px 80px',
      maxWidth: 480, margin: '0 auto',
    }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 2,
        marginBottom: 8,
      }}>
        Debug Preview &middot; Deposits Sheet
      </div>
      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 36, color: '#fff', lineHeight: 1, margin: '0 0 4px',
      }}>
        Your Deposits — Detail
      </h1>
      <p style={{ fontSize: 13, color: '#888', marginTop: 4, marginBottom: 28 }}>
        Tap the green tile below to open the sheet. Mock data — no backend.
      </p>

      {/* Mimic the cashout-card row layout so the tile reads in context. */}
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: 20,
      }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Available to cash out
        </div>
        <div style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 48, color: '#00E676', lineHeight: 1, marginBottom: 20,
        }}>
          <CountUp value={mockTotal} decimals={2} prefix="$" duration={1100} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Cash tile (static) */}
          <div style={{
            flex: 1, background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.15)',
            borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{
              fontSize: 10, color: '#FFC107', textTransform: 'uppercase', letterSpacing: 1,
              fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            }}>
              Your Cash
            </div>
            <div style={{
              fontSize: 20, fontWeight: 700, color: '#FFC107',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            }}>
              $312.40
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>18 rides</div>
          </div>

          {/* Deposits tile — tappable */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="View deposits detail"
            style={{
              flex: 1, background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.12)',
              borderRadius: 12, padding: '10px 12px',
              textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit', color: 'inherit',
              transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.985)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{
                fontSize: 10, color: '#00E676', textTransform: 'uppercase', letterSpacing: 1,
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
              }}>
                Your Deposits
              </div>
              <div style={{ fontSize: 10, color: '#00E676', opacity: 0.55 }} aria-hidden>{'›'}</div>
            </div>
            <div style={{
              fontSize: 20, fontWeight: 700, color: '#00E676',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            }}>
              <CountUp value={mockTotal} decimals={2} prefix="$" duration={900} />
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>
              {mockRides} rides &middot; tap for detail
            </div>
          </button>
        </div>
      </div>

      <div style={{
        marginTop: 24, padding: 14,
        background: 'rgba(255,179,0,0.05)', border: '1px solid rgba(255,179,0,0.18)',
        borderRadius: 12, fontSize: 12, color: '#FFB300', lineHeight: 1.5,
      }}>
        <strong style={{ display: 'block', marginBottom: 4 }}>Heads up</strong>
        Public preview at <code style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 6px', borderRadius: 4 }}>/debug/deposits</code>. Bake-in mock data; no auth, no API calls. Delete the route before prod ramp.
      </div>

      <DepositsDetailSheet
        open={open}
        onClose={() => setOpen(false)}
        totalDeposits={mockTotal}
        rides={mockRides}
        bucket={bucket}
        onBucketChange={setBucket}
        previewMode
      />
    </div>
  );
}
