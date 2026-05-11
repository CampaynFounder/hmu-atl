// VoIP.ms SMS Integration
// Sends SMS via VoIP.ms REST API with retry logic and DB logging
// Docs: https://voip.ms/m/api.php
//
// Required env vars:
//   VOIPMS_API_USERNAME  — VoIP.ms login email
//   VOIPMS_API_PASSWORD  — API password (set in VoIP.ms portal, NOT login password)
//   VOIPMS_DID_ATL       — SMS-enabled DID for Atlanta market (10 digits)
//   VOIPMS_DID_DEFAULT   — Fallback DID if market-specific not set
//
// To add a new market: set VOIPMS_DID_{MARKET} env var (e.g. VOIPMS_DID_HOU for Houston)

import { sql } from '@/lib/db/client';
import { renderTemplate } from './templates';

const API_URL = 'https://voip.ms/api/v1/rest.php';
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1500;

// ── Market → DID mapping ──
// When a market's env var is unset (e.g. NOLA pilot before a 504 DID is
// purchased), resolution falls through to VOIPMS_DID_ATL so outbound SMS keeps
// working with the ATL number.
const MARKET_DIDS: Record<string, string> = {
  atl: 'VOIPMS_DID_ATL',
  nola: 'VOIPMS_DID_NOLA',
  hou: 'VOIPMS_DID_HOU',
  dal: 'VOIPMS_DID_DAL',
  mem: 'VOIPMS_DID_MEM',
};

function getDidForMarket(market: string = 'atl'): string | null {
  const envKey = MARKET_DIDS[market.toLowerCase()];
  if (envKey) {
    // Use direct property access — Cloudflare Workers Proxy needs known keys
    switch (market.toLowerCase()) {
      case 'atl': return process.env.VOIPMS_DID_ATL || null;
      case 'nola': return process.env.VOIPMS_DID_NOLA || process.env.VOIPMS_DID_ATL || null;
      case 'hou': return process.env.VOIPMS_DID_HOU || null;
      case 'dal': return process.env.VOIPMS_DID_DAL || null;
      case 'mem': return process.env.VOIPMS_DID_MEM || null;
    }
  }
  return process.env.VOIPMS_DID_ATL || null;
}

// ── Normalize phone to 10-digit NANPA ──
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Strip leading 1 if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

// ── Core types ──
interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SmsOptions {
  rideId?: string;
  userId?: string;
  eventType?: string;
  market?: string;
}

// ── Log to sms_log table ──
async function logSms(
  to: string,
  fromDid: string,
  message: string,
  status: 'sent' | 'failed' | 'skipped',
  voipmsStatus: string | null,
  error: string | null,
  retryCount: number,
  options: SmsOptions,
  voipmsResponse: unknown = null,
  voipmsHttpStatus: number | null = null,
): Promise<void> {
  try {
    await sql`
      INSERT INTO sms_log (
        to_phone, from_did, message, status, voipms_status, error, retry_count,
        ride_id, user_id, event_type, market, voipms_response, voipms_http_status
      )
      VALUES (
        ${to}, ${fromDid}, ${message}, ${status}, ${voipmsStatus},
        ${error}, ${retryCount},
        ${options.rideId || null}, ${options.userId || null},
        ${options.eventType || null}, ${options.market || 'atl'},
        ${voipmsResponse ? JSON.stringify(voipmsResponse) : null},
        ${voipmsHttpStatus}
      )
    `;
  } catch (e) {
    console.error('[SMS] Failed to log SMS:', e);
  }
}

// ── Send SMS via VoIP.ms with retry ──
export async function sendSms(
  to: string,
  rawMessage: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  let message = rawMessage;
  const username = process.env.VOIPMS_API_USERNAME;
  const password = process.env.VOIPMS_API_PASSWORD;
  const did = getDidForMarket(options.market);

  console.log('[SMS] Attempting send to:', to, '| Username set:', !!username, '| Password set:', !!password, '| DID:', did);

  if (!username || !password || !did) {
    console.warn('[SMS] VoIP.ms not configured — skipping SMS to', to, '| username:', !!username, '| password:', !!password, '| did:', did);
    logSms(to, did || 'none', message, 'skipped', null, 'VoIP.ms not configured', 0, options).catch(() => {});
    return { success: false, error: 'VoIP.ms not configured' };
  }

  // VoIP.ms rejects messages over 160 chars with sms_toolong.
  // Some characters (smart quotes, accented chars) count as 2 bytes in GSM-7 encoding,
  // so cap at 155 to leave headroom for encoding overhead.
  const SMS_MAX = 155;
  if (message.length > SMS_MAX) {
    console.warn(`[SMS] Message is ${message.length} chars, truncating to ${SMS_MAX}`);
    message = message.slice(0, SMS_MAX);
  }

  const dst = normalizePhone(to);
  if (dst.length !== 10) {
    const err = `Invalid phone number: ${to} → ${dst}`;
    console.error('[SMS]', err);
    await logSms(to, did, message, 'failed', null, err, 0, options);
    return { success: false, error: err };
  }

  let lastError = '';
  let lastResponse: unknown = null;
  let lastHttpStatus: number | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params = new URLSearchParams({
        api_username: username,
        api_password: password,
        method: 'sendSMS',
        did: normalizePhone(did),
        dst,
        message,
      });

      const res = await fetch(`${API_URL}?${params.toString()}`);
      lastHttpStatus = res.status;

      // Read body as text first so we can persist whatever voip.ms sent,
      // even if it's not valid JSON.
      const rawText = await res.text();
      let data: { status?: string; [k: string]: unknown };
      try {
        data = JSON.parse(rawText) as { status?: string; [k: string]: unknown };
      } catch {
        data = { status: 'invalid_json', raw: rawText.slice(0, 2000) };
      }
      lastResponse = data;

      const apiStatus = typeof data.status === 'string' ? data.status : 'unknown';

      if (apiStatus === 'success') {
        console.log('[SMS] Sent successfully to', dst);
        logSms(dst, did, message, 'sent', 'success', null, attempt, options, data, lastHttpStatus).catch(() => {});
        return { success: true };
      }

      lastError = `VoIP.ms: ${apiStatus}`;
      console.error(`[SMS] Attempt ${attempt + 1} failed:`, apiStatus, '| http:', lastHttpStatus, '| body:', rawText.slice(0, 200));

      // Don't retry on auth/config errors
      if (['invalid_credentials', 'invalid_method', 'missing_did'].includes(apiStatus)) {
        console.error('[SMS] Fatal error, not retrying:', apiStatus);
        logSms(dst, did, message, 'failed', apiStatus, lastError, attempt, options, data, lastHttpStatus).catch(() => {});
        return { success: false, error: lastError };
      }

      // Retry after delay
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error';
      lastResponse = { error: lastError, kind: 'network_or_parse_exception' };
      console.error(`[SMS] Attempt ${attempt + 1} error:`, lastError);

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  console.error('[SMS] All retries exhausted for', dst, '| Error:', lastError);
  logSms(dst, did, message, 'failed', null, lastError, MAX_RETRIES, options, lastResponse, lastHttpStatus).catch(() => {});
  return { success: false, error: lastError };
}

// ── Driver Notification Templates ──

export async function notifyDriverNewBooking(
  driverPhone: string,
  riderName: string,
  details?: { destination?: string; time?: string; price?: number; payoutSetup?: boolean },
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const link = details?.payoutSetup === false
    ? 'atl.hmucashride.com/driver/payout-setup'
    : 'atl.hmucashride.com/driver/home';

  // Pre-assemble optional segments so the template body can use simple
  // {{priceLine}}{{destLine}}{{timeLine}} placeholders. Length-fitting for
  // destination + time stays in code since it depends on the dynamic link.
  const priceLine = details?.price ? ` $${details.price}.` : '';
  // base length = "HMU ATL: Ride from <rider>." + price + " " + link
  const base = `HMU ATL: Ride from ${riderName}.${priceLine}`;
  let destLine = '';
  if (details?.destination) {
    const candidate = ` ${details.destination}.`;
    if (base.length + candidate.length + link.length + 1 <= 160) destLine = candidate;
  }
  let timeLine = '';
  if (details?.time) {
    const candidate = ` ${details.time}.`;
    if (base.length + destLine.length + candidate.length + link.length + 1 <= 160) timeLine = candidate;
  }

  const tpl = await renderTemplate('new_booking', { riderName, priceLine, destLine, timeLine, link });
  const message = tpl ?? `${base}${destLine}${timeLine} ${link}`;

  return sendSms(driverPhone, message, { ...options, eventType: 'new_booking' });
}

export async function notifyDriverRideAccepted(
  driverPhone: string,
  riderName: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const fallback = `HMU ATL: ${riderName} confirmed payment. Check the app for pickup details. atl.hmucashride.com/driver/home`;
  const message = (await renderTemplate('ride_accepted', { riderName })) ?? fallback;
  return sendSms(driverPhone, message, { ...options, eventType: 'ride_accepted' });
}

export async function notifyDriverGeneric(
  driverPhone: string,
  text: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const message = (await renderTemplate('generic', { text })) ?? `HMU ATL: ${text}`;
  return sendSms(driverPhone, message, { ...options, eventType: 'generic' });
}

// ── Rider Notification Templates ──

export async function notifyRiderBookingAccepted(
  riderPhone: string,
  driverName: string,
  rideId: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const fallback = `HMU ATL: ${driverName} accepted your ride! Open the app to tap Pull Up and share your location. atl.hmucashride.com/ride/${rideId}`;
  const message = (await renderTemplate('booking_accepted', { driverName, rideId })) ?? fallback;
  return sendSms(riderPhone, message, { ...options, eventType: 'booking_accepted', rideId });
}

export async function notifyRiderBookingDeclined(
  riderPhone: string,
  driverName: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const fallback = `HMU ATL: ${driverName} passed on your request. Try another driver or post to the feed. atl.hmucashride.com/rider/browse`;
  const message = (await renderTemplate('booking_declined', { driverName })) ?? fallback;
  return sendSms(riderPhone, message, { ...options, eventType: 'booking_declined' });
}

export async function notifyRiderDriverOtw(
  riderPhone: string,
  driverName: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const fallback = `HMU ATL: ${driverName} is OTW to you now! Track them in the app.`;
  const message = (await renderTemplate('driver_otw', { driverName })) ?? fallback;
  return sendSms(riderPhone, message, { ...options, eventType: 'driver_otw' });
}

export async function notifyRiderDriverHere(
  riderPhone: string,
  driverName: string,
  options: SmsOptions = {}
): Promise<SendSmsResult> {
  const fallback = `HMU ATL: ${driverName} is HERE! Head to the car.`;
  const message = (await renderTemplate('driver_here', { driverName })) ?? fallback;
  return sendSms(riderPhone, message, { ...options, eventType: 'driver_here' });
}
