// TextBee SMS Integration
// Uses the TextBee API to send SMS via an Android device gateway
// Docs: https://textbee.dev
//
// Required env vars:
//   TEXTBEE_API_KEY    — API key from textbee.dev dashboard
//   TEXTBEE_DEVICE_ID  — Device ID of the connected Android phone

const API_BASE = 'https://api.textbee.dev/api/v1';

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms(
  to: string,
  message: string
): Promise<SendSmsResult> {
  const apiKey = process.env.TEXTBEE_API_KEY;
  const deviceId = process.env.TEXTBEE_DEVICE_ID;

  if (!apiKey || !deviceId) {
    console.warn('[SMS] TextBee not configured — skipping SMS to', to);
    return { success: false, error: 'TextBee not configured' };
  }

  try {
    const res = await fetch(`${API_BASE}/gateway/devices/${deviceId}/sendSMS`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receivers: [to],
        smsBody: message,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[SMS] TextBee error:', res.status, err);
      return { success: false, error: `HTTP ${res.status}: ${err}` };
    }

    const data = await res.json();
    return { success: true, messageId: data?.data?.id };
  } catch (error) {
    console.error('[SMS] TextBee send failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ── Notification Templates ──

export async function notifyDriverNewBooking(
  driverPhone: string,
  riderName: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: New ride request from ${riderName}! Open the app to respond. You have 15 min. atl.hmucashride.com/driver/rides`;
  return sendSms(driverPhone, message);
}

export async function notifyDriverRideAccepted(
  driverPhone: string,
  riderName: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: ${riderName} confirmed payment. Check the app for pickup details. atl.hmucashride.com/driver/home`;
  return sendSms(driverPhone, message);
}

export async function notifyDriverGeneric(
  driverPhone: string,
  text: string
): Promise<SendSmsResult> {
  return sendSms(driverPhone, `HMU ATL: ${text}`);
}

// ── Rider Notification Templates ──

export async function notifyRiderBookingAccepted(
  riderPhone: string,
  driverName: string,
  rideId: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: ${driverName} accepted your ride! Open the app to send COO and share your location. atl.hmucashride.com/ride/${rideId}`;
  return sendSms(riderPhone, message);
}

export async function notifyRiderBookingDeclined(
  riderPhone: string,
  driverName: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: ${driverName} passed on your request. Try another driver or post to the feed. atl.hmucashride.com/rider/browse`;
  return sendSms(riderPhone, message);
}

export async function notifyRiderDriverOtw(
  riderPhone: string,
  driverName: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: ${driverName} is OTW to you now! Track them in the app.`;
  return sendSms(riderPhone, message);
}

export async function notifyRiderDriverHere(
  riderPhone: string,
  driverName: string
): Promise<SendSmsResult> {
  const message = `HMU ATL: ${driverName} is HERE! Head to the car.`;
  return sendSms(riderPhone, message);
}
