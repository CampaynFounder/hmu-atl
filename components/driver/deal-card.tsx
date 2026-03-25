'use client';

import { useState, useEffect, useRef } from 'react';

interface EnrollmentData {
  enrolled: boolean;
  status: 'active' | 'exhausted' | 'expired';
  ridesRemaining: number;
  ridesTotal: number;
  earningsRemaining: number;
  earningsTotal: number;
  daysRemaining: number;
  daysTotal: number;
  expiresAt: string;
  totalSaved: number;
}

export default function DealCard() {
  const [data, setData] = useState<EnrollmentData | null>(null);
  const [animatedValue, setAnimatedValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    fetch('/api/driver/enrollment')
      .then((r) => r.json())
      .then((d) => { if (d.enrolled) setData(d); })
      .catch(() => {});
  }, []);

  // Animate gauge on first render
  useEffect(() => {
    if (!data || hasAnimated.current) return;
    hasAnimated.current = true;

    const target = data.earningsTotal - data.earningsRemaining;
    const total = data.earningsTotal;
    const pct = total > 0 ? target / total : 0;

    // Overshoot animation: 0 → 100% → settle at actual
    let frame = 0;
    const totalFrames = 60;
    const overshootFrames = 40;

    const animate = () => {
      frame++;
      if (frame <= overshootFrames) {
        // Phase 1: fill to 100%
        const t = frame / overshootFrames;
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        setAnimatedValue(total * eased);
      } else if (frame <= totalFrames) {
        // Phase 2: settle back to actual
        const t = (frame - overshootFrames) / (totalFrames - overshootFrames);
        const eased = t * t * (3 - 2 * t); // smoothstep
        setAnimatedValue(total + (target - total) * eased);
      } else {
        setAnimatedValue(target);
        return;
      }
      requestAnimationFrame(animate);
    };

    // Small delay so the card is visible first
    setTimeout(() => requestAnimationFrame(animate), 300);
  }, [data]);

  if (!data || data.status !== 'active') return null;

  const earningsUsed = data.earningsTotal - data.earningsRemaining;
  const pct = data.earningsTotal > 0 ? (animatedValue / data.earningsTotal) * 100 : 0;
  const urgency = data.daysRemaining <= 7 ? 'urgent' : data.daysRemaining <= 14 ? 'warning' : 'normal';

  const gaugeColor = urgency === 'urgent' ? '#FF5252' : urgency === 'warning' ? '#FFB300' : '#00E676';
  const bgGlow = urgency === 'urgent'
    ? 'rgba(255,82,82,0.06)'
    : urgency === 'warning'
    ? 'rgba(255,179,0,0.06)'
    : 'rgba(0,230,118,0.06)';

  return (
    <>
      <style>{`
        .deal-card {
          background: linear-gradient(135deg, ${bgGlow}, rgba(0,230,118,0.02));
          border: 1px solid rgba(0,230,118,0.15);
          border-radius: 20px;
          padding: 24px 20px;
          margin-bottom: 20px;
          position: relative;
          overflow: hidden;
        }
        .deal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .deal-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(0,230,118,0.12);
          color: #00E676;
          font-size: 10px;
          font-weight: 800;
          padding: 5px 12px;
          border-radius: 100px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: var(--font-mono, 'Space Mono', monospace);
        }
        .deal-countdown {
          font-family: var(--font-mono, 'Space Mono', monospace);
          font-size: 12px;
          font-weight: 700;
          color: ${gaugeColor};
        }
        .deal-amount {
          font-family: var(--font-display, 'Bebas Neue', sans-serif);
          font-size: 44px;
          line-height: 1;
          color: #fff;
          margin-bottom: 2px;
        }
        .deal-amount-sub {
          font-size: 13px;
          color: #888;
          margin-bottom: 20px;
        }
        .deal-gauge-track {
          height: 8px;
          background: rgba(255,255,255,0.06);
          border-radius: 100px;
          overflow: hidden;
          margin-bottom: 12px;
          position: relative;
        }
        .deal-gauge-fill {
          height: 100%;
          border-radius: 100px;
          background: ${gaugeColor};
          transition: width 0.05s linear;
          box-shadow: 0 0 12px ${gaugeColor}40;
        }
        .deal-stats {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .deal-stat {
          flex: 1;
          text-align: center;
          padding: 10px 8px;
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .deal-stat-value {
          font-family: var(--font-display, 'Bebas Neue', sans-serif);
          font-size: 22px;
          color: #fff;
          line-height: 1;
          margin-bottom: 2px;
        }
        .deal-stat-label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .deal-saved {
          text-align: center;
          margin-top: 14px;
          font-size: 12px;
          color: #00E676;
          font-weight: 600;
        }
      `}</style>

      <div className="deal-card">
        <div className="deal-header">
          <div className="deal-badge">{'\u26A1'} Launch Offer</div>
          <div className="deal-countdown">{data.daysRemaining}d left</div>
        </div>

        <div className="deal-amount">
          ${data.earningsRemaining.toFixed(0)}
        </div>
        <div className="deal-amount-sub">
          fee-free remaining of ${data.earningsTotal.toFixed(0)}
        </div>

        {/* Gauge */}
        <div className="deal-gauge-track">
          <div className="deal-gauge-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>

        {/* Stats row */}
        <div className="deal-stats">
          <div className="deal-stat">
            <div className="deal-stat-value">{data.ridesRemaining}</div>
            <div className="deal-stat-label">Rides left</div>
          </div>
          <div className="deal-stat">
            <div className="deal-stat-value">${earningsUsed.toFixed(0)}</div>
            <div className="deal-stat-label">Earned</div>
          </div>
          <div className="deal-stat">
            <div className="deal-stat-value">{data.daysRemaining}d</div>
            <div className="deal-stat-label">Remaining</div>
          </div>
        </div>

        {data.totalSaved > 0 && (
          <div className="deal-saved">
            You&apos;ve saved ${data.totalSaved.toFixed(2)} in platform fees
          </div>
        )}
      </div>
    </>
  );
}
