// Canonical app-store reviewer demo-phone check. The demo phone list lives in
// the DEMO_LOGIN_PHONE secret (comma-separated E.164). Reviewers run from
// outside any live market, so demo phones must bypass geo/market gating. This is
// the authoritative server-side check (the mobile client has its own copy keyed
// on EXPO_PUBLIC_DEMO_PHONE in mobile/lib/demo.ts).
//
// Inert when DEMO_LOGIN_PHONE is unset — no phone is ever treated as demo, so
// prod has no bypass until the secret is deliberately set.

const DEMO_PHONES = (process.env.DEMO_LOGIN_PHONE || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Last-10-digit NANPA compare so "+1 (678) 813-1008" == "6788131008".
function norm10(value: string): string {
  const d = (value || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

export function isDemoPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const n = norm10(phone);
  return n.length === 10 && DEMO_PHONES.some((p) => norm10(p) === n);
}
