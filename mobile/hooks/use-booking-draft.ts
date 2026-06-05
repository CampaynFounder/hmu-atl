// useBookingDraft — the screen-side glue for booking back-out drafts.
//
// Usage in a flow screen:
//   const draft = useBookingDraft<MyDraft>('blast');
//   // save whenever state changes AND the user has actually started:
//   useEffect(() => { if (dirty) draft.save(serialize()); }, [deps]);
//   // offer resume when a draft was found:
//   {draft.pending && <ResumeDraftSheet onResume={() => applyDraft(draft.pending!)} onStartOver={draft.clear} />}
//   // on successful submit: draft.clear();
//
// Contract: `pending` is null until the async load finishes, and stays null
// when there's no resumable draft — so screens render normally and the resume
// sheet simply never mounts. Saves are debounced and fail-safe (see
// lib/booking-draft). Nothing here throws.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadBookingDraft,
  saveBookingDraft,
  clearBookingDraft,
  type BookingFlowKey,
} from '@/lib/booking-draft';

const SAVE_DEBOUNCE_MS = 400;

// After a clear, ignore saves for this long. Long enough to swallow the
// auto-save effect re-firing from still-dirty or async-updated state (e.g. a
// direct booking's prefilled driver, an in-flight findDriver, or a debounced
// save scheduled microseconds before the clear), which would otherwise
// resurrect the draft the user just wiped.
const CLEAR_SUPPRESS_MS = 1200;

export function useBookingDraft<T>(flow: BookingFlowKey) {
  // The draft found on mount, awaiting the user's Resume / Start over choice.
  const [pending, setPending] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp until which saves are suppressed because the draft was just cleared.
  const suppressUntil = useRef(0);

  useEffect(() => {
    let active = true;
    void loadBookingDraft<T>(flow).then((d) => {
      if (active && d != null) setPending(d);
    });
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flow]);

  // Debounced persist of the current state. No-ops during the post-clear
  // suppression window, and re-checks when the timer fires so a save scheduled
  // just before a clear can't slip through and resurrect the draft.
  const save = useCallback(
    (data: T) => {
      if (Date.now() < suppressUntil.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (Date.now() < suppressUntil.current) return;
        void saveBookingDraft(flow, data);
      }, SAVE_DEBOUNCE_MS);
    },
    [flow],
  );

  // Remove the draft entirely (successful submit, or "Start over"). Opens a
  // brief suppression window so the auto-save effect — which will re-run as the
  // screen resets its state — cannot immediately write the draft back.
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    suppressUntil.current = Date.now() + CLEAR_SUPPRESS_MS;
    setPending(null);
    void clearBookingDraft(flow);
  }, [flow]);

  // Hide the resume prompt WITHOUT deleting the draft — used right after the
  // screen has applied the draft on "Resume" so continued edits keep saving.
  const dismiss = useCallback(() => setPending(null), []);

  return { pending, save, clear, dismiss };
}
