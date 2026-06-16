// Named SMS "lines" — each line is a separate VoIP.ms phone number (DID),
// resolved per market. This lets one SMS framework drive multiple numbers:
//
//   'main'         — the original platform number (booking, ops, support).
//   'rider_growth' — a SECOND number used for rider-acquisition outreach,
//                    surfaced in the /admin/rider-growth admin console.
//
// A message is attributed to a line by DID end-to-end:
//   • outbound rows store sms_log.from_did
//   • inbound rows store sms_inbound.to_did
// so scoping a surface to a line is just a DID membership filter (see
// getNormalizedDidsForLine + the messages/counts routes).
//
// To add a market to a line: set its env var below. To add a whole new line:
// add a key here, give it env vars, and (for an admin surface) a route +
// permission + nav entry. Nothing in the data model needs to change.
//
// Workers note: OpenNext/Cloudflare exposes env through a proxy that only
// resolves STATICALLY-KNOWN keys, so every read is an explicit
// `process.env.VOIPMS_DID_*` — never `process.env[dynamicKey]`. This mirrors
// the long-standing pattern in textbee.ts.

export type SmsLineKey = 'main' | 'rider_growth';

// Markets we may resolve a DID for. Used to enumerate a line's full DID set.
const MARKETS = ['atl', 'nola', 'hou', 'dal', 'mem'] as const;

// Resolve the raw DID string for a (line, market). Returns null when unset.
//
// main: NOLA falls back to the ATL DID (matches historical getDidForMarket
//   behavior so a pilot market keeps texting from the ATL number).
// rider_growth: NO cross-market/cross-line fallback — if a market has no
//   rider-growth DID the line is simply unavailable there (sendSms will skip,
//   which is the intended "unconfigured = off" feature-flag behavior).
function rawDid(line: SmsLineKey, market: string = 'atl'): string | null {
  const m = market.toLowerCase();
  if (line === 'rider_growth') {
    switch (m) {
      case 'atl': return process.env.VOIPMS_DID_RIDERGROWTH_ATL || null;
      case 'nola': return process.env.VOIPMS_DID_RIDERGROWTH_NOLA || null;
      case 'hou': return process.env.VOIPMS_DID_RIDERGROWTH_HOU || null;
      case 'dal': return process.env.VOIPMS_DID_RIDERGROWTH_DAL || null;
      case 'mem': return process.env.VOIPMS_DID_RIDERGROWTH_MEM || null;
      default: return null;
    }
  }
  // main line
  switch (m) {
    case 'atl': return process.env.VOIPMS_DID_ATL || null;
    case 'nola': return process.env.VOIPMS_DID_NOLA || process.env.VOIPMS_DID_ATL || null;
    case 'hou': return process.env.VOIPMS_DID_HOU || null;
    case 'dal': return process.env.VOIPMS_DID_DAL || null;
    case 'mem': return process.env.VOIPMS_DID_MEM || null;
    default: return process.env.VOIPMS_DID_ATL || null;
  }
}

// Normalize any DID/phone to its 10-digit NANPA form, or null if it isn't one.
// Both sms_log.from_did (raw env value) and sms_inbound.to_did (webhook-stored)
// flow through this so membership checks are format-agnostic.
function norm10(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// The DID to SEND from for a line + market (raw — sendSms normalizes for the
// VoIP.ms API call and logs the raw value, matching existing behavior).
export function getDidForLine(line: SmsLineKey, market: string = 'atl'): string | null {
  return rawDid(line, market);
}

// All configured 10-digit DIDs for a line, across every market. Used to scope
// inbox threads + badge counts to a line via `to_did`/`from_did` membership.
export function getNormalizedDidsForLine(line: SmsLineKey): string[] {
  const out = new Set<string>();
  for (const m of MARKETS) {
    const d = norm10(rawDid(line, m));
    if (d) out.add(d);
  }
  return [...out];
}

// Coerce an arbitrary string to a known line key (defaults to 'main'). Used by
// API routes reading a `?line=` / body `line` param from clients.
export function asLineKey(value: unknown): SmsLineKey {
  return value === 'rider_growth' ? 'rider_growth' : 'main';
}
