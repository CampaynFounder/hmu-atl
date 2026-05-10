'use client';

import { motion } from 'framer-motion';
import { Lock, MapPin, BellRing, Flag, Check, Star, Play } from 'lucide-react';

const FRAME_BG =
  'radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 70%)';

function VisualFrame({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div
      style={{
        height: 120,
        background: FRAME_BG,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderTop: `1px solid ${accent}10`,
        borderBottom: `1px solid ${accent}10`,
      }}
    >
      {children}
    </div>
  );
}

export function GenderFilterVisual({ accent }: { accent: string }) {
  return (
    <VisualFrame accent={accent}>
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.div
          initial={{ opacity: 0.4 }}
          whileInView={{ opacity: [0.4, 0.4, 0.4] }}
          viewport={{ once: true }}
          style={{
            padding: '8px 14px',
            borderRadius: 100,
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#666',
            fontSize: 12,
            fontWeight: 600,
            background: 'transparent',
          }}
        >
          All riders
        </motion.div>
        <motion.div
          initial={{ scale: 0.92, opacity: 0.6 }}
          whileInView={{ scale: [0.92, 1.08, 1], opacity: [0.6, 1, 1] }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.9, times: [0, 0.6, 1], ease: 'easeOut', delay: 0.3 }}
          style={{
            padding: '8px 14px',
            borderRadius: 100,
            background: accent,
            color: '#080808',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Check size={13} strokeWidth={3} /> Women only
        </motion.div>
      </div>
    </VisualFrame>
  );
}

export function DepositLockVisual({ accent }: { accent: string }) {
  return (
    <VisualFrame accent={accent}>
      <motion.div
        initial={{ scale: 0.9 }}
        whileInView={{ scale: [0.9, 1.04, 1] }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: `${accent}20`,
          border: `1.5px solid ${accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <Lock size={28} color={accent} strokeWidth={2} />
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 22,
            border: `1px solid ${accent}50`,
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: [0, 0.7, 0], scale: [0.8, 1.3, 1.6] }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </motion.div>
      <div
        style={{
          marginLeft: 14,
          fontFamily: 'var(--font-mono, Space Mono, monospace)',
          fontSize: 11,
          letterSpacing: 2,
          color: accent,
          textTransform: 'uppercase',
        }}
      >
        Deposit
        <br />
        Held
      </div>
    </VisualFrame>
  );
}

export function GPSVisual({ accent }: { accent: string }) {
  return (
    <VisualFrame accent={accent}>
      <div style={{ position: 'relative', width: 70, height: 70 }}>
        {[0, 0.4, 0.8].map((delay) => (
          <motion.span
            key={delay}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1.5px solid ${accent}`,
            }}
            animate={{ scale: [0.4, 1.4], opacity: [0.7, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 22,
            borderRadius: '50%',
            background: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MapPin size={14} color="#080808" strokeWidth={3} />
        </div>
      </div>
      <div
        style={{
          marginLeft: 14,
          fontFamily: 'var(--font-mono, Space Mono, monospace)',
          fontSize: 11,
          letterSpacing: 2,
          color: accent,
          textTransform: 'uppercase',
        }}
      >
        Live
        <br />
        Tracked
      </div>
    </VisualFrame>
  );
}

export function CheckInVisual({ accent }: { accent: string }) {
  return (
    <VisualFrame accent={accent}>
      <motion.div
        initial={{ scale: 1 }}
        whileInView={{ scale: [1, 0.94, 1] }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
        style={{
          padding: '14px 24px',
          borderRadius: 100,
          background: accent,
          color: '#080808',
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
        }}
      >
        <BellRing size={16} strokeWidth={2.5} />
        YOU GOOD?
        <motion.span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: 100,
            border: `2px solid ${accent}`,
          }}
          initial={{ opacity: 0.6, scale: 0.95 }}
          whileInView={{ opacity: [0.6, 0], scale: [0.95, 1.4] }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
        />
      </motion.div>
    </VisualFrame>
  );
}

export function RiderPreviewVisual({ accent }: { accent: string }) {
  const chips = [
    { label: '98% CHILL', tone: '#00E676', icon: <Star size={9} strokeWidth={3} /> },
    { label: '0 DISPUTES', tone: '#9ca3af' },
    { label: 'OG', tone: '#FFB300' },
  ];
  return (
    <VisualFrame accent={accent}>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        style={{ display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <motion.div
          variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: `${accent}22`,
            border: `2px solid ${accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            fontWeight: 800,
            fontSize: 18,
            fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
          }}
        >
          R
        </motion.div>
        <div>
          <motion.div
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              fontFamily: 'var(--font-mono, Space Mono, monospace)',
              fontSize: 11,
              color: '#fff',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            @rider
          </motion.div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {chips.map((chip) => (
              <motion.span
                key={chip.label}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  padding: '4px 8px',
                  borderRadius: 100,
                  background: `${chip.tone}22`,
                  color: chip.tone,
                  border: `1px solid ${chip.tone}50`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.icon}
                {chip.label}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>
    </VisualFrame>
  );
}

export function DriverPreviewVisual({ accent }: { accent: string }) {
  const chips = [
    { label: '95% CHILL', tone: '#00E676', icon: <Star size={9} strokeWidth={3} /> },
    { label: '4.9', tone: '#FFB300', icon: <Star size={9} strokeWidth={3} /> },
    { label: 'ATL', tone: '#9ca3af' },
  ];
  return (
    <VisualFrame accent={accent}>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        style={{ display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <motion.div
          variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: `${accent}22`,
            border: `2px solid ${accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Play size={16} color={accent} strokeWidth={2.5} fill={accent} />
        </motion.div>
        <div>
          <motion.div
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              fontFamily: 'var(--font-mono, Space Mono, monospace)',
              fontSize: 11,
              color: '#fff',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            @driver
          </motion.div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {chips.map((chip) => (
              <motion.span
                key={chip.label}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  padding: '4px 8px',
                  borderRadius: 100,
                  background: `${chip.tone}22`,
                  color: chip.tone,
                  border: `1px solid ${chip.tone}50`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.icon}
                {chip.label}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>
    </VisualFrame>
  );
}

export function ReportVisual({ accent }: { accent: string }) {
  return (
    <VisualFrame accent={accent}>
      <motion.div
        initial={{ rotate: -18, opacity: 0 }}
        whileInView={{ rotate: [-18, 6, 0], opacity: [0, 1, 1] }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          background: `${accent}1A`,
          border: `1.5px solid ${accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Flag size={28} color={accent} strokeWidth={2} />
      </motion.div>
      <div
        style={{
          marginLeft: 14,
          fontFamily: 'var(--font-mono, Space Mono, monospace)',
          fontSize: 11,
          letterSpacing: 2,
          color: accent,
          textTransform: 'uppercase',
        }}
      >
        Reviewed
        <br />
        By Humans
      </div>
    </VisualFrame>
  );
}
