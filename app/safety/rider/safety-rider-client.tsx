'use client';

import { motion } from 'framer-motion';
import { Lock, MapPin, BellRing, Flag, Search } from 'lucide-react';
import { Footer } from '@/components/landing/footer';
import { SafetyHero } from '../_components/safety-hero';
import { SectionCard } from '../_components/section-card';
import { EASE, FADE_UP, STAGGER } from '../_components/motion';
import {
  CheckInVisual,
  DepositLockVisual,
  DriverPreviewVisual,
  GPSVisual,
  ReportVisual,
} from '../_components/visuals';

const BLUE = '#448AFF';
const GREEN = '#00E676';
const AMBER = '#FFB300';
const PURPLE = '#B388FF';
const RED = '#FF5252';

export function SafetyRiderClient() {
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
        eyebrow="HMU Rider Safety"
        title="Ride with receipts."
        body="You pick the driver. You see the receipts. We watch the ride. Built for the people Uber forgot, with the safeguards every ride should have had from day one."
      />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 60px' }}>
        <SectionCard
          eyebrow="01 / Pick Your Driver"
          color={BLUE}
          icon={<Search size={22} color={BLUE} />}
          title="Read the room before you book."
          visual={<DriverPreviewVisual accent={BLUE} />}
          body={
            <>
              Every driver has a public profile. Video intro, photo, vehicle, ratings, chill
              score, and dispute count. No surge algorithm hiding it from you — read it, then
              book.
            </>
          }
          cta={{ label: 'Women Riders', href: '/safety/rider/women' }}
        />

        <SectionCard
          eyebrow="02 / Deposit"
          color={AMBER}
          icon={<Lock size={22} color={AMBER} />}
          title="Your money is held, not spent."
          visual={<DepositLockVisual accent={AMBER} />}
          body={
            <>
              HMU runs on a <strong>deposit-only</strong> model right now. You pay a small deposit
              in-app when you tap Pull Up — the rest is cash to your driver on arrival. The
              deposit is <em>held</em> by your bank, not charged.
            </>
          }
          callout={
            <>
              <strong>Driver no-shows or ghosts?</strong> The hold is auto-voided and your bank
              releases it back — no support ticket, no waiting. Your card is charged when you
              confirm you are in the car.
            </>
          }
        />

        <SectionCard
          eyebrow="03 / GPS"
          color={GREEN}
          icon={<MapPin size={22} color={GREEN} />}
          title="Watch your driver come to you."
          visual={<GPSVisual accent={GREEN} />}
          body={
            <>
              The moment your driver taps OTW, you see them on a live map. Every active ride is
              GPS-tracked end to end — you, them, and our ops team. You don&rsquo;t ride blind.
            </>
          }
        />

        <SectionCard
          eyebrow="04 / Check-Ins"
          color={PURPLE}
          icon={<BellRing size={22} color={PURPLE} />}
          title="We tap in mid-ride to ask if you’re good."
          visual={<CheckInVisual accent={PURPLE} />}
          body={
            <>
              A quiet &ldquo;YOU GOOD?&rdquo; appears on your screen during the ride. One tap and
              you&rsquo;re back to your music. Hold the orange button for one second and HMU admin
              gets your live GPS — silent alarm, no eye contact, no tell.
            </>
          }
          cta={{ label: 'Configure check-ins', href: '/rider/profile#safety-checkins' }}
        />

        <SectionCard
          eyebrow="05 / Reporting"
          color={RED}
          icon={<Flag size={22} color={RED} />}
          title="Report it. We investigate."
          visual={<ReportVisual accent={RED} />}
          body={
            <>
              After every ride: rate, comment, flag. <strong>WEIRDO</strong> flags from multiple
              riders trigger admin review. Mid-ride distress pings our ops queue with your live
              location. Real humans read every flag.
            </>
          }
          callout={
            <>
              Patterns get flagged. Repeat offenders get banned — for retaliation, weapons,
              substance use, or anything else that puts riders at risk. We don&rsquo;t keep bad
              actors.
            </>
          }
        />

        <CTA />
      </div>

      <Footer />
    </div>
  );
}

function CTA() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={STAGGER}
      style={{ textAlign: 'center', marginTop: 32 }}
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
          href="/rider/browse"
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
