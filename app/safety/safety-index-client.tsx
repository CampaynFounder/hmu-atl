'use client';

import { motion } from 'framer-motion';
import { Shield, Car, User, ArrowRight } from 'lucide-react';
import { Footer } from '@/components/landing/footer';
import { EASE, FADE_UP, STAGGER } from './_components/motion';

const GREEN = '#00E676';
const BLUE = '#448AFF';

export function SafetyIndexClient() {
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
      <motion.div
        initial="hidden"
        animate="show"
        variants={STAGGER}
        style={{
          flex: 1,
          padding: '64px 20px 40px',
          maxWidth: 480,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <motion.div
          variants={FADE_UP}
          transition={{ duration: 0.55, ease: EASE }}
          style={{
            width: 80,
            height: 80,
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
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
              border: '2px solid rgba(255,255,255,0.18)',
            }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
          />
          <Shield size={36} color="#fff" strokeWidth={2.2} />
        </motion.div>

        <motion.div
          variants={FADE_UP}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            fontFamily: 'var(--font-mono, Space Mono, monospace)',
            fontSize: 11,
            letterSpacing: 4,
            color: '#888',
            textAlign: 'center',
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          HMU Safety
        </motion.div>

        <motion.h1
          variants={FADE_UP}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
            fontSize: 42,
            lineHeight: 1.05,
            textAlign: 'center',
            marginBottom: 16,
            letterSpacing: 0.5,
          }}
        >
          Pick your role.
        </motion.h1>

        <motion.p
          variants={FADE_UP}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            fontSize: 15.5,
            color: '#9ca3af',
            textAlign: 'center',
            maxWidth: 360,
            margin: '0 auto 36px',
            lineHeight: 1.6,
          }}
        >
          Safety on HMU works differently for drivers and riders. Pick your side to see exactly
          what we do for you.
        </motion.p>

        <motion.div
          variants={FADE_UP}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <RoleCard
            href="/safety/driver"
            color={GREEN}
            icon={<Car size={28} color={GREEN} strokeWidth={2.2} />}
            title="Drivers"
            sub="Deposits, no-show pay, women-rider matching, mid-ride check-ins."
          />
          <RoleCard
            href="/safety/rider"
            color={BLUE}
            icon={<User size={28} color={BLUE} strokeWidth={2.2} />}
            title="Riders"
            sub="Women-driver filter, deposit refunds, GPS, mid-ride check-ins, reporting."
          />
        </motion.div>
      </motion.div>

      <Footer />
    </div>
  );
}

function RoleCard({
  href,
  color,
  icon,
  title,
  sub,
}: {
  href: string;
  color: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 20,
        background: '#141414',
        border: `1px solid ${color}30`,
        borderRadius: 20,
        textDecoration: 'none',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.45 }}>{sub}</div>
      </div>
      <ArrowRight size={20} color={color} />
    </a>
  );
}
