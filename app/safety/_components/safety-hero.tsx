'use client';

import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { EASE, FADE_UP, STAGGER } from './motion';

export function SafetyHero({
  eyebrow,
  title,
  body,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: ReactNode;
  accent: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={STAGGER}
      style={{
        padding: '64px 20px 44px',
        textAlign: 'center',
        background: `linear-gradient(180deg, ${accent}14 0%, transparent 100%)`,
      }}
    >
      <motion.div
        variants={FADE_UP}
        transition={{ duration: 0.6, ease: EASE }}
        style={{
          width: 84,
          height: 84,
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: `${accent}1A`,
          border: `2px solid ${accent}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <motion.span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            border: `2px solid ${accent}`,
          }}
          animate={{ scale: [1, 1.45, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
        />
        <Shield size={38} color={accent} strokeWidth={2.2} />
      </motion.div>

      <motion.div
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          fontFamily: 'var(--font-mono, Space Mono, monospace)',
          fontSize: 11,
          letterSpacing: 4,
          color: accent,
          marginBottom: 12,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </motion.div>

      <motion.h1
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: 42,
          lineHeight: 1.05,
          marginBottom: 14,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </motion.h1>

      <motion.p
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          fontSize: 15.5,
          color: '#9ca3af',
          maxWidth: 360,
          margin: '0 auto',
          lineHeight: 1.6,
        }}
      >
        {body}
      </motion.p>
    </motion.div>
  );
}
