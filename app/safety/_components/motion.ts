import type { Variants } from 'framer-motion';

export const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export const STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export const EASE = [0.25, 0.1, 0.25, 1] as const;
