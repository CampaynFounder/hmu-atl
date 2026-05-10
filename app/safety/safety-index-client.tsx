'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
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
          style={{ display: 'flex', flexDirection: 'row', gap: 12 }}
        >
          <RoleCard
            href="/safety/driver"
            color={GREEN}
            icon={<Car size={22} color={GREEN} strokeWidth={2.2} />}
            title="Drivers"
            sub="Deposits, GPS, mid-ride check-ins, women-rider matching."
            image="/safety/driver-hero1.jpg"
          />
          <RoleCard
            href="/safety/rider"
            color={BLUE}
            icon={<User size={22} color={BLUE} strokeWidth={2.2} />}
            title="Riders"
            sub="Women-driver filter, refunds, GPS, check-ins."
            image="/safety/rider-hero1.jpg"
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
  image,
}: {
  href: string;
  color: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  image: string;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ flex: 1, minWidth: 0 }}
    >
      <Link
        href={href}
        style={{
          position: 'relative',
          display: 'block',
          aspectRatio: '9 / 16',
          borderRadius: 20,
          overflow: 'hidden',
          border: `1px solid ${color}55`,
          textDecoration: 'none',
          color: '#fff',
        }}
      >
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 480px) 50vw, 220px"
          priority
          style={{ objectFit: 'cover' }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(8,8,8,0.45) 0%, rgba(8,8,8,0) 35%), ' +
              'linear-gradient(0deg, rgba(8,8,8,0.92) 0%, rgba(8,8,8,0.55) 35%, rgba(8,8,8,0) 60%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${color}28`,
            border: `1px solid ${color}60`,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            bottom: 14,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
                fontSize: 28,
                lineHeight: 1,
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: '#e2e8f0',
                lineHeight: 1.4,
              }}
            >
              {sub}
            </div>
          </div>
          <ArrowRight
            size={18}
            color={color}
            style={{ flexShrink: 0, marginBottom: 2 }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
