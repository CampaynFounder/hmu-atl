// Shared driver/rider ride-money breakdown card.
//
// Extracted verbatim from app/ride/[id]/active-ride-client.tsx so the
// post-ride detail screen AND the My Rides list render the SAME canonical,
// money-conserving rows (from computeRideBreakdown → strategy.buildBreakdownRows).
// One renderer = no drift between "what you earned" on two screens.
//
// Roles drive styling: 'amount' (white) · 'muted' (gray context) ·
// 'fee' (orange, −$ prefix) · 'total' (bold, divider above).

import type { BreakdownRow } from '@/lib/payments/breakdown';

const COLORS = {
  card: '#141414',
  gray: '#888888',
  grayLight: '#AAAAAA',
  red: '#FF5252',
  orange: '#FF9100',
};
const FONTS = {
  display: "'Bebas Neue', sans-serif",
  mono: "'Space Mono', monospace",
};

export function BreakdownCard({
  rows,
  audience = 'driver',
  extrasFailed,
}: {
  rows: BreakdownRow[];
  audience?: 'driver' | 'rider';
  extrasFailed: number;
}) {
  const visible = rows;
  const heading = audience === 'driver' ? 'WHAT YOU EARNED' : 'WHAT YOU PAID';

  return (
    <div style={{
      backgroundColor: COLORS.card,
      borderRadius: 16,
      padding: '16px',
    }}>
      <div style={{
        fontSize: 11,
        color: COLORS.grayLight,
        letterSpacing: 1,
        marginBottom: 12,
        fontFamily: FONTS.display,
      }}>
        {heading}
      </div>

      {visible.map((row, idx) => {
        const isTotal = row.role === 'total';
        const isMuted = row.role === 'muted';
        const isFee = row.role === 'fee';
        // Divider before the total row, and before the first fee row.
        const prevRole = idx > 0 ? visible[idx - 1].role : null;
        const showDivider = (isTotal && prevRole !== 'total') ||
          (isFee && prevRole !== 'fee' && prevRole !== null);

        return (
          <div key={`${row.label}-${idx}`}>
            {showDivider && (
              <div style={{
                height: 1,
                background: 'rgba(255,255,255,0.08)',
                margin: '10px 0',
              }} />
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: isTotal ? '6px 0' : '5px 0',
            }}>
              <span style={{
                fontSize: isTotal ? 15 : 13,
                color: isMuted ? COLORS.gray : isFee ? COLORS.orange : COLORS.grayLight,
                fontWeight: isTotal ? 600 : 400,
              }}>
                {row.label}
              </span>
              <span style={{
                fontFamily: FONTS.mono,
                fontSize: isTotal ? 18 : 14,
                color: isMuted ? COLORS.gray : isFee ? COLORS.orange : '#fff',
                fontWeight: isTotal ? 700 : 500,
              }}>
                {isFee ? `−$${Number(row.value || 0).toFixed(2)}` : `$${Number(row.value || 0).toFixed(2)}`}
              </span>
            </div>
          </div>
        );
      })}

      {extrasFailed > 0 && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: 'rgba(244,67,54,0.10)',
          border: '1px solid rgba(244,67,54,0.30)',
          borderRadius: 8,
          fontSize: 12,
          color: COLORS.red,
        }}>
          {extrasFailed} extra{extrasFailed === 1 ? '' : 's'} failed to charge — not included in total
        </div>
      )}
    </div>
  );
}
