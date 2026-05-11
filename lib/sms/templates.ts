// SMS template store — DB-backed, admin-editable.
//
// Read path: renderTemplate(eventKey, vars) → interpolated string, or null if
// the row is missing/disabled/malformed. Callers in lib/sms/textbee.ts use the
// null sentinel to fall back to their original hardcoded literal so a missing
// row, a malformed template, or a Neon outage never blocks an SMS.
//
// No caching: a module-level Map persists across requests within a Worker
// isolate and across isolates that don't see admin edits, so cached reads can
// serve stale bodies indefinitely after an admin update. The admin UI promises
// "live on next SMS" — we keep that promise by reading from Neon every send.
// The lookup is a single-row PK fetch on a tiny table; the Stripe/Twilio call
// that follows dwarfs it.

import { sql } from '@/lib/db/client';

// Canonical list of event_keys backed by an sms_templates row. Adding a new
// transactional SMS = (1) append the key here, (2) extend the CHECK
// constraint and add a seed row in sql/sms-templates.sql, and (3) call
// renderTemplate with the new key at the send site. Step 1 makes a typo in
// step 3 a TS error; step 2 prevents direct-insert drift in prod.
//
// Sections below mirror the layout in sql/sms-templates.sql — keep them in
// the same order so diffs stay readable.
export const SMS_EVENT_KEYS = [
  // ── Transactional ride flow ──
  'new_booking',
  'ride_accepted',
  'generic',
  'booking_accepted',
  'booking_declined',
  'driver_otw',
  'driver_here',
  // ── Standalone transactional ──
  'hmu_received',
  'eta_nudge',
  'welcome_driver',
  'safety_intro_driver',
  'welcome_rider',
  'safety_intro_rider',
  'payout_ready',
  'balance_available',
  'maintenance_back_live',
  // ── Activation nudges (admin-triggered, lib/admin/activation-checks.ts) ──
  'driver_payout_setup',
  'driver_deposit_floor',
  'driver_location_enabled',
  'driver_areas',
  'driver_pricing',
  'driver_media',
  'driver_handle',
  'driver_display_name',
  'driver_share_link_promo',
  'driver_profile_views_promo',
  'driver_vehicle_info',
  'driver_visible',
  'rider_payment_method',
  'rider_display_name',
  'rider_avatar',
  'rider_recent_signin',
  'rider_has_activity',
  // ── Mid-ride quick messages (rider/driver tap-to-send shortcuts) ──
  'quick_rider_eta',
  'quick_rider_wya',
  'quick_rider_here',
  'quick_rider_late',
  'quick_rider_spot',
  'quick_driver_otw',
  'quick_driver_5min',
  'quick_driver_here',
  'quick_driver_cantfind',
  'quick_driver_pulling_up',
] as const;
export type SmsEventKey = (typeof SMS_EVENT_KEYS)[number];

export interface SmsTemplate {
  event_key: SmsEventKey;
  audience: 'driver' | 'rider' | 'admin' | 'any';
  trigger_description: string;
  body: string;
  variables: string[];
  enabled: boolean;
  updated_at: Date;
  updated_by: string | null;
}

async function loadTemplate(eventKey: SmsEventKey): Promise<SmsTemplate | null> {
  try {
    const rows = await sql`
      SELECT event_key, audience, trigger_description, body, variables,
             enabled, updated_at, updated_by
      FROM sms_templates
      WHERE event_key = ${eventKey}
      LIMIT 1
    `;
    return (rows[0] as SmsTemplate | undefined) ?? null;
  } catch (e) {
    // DB hiccup must NOT block an SMS — caller falls back to its hardcoded literal.
    console.error('[sms-templates] loadTemplate failed:', eventKey, e);
    return null;
  }
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Render a template body, substituting `{{name}}` with vars[name]. Returns
 * null if the template is missing, disabled, or references a variable the
 * caller didn't supply (treated as a config drift signal — fail loud in
 * logs, fall back to the literal). Missing-but-empty values (`''`) are
 * substituted in.
 */
export async function renderTemplate(
  eventKey: SmsEventKey,
  vars: Record<string, string | number | null | undefined> = {},
): Promise<string | null> {
  const tpl = await loadTemplate(eventKey);
  if (!tpl || !tpl.enabled) return null;

  let missingVar = false;
  const rendered = tpl.body.replace(PLACEHOLDER_RE, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) {
      missingVar = true;
      console.warn(`[sms-templates] ${eventKey} body references {{${name}}} but caller did not supply it`);
      return '';
    }
    return v === null ? '' : String(v);
  });

  if (missingVar) return null;
  return rendered;
}

/**
 * In-memory render: substitute {{name}} placeholders in a body string using
 * the supplied vars map. Returns null if the body references a variable the
 * caller didn't supply (config-drift signal — caller can fall back to a
 * hardcoded literal). Use this when you've already loaded a template row
 * (e.g. via loadTemplateMap) and want to avoid a per-call DB roundtrip —
 * the admin activation page renders thousands of previews per load.
 */
export function renderBody(
  body: string,
  vars: Record<string, string | number | null | undefined> = {},
): string | null {
  let missingVar = false;
  const rendered = body.replace(PLACEHOLDER_RE, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) {
      missingVar = true;
      return '';
    }
    return v === null ? '' : String(v);
  });
  if (missingVar) return null;
  return rendered;
}

/**
 * Bulk-load all templates into a map keyed by event_key. Use for routes that
 * render many previews per request (activation dashboard). Returns an empty
 * map on DB error so callers fall through to their hardcoded literal.
 */
export async function loadTemplateMap(): Promise<Map<SmsEventKey, SmsTemplate>> {
  try {
    const rows = await sql`
      SELECT event_key, audience, trigger_description, body, variables,
             enabled, updated_at, updated_by
      FROM sms_templates
    ` as SmsTemplate[];
    const map = new Map<SmsEventKey, SmsTemplate>();
    for (const r of rows) map.set(r.event_key, r);
    return map;
  } catch (e) {
    console.error('[sms-templates] loadTemplateMap failed:', e);
    return new Map();
  }
}

export async function listTemplates(): Promise<SmsTemplate[]> {
  const rows = await sql`
    SELECT event_key, audience, trigger_description, body, variables,
           enabled, updated_at, updated_by
    FROM sms_templates
    ORDER BY audience, event_key
  `;
  return rows as SmsTemplate[];
}

export interface TemplateUpdate {
  body: string;
  enabled: boolean;
}

/**
 * Update a template's body + enabled flag. Validates that every {{name}} in
 * the new body is in the row's declared `variables` whitelist — rejects with
 * a thrown Error otherwise so admins can't ship a body that references a
 * variable the call sites don't pass.
 */
export async function updateTemplate(
  eventKey: SmsEventKey,
  update: TemplateUpdate,
  updatedBy: string | null,
): Promise<SmsTemplate> {
  const existing = await sql`
    SELECT variables FROM sms_templates WHERE event_key = ${eventKey} LIMIT 1
  `;
  if (!existing[0]) throw new Error(`sms template ${eventKey} not found`);
  const allowed = new Set((existing[0] as { variables: string[] }).variables);

  const referenced = new Set<string>();
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(update.body)) !== null) referenced.add(m[1]);

  const unknown = [...referenced].filter(v => !allowed.has(v));
  if (unknown.length > 0) {
    throw new Error(
      `Body references unknown variables: ${unknown.join(', ')}. ` +
      `Allowed: ${[...allowed].join(', ') || '(none)'}`
    );
  }

  const rows = await sql`
    UPDATE sms_templates
    SET body = ${update.body},
        enabled = ${update.enabled},
        updated_at = NOW(),
        updated_by = ${updatedBy}
    WHERE event_key = ${eventKey}
    RETURNING event_key, audience, trigger_description, body, variables,
              enabled, updated_at, updated_by
  `;
  return rows[0] as SmsTemplate;
}
