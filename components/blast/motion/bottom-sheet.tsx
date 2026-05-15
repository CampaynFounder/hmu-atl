'use client';

// BottomSheet — drag-dismiss-able bottom sheet primitive.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.4 + §6.6.
//
// - Drag handle visible at top
// - Drag down past 30% of sheet height = dismiss; otherwise spring back
// - Backdrop rgba(0,0,0,0.6) + blur, fades 200ms
// - 320ms open/close
// - min-height 50vh, max-height 92vh
// - Spring stiffness 350, damping 30
//
// Step transitions inside (slide-in from right, slide-out left, 280ms) are
// the consumer's responsibility — wrap step content in <AnimatePresence> +
// <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} />
// per the catalog moment "Form bottom sheet → Step → next".

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, PanInfo, useReducedMotion } from 'framer-motion';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** ARIA label for the dialog container. */
  ariaLabel?: string;
  /** Hide the drag handle (rare; handle is good UX in most cases). */
  hideHandle?: boolean;
}

const DISMISS_THRESHOLD_PCT = 0.3;

export function BottomSheet({ open, onClose, children, ariaLabel, hideHandle }: BottomSheetProps) {
  const prefersReduced = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(0);

  // Measure on open so the dismiss threshold is accurate to actual content.
  useEffect(() => {
    if (open && sheetRef.current) {
      setSheetHeight(sheetRef.current.getBoundingClientRect().height);
    }
  }, [open]);

  // Lock body scroll while open. Restore on close + on unmount.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const dismissAt = sheetHeight * DISMISS_THRESHOLD_PCT;
      if (info.offset.y > dismissAt || info.velocity.y > 600) {
        onClose();
      }
    },
    [sheetHeight, onClose],
  );

  // Reduced-motion: opacity fade only, no slide.
  const sheetTransition = prefersReduced
    ? { duration: 0.2 }
    : { type: 'spring' as const, stiffness: 350, damping: 30 };
  const sheetVariants = prefersReduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
      };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="bottom-sheet-portal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: 0,
              padding: 0,
              cursor: 'default',
            }}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? 'Bottom sheet'}
            initial={sheetVariants.initial}
            animate={sheetVariants.animate}
            exit={sheetVariants.exit}
            transition={{ ...sheetTransition, duration: prefersReduced ? 0.2 : 0.32 }}
            drag={prefersReduced ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            style={{
              position: 'relative',
              background: '#141414',
              color: '#FFFFFF',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              minHeight: '50vh',
              maxHeight: '92vh',
              overflow: 'hidden auto',
              boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            {!hideHandle ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 8 }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.2)' }} />
              </div>
            ) : null}
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default BottomSheet;
