'use client';

// StaggeredList — wraps a list of children, applies a cascading entrance
// delay (60–100ms per item) per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §6.6.

import { Children, ReactNode } from 'react';
import { motion, Variants, useReducedMotion } from 'framer-motion';

export interface StaggeredListProps {
  children: ReactNode;
  /** Delay between sibling entrances in ms. Default 80. */
  staggerMs?: number;
  /** Wrapper HTML tag. Default 'div'. */
  as?: 'div' | 'ul' | 'ol' | 'section';
  className?: string;
}

export function StaggeredList({ children, staggerMs = 80, as = 'div', className }: StaggeredListProps) {
  const prefersReduced = useReducedMotion();
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: prefersReduced ? 0 : staggerMs / 1000,
      },
    },
  };
  const itemVariants: Variants = prefersReduced
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.2 } },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
      };

  const MotionWrap = motion[as];

  return (
    <MotionWrap
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {Children.map(children, (child, idx) => (
        <motion.div key={idx} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </MotionWrap>
  );
}

export default StaggeredList;
