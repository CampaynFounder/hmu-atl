// App-store reviewer demo-phone check (client copy). The demo phone list is
// baked into the build via EXPO_PUBLIC_DEMO_PHONE (comma-separated). Used to (a)
// skip Clerk SMS OTP on sign-in (reviewer ticket bypass) and (b) skip the
// sign-up market gate so a reviewer is never bounced to "not in market".
// Inert when the env var is unset.
const DEMO_PHONES = (process.env.EXPO_PUBLIC_DEMO_PHONE ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const norm10 = (v: string) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
};

export const isDemoPhone = (v: string): boolean =>
  DEMO_PHONES.some((p) => norm10(p) === norm10(v));
