'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/landing/footer';
import { SafetyHero } from '../../_components/safety-hero';
import { SectionCard } from '../../_components/section-card';
import { EASE, FADE_UP, STAGGER } from '../../_components/motion';
import { GenderFilterVisual } from '../../_components/visuals';

const GREEN = '#00E676';

export function SafetyWomenDriversClient() {
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
        accent={GREEN}
        eyebrow="HMU Driver Safety / Women"
        title="For women drivers."
        body="A few extra options built specifically for you. Plus every standard HMU safeguard every driver gets."
      />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 60px' }}>
        <SectionCard
          eyebrow="01 / Match Lock"
          color={GREEN}
          icon={<ShieldCheck size={22} color={GREEN} />}
          title="Match only with women riders."
          visual={<GenderFilterVisual accent={GREEN} />}
          body={
            <>
              Lock your feed to women riders only. Booking requests, the rider feed, and direct
              HMU links from male riders all stop matching with your account. Your decision, your
              car.
            </>
          }
          callout={
            <>
              <strong>Set when you sign up.</strong> To turn this on or off after signup, message
              support — in-app editing is coming soon.
            </>
          }
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
          same for every HMU driver.
        </p>
        <a
          href="/safety/driver"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 100,
            background: `${GREEN}22`,
            border: `1px solid ${GREEN}55`,
            color: GREEN,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          See full driver safety
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
        Ready to drive?
      </motion.h3>
      <motion.div variants={FADE_UP} transition={{ duration: 0.5, ease: EASE }}>
        <a
          href="/sign-up?type=driver"
          style={{
            display: 'inline-block',
            padding: '16px 48px',
            borderRadius: 100,
            background: GREEN,
            color: '#080808',
            fontWeight: 700,
            fontSize: 16,
            textDecoration: 'none',
          }}
        >
          Start Driving
        </a>
      </motion.div>
      <motion.p
        variants={FADE_UP}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 12.5, color: '#666', marginTop: 14 }}
      >
        Already a driver?{' '}
        <a href="/driver/home" style={{ color: GREEN, textDecoration: 'none' }}>
          Open dashboard
        </a>
      </motion.p>
    </motion.div>
  );
}
