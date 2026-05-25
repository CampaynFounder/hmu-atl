'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Lock, MapPin, BellRing, Flag, Users } from 'lucide-react';
import { Footer } from '@/components/landing/footer';
import { SafetyHero } from '../_components/safety-hero';
import { SectionCard } from '../_components/section-card';
import { EASE, FADE_UP, STAGGER } from '../_components/motion';
import {
  CheckInVisual,
  DepositLockVisual,
  GPSVisual,
  ReportVisual,
  RiderPreviewVisual,
} from '../_components/visuals';

const GREEN = '#00E676';
const BLUE = '#448AFF';
const AMBER = '#FFB300';
const PURPLE = '#B388FF';
const RED = '#FF5252';

export function SafetyDriverClient() {
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
        eyebrow="HMU Driver Safety"
        title="Drive with receipts."
        body="Every safeguard a real driver actually needs — built into the app from the jump. Deposits, GPS, check-ins, and a real human review queue."
      />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 60px' }}>
        <SectionCard
          eyebrow="01 / Pick Your Passenger"
          color={GREEN}
          icon={<Users size={22} color={GREEN} />}
          title="You decide who gets in your car."
          visual={<RiderPreviewVisual accent={GREEN} />}
          body={
            <>
              Every rider has a public profile: chill score, dispute count, photo, and ratings
              from past drivers. You see it all before you tap accept — no algorithm hiding the
              receipts.
            </>
          }
          cta={{ label: 'Women Drivers', href: '/safety/driver/women' }}
        />

        <SectionCard
          eyebrow="02 / Deposit"
          color={AMBER}
          icon={<Lock size={22} color={AMBER} />}
          title="Locked before you move."
          visual={<DepositLockVisual accent={AMBER} />}
          body={
            <>
              HMU runs on a <strong>deposit-only</strong> model right now. The rider authorizes a
              deposit when they tap Pull Up. The moment you tap Start Ride and the geofence checks
              pass, that deposit clears into your Stripe Connect.
            </>
          }
          callout={
            <>
              <strong>Rider no-show?</strong> You elect 25% or 50% — captured automatically.{' '}
              <strong>Rider bails after Start Ride?</strong> The deposit is already yours. The
              rider pays the rest of the fare in cash on arrival.
            </>
          }
        />

        <SectionCard
          eyebrow="03 / GPS"
          color={BLUE}
          icon={<MapPin size={22} color={BLUE} />}
          title="Every active ride is tracked."
          visual={<GPSVisual accent={BLUE} />}
          body={
            <>
              From the moment you tap OTW, your live location streams to the rider, the platform,
              and admin. Distance and arrival are computed server-side — no spoofing, no &ldquo;he
              said she said.&rdquo; Safety is built into the protocol.
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
              A discreet &ldquo;YOU GOOD?&rdquo; prompt fires during every ride. Tap green to
              dismiss in one motion. Hold the orange button for one second and HMU admin gets
              your live GPS — no shouting, no tells. You set the cadence.
            </>
          }
          cta={{ label: 'Configure check-ins', href: '/driver/profile#safety-checkins' }}
        />

        <SectionCard
          eyebrow="05 / Reporting"
          color={RED}
          icon={<Flag size={22} color={RED} />}
          title="When something is off, we investigate."
          visual={<ReportVisual accent={RED} />}
          body={
            <>
              After every ride, both sides rate. <strong>WEIRDO</strong> flags from three different
              riders in a window trigger automatic admin review. Mid-ride distress sends an alert
              with your live location to our ops queue.
            </>
          }
          callout={
            <>
              Patterns get flagged. Repeat offenders get banned. Public profiles show dispute
              count — every driver gets to see who they&rsquo;re getting in a car with.
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
        Ready to drive?
      </motion.h3>
      <motion.div variants={FADE_UP} transition={{ duration: 0.5, ease: EASE }}>
        <Link
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
        </Link>
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
