// SMS template store — DB-backed, admin-editable.
//
// Read path: renderTemplate(eventKey, vars) → interpolated string, or null if
// the row is missing/disabled/malformed. Callers in lib/sms/textbee.ts use the
// null sentinel to fall back to their original hardcoded literal so a missing
// row, a malformed template, or a Neon outage never blocks an SMS.
//
// Cache: per-request Map (mirrors lib/feature-flags.ts) so a single request
// hitting the same template multiple times only pays for one Neon read. Edits
// in the admin UI are visible on the very next request — no isolate-level
// staleness window.

import { sql } from '@/lib/db/client';

export interface SmsTemplate {
  event_key: string;
  audience: 'driver' | 'rider' | 'admin' | 'any';
  trigger_description: string;
  body: string;
  variables: string[];
  enabled: boolean;
  updated_at: Date;
  updated_by: string | null;
}

const requestCache = new Map<string, SmsTemplate | null>();

async function loadTemplate(eventKey: string): Promise<SmsTemplate | null> {
  if (requestCache.has(eventKey)) return requestCache.get(eventKey) ?? null;
  try {
    const rows = await sql`
      SELECT event_key, audience, trigger_description, body, variables,
             enabled, updated_at, updated_by
      FROM sms_templates
      WHERE event_key = ${eventKey}
      LIMIT 1
    `;
    const row = (rows[0] as SmsTemplate | undefined) ?? null;
    requestCache.set(eventKey, row);
    return row;
  } catch (e) {
    // DB hiccup must NOT block an SMS — caller falls back to its hardcoded
    // literal. Don't cache the failure; next call gets a fresh attempt.
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
  eventKey: string,
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
  eventKey: string,
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

  requestCache.delete(eventKey);

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
