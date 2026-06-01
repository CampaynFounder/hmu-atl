# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Booking-flow invariants (READ before touching `app/(rider)/book/*`)

These have each regressed before. They are enforced in code — do not weaken them.

## Direct booking: a pre-selected driver skips "SELECT YOUR DRIVER"
`book/direct.tsx` arrives from Browse's HMU button with a `prefillHandle` param,
meaning **the rider already chose their driver**. Step 0 ("SELECT YOUR DRIVER")
is ONLY for manual handle search (no prefill). Therefore:

- When `prefillHandle` is set, step 0 must be **unreachable**.
- This is enforced by `minStep = prefillHandle ? 1 : 0` and a `goToStep` clamp —
  ALL step changes go through `goToStep`, never raw `setStep`. The draft-resume
  path (`applyDraft`) and back nav both rely on this; a stale step-0 draft must
  never bounce a prefilled rider back to driver search.
- If you add a new way to change the step, route it through `goToStep`. If you
  add a new entry point with a pre-selected driver, give it `prefillHandle`.

Regression history: the "reorder direct booking" + "back-out drafts" PRs each
re-broke this by restoring/advancing the step without honoring the prefill.

## Network calls must never hang the UI
`lib/api.ts` `apiClient` has a 30s `AbortController` timeout. Without it a hung
origin (Neon stall, CF holding the socket) leaves a submit button spinning
forever. Keep the timeout; do not strip the signal when adding fetch options.
