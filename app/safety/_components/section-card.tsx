'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { EASE, FADE_UP, STAGGER } from './motion';

export function SectionCard({
  eyebrow,
  title,
  color,
  icon,
  body,
  callout,
  cta,
  visual,
}: {
  eyebrow: string;
  title: string;
  color: string;
  icon: ReactNode;
  body: ReactNode;
  callout?: ReactNode;
  cta?: { label: string; href: string };
  visual?: ReactNode;
}) {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      variants={STAGGER}
      style={{ marginBottom: 20 }}
    >
      <motion.div
        variants={FADE_UP}
        transition={{ duration: 0.55, ease: EASE }}
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20,
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {visual && (
          <div style={{ marginBottom: 18, marginTop: -4, marginLeft: -4, marginRight: -4 }}>
            {visual}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: `${color}1A`,
              border: `1px solid ${color}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, Space Mono, monospace)',
              fontSize: 10,
              letterSpacing: 2,
              color,
              textTransform: 'uppercase',
              lineHeight: 1.4,
            }}
          >
            {eyebrow}
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, lineHeight: 1.2 }}>
          {title}
        </h2>

        <div
          style={{
            fontSize: 14.5,
            color: '#cbd5e1',
            lineHeight: 1.65,
            marginBottom: callout || cta ? 14 : 0,
          }}
        >
          {body}
        </div>

        {callout && (
          <div
            style={{
              fontSize: 13.5,
              color: '#e2e8f0',
              lineHeight: 1.6,
              marginBottom: cta ? 14 : 0,
              background: `${color}10`,
              border: `1px solid ${color}25`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            {callout}
          </div>
        )}

        {cta && (
          <a
            href={cta.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 100,
              background: `${color}22`,
              border: `1px solid ${color}55`,
              color,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {cta.label}
            <ChevronRight size={16} />
          </a>
        )}
      </motion.div>
    </motion.section>
  );
}
