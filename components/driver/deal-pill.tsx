'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PillData {
  enrolled: boolean;
  status: string;
  earningsRemaining: number;
  earningsTotal: number;
  daysRemaining: number;
  totalSaved: number;
}

export default function DealPill() {
  const [data, setData] = useState<PillData | null>(null);

  useEffect(() => {
    fetch('/api/driver/enrollment')
      .then((r) => r.json())
      .then((d) => { if (d.enrolled && d.status === 'active') setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const urgency = data.daysRemaining <= 7 ? 'urgent' : data.daysRemaining <= 14 ? 'warning' : 'normal';
  const dotColor = urgency === 'urgent' ? '#FF5252' : urgency === 'warning' ? '#FFB300' : '#00E676';

  return (
    <Link
      href="/driver/home"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'rgba(0,230,118,0.06)',
        border: '1px solid rgba(0,230,118,0.12)',
        borderRadius: 100,
        textDecoration: 'none',
        marginBottom: 16,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor,
        boxShadow: `0 0 8px ${dotColor}60`,
        animation: urgency === 'urgent' ? 'pillPulse 1.5s ease-in-out infinite' : undefined,
      }} />
      <span style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 11,
        fontWeight: 700,
        color: '#00E676',
        letterSpacing: 0.5,
      }}>
        ${data.earningsRemaining.toFixed(0)} fee-free
      </span>
      <span style={{ fontSize: 10, color: '#555' }}>·</span>
      <span style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 11,
        color: urgency === 'urgent' ? '#FF5252' : urgency === 'warning' ? '#FFB300' : '#888',
        fontWeight: urgency !== 'normal' ? 700 : 400,
      }}>
        {data.daysRemaining}d left
      </span>
      <style>{`@keyframes pillPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </Link>
  );
}
