'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/landing/footer';
import { SafetyHero } from '../../_components/safety-hero';
import { SectionCard } from '../../_components/section-card';
import { EASE, FADE_UP, STAGGER } from '../../_components/motion';
import { GenderFilterVisual } from '../../_components/visuals';

const BLUE = '#448AFF';

export function SafetyWomenRidersClient() {
  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: 'var(--font-body, DM Sans, sans-serif)',
      }}
    >
      <SafetyHero
        accent={BLUE}
        eyebrow="HMU Rider Safety / Women"
        title="For women riders."
        body="A few extra options built specifically for you. Plus every standard HMU safeguard every rider gets."
      />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 60px' }}>
        <SectionCard
          eyebrow="01 / Match Lock"
          color={BLUE}
          icon={<ShieldCheck size={22} color={BLUE} />}
          title="Browse women drivers only."
          visual={<GenderFilterVisual accent={BLUE} />}
          body={
            <>
              One tap on the rider browse page filters every result to verified women drivers for
              the whole session. Booking, profiles, the live feed — all locked to women drivers
              until you turn it off.
            </>
          }
          callout={
            <>
              <strong>Save it as your default.</strong> You can save your driver-gender preference
              when you sign up so every search starts pre-filtered. To change later, ping
              support — in-app editing is coming soon.
            </>
          }
          cta={{ label: 'Browse women drivers', href: '/rider/browse?gender=female' }}
        />

        <BackToFull />
        <CTA />
      </div>

      <Footer />
    </div>
  );
}

function BackToFull() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={STAGGER}
      style={{ marginBottom: 32 }}
    >
      <motion.div
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          background: '#141414',
          border: '1px dashed rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: 18,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 14,
            color: '#cbd5e1',
            margin: 0,
            marginBottom: 12,
            lineHeight: 1.55,
          }}
        >
          Everything else — deposits, GPS, mid-ride check-ins, reporting and banning — works the
          same for every HMU rider.
        </p>
        <a
          href="/safety/rider"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 100,
            background: `${BLUE}22`,
            border: `1px solid ${BLUE}55`,
            color: BLUE,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          See full rider safety
        </a>
      </motion.div>
    </motion.section>
  );
}

function CTA() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={STAGGER}
      style={{ textAlign: 'center', marginTop: 12 }}
    >
      <motion.h3
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          fontSize: 30,
          lineHeight: 1.1,
          marginBottom: 16,
          letterSpacing: 0.5,
        }}
      >
        Ready to ride?
      </motion.h3>
      <motion.div variants={FADE_UP} transition={{ duration: 0.5, ease: EASE }}>
        <a
          href="/rider/browse?gender=female"
          style={{
            display: 'inline-block',
            padding: '16px 48px',
            borderRadius: 100,
            background: BLUE,
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            textDecoration: 'none',
          }}
        >
          Find a Driver
        </a>
      </motion.div>
      <motion.p
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 12.5, color: '#666', marginTop: 14 }}
      >
        New to HMU?{' '}
        <a href="/sign-up?type=rider" style={{ color: BLUE, textDecoration: 'none' }}>
          Sign up
        </a>
      </motion.p>
    </motion.div>
  );
}
