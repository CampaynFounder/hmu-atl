// Shared chat-booking logic — imported by both the production route
// (/app/api/chat/booking) and the admin test playground
// (/app/api/admin/chat-booking/test). Keeping the tool definitions, prompt
// builder, and external-service helpers in one place ensures the test harness
// sees exactly what production sees.
//
// This file is pure — no DB writes, no session checks. The caller decides what
// to do with the result.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ToolKey =
  | 'extract_booking'
  | 'confirm_details'
  | 'calculate_route'
  | 'compare_pricing'
  | 'analyze_sentiment';

export const ALL_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'extract_booking',
      description: 'Extract structured booking details from the conversation so far. Call this when you have enough info to summarize.',
      parameters: {
        type: 'object',
        properties: {
          pickup: { type: 'string', description: 'Where the rider is coming from (e.g. "Buckhead")' },
          dropoff: { type: 'string', description: 'Where the rider wants to go (e.g. "Airport")' },
          time: { type: 'string', description: 'When they want the ride — rider\'s original words (e.g. "next Friday 3pm", "tomorrow evening")' },
          resolvedTime: { type: 'string', description: 'The resolved date/time as an ISO 8601 string. You MUST resolve relative dates: "next Friday" → "2026-04-11T15:00:00", "this Sunday" → "2026-04-12T12:00:00". Use today\'s date as reference. If "now" or "asap", use current timestamp.' },
          stops: { type: 'string', description: 'Any intermediate stops (e.g. "stop at Kroger on the way")' },
          roundTrip: { type: 'boolean', description: 'Whether this is a round trip' },
          riderPrice: { type: 'number', description: 'The price the rider stated or agreed to (must be >= driver minimum)' },
          suggestedPrice: { type: 'number', description: 'Your recommended price based on distance/comparison (for reference)' },
          driverMinimum: { type: 'number', description: 'The driver\'s minimum ride price' },
          isCash: { type: 'boolean', description: 'Whether this should be a cash ride' },
        },
        required: ['dropoff'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirm_details',
      description: 'Call this when you have collected enough ride details to summarize for the rider. This saves the details for the booking form. After calling this, ask the rider if they want to proceed.',
      parameters: {
        type: 'object',
        properties: {
          pickup: { type: 'string', description: 'Pickup location as rider described it' },
          dropoff: { type: 'string', description: 'Dropoff location as rider described it' },
          time: { type: 'string', description: 'Rider\'s original time words (e.g. "next Friday 3pm")' },
          resolvedTime: { type: 'string', description: 'ISO 8601 timestamp you resolved from the rider\'s words. MUST be an actual date, not relative. e.g. "2026-04-11T15:00:00"' },
          stops: { type: 'string' },
          roundTrip: { type: 'boolean' },
          riderPrice: { type: 'number', description: 'The price the rider explicitly agreed to or offered. Must be >= driver minimum. Use the rider\'s stated amount, NOT your recommendation.' },
          suggestedPrice: { type: 'number', description: 'Your recommended price (for reference only). The booking form will default to riderPrice, not this.' },
          driverMinimum: { type: 'number', description: 'The driver\'s minimum ride price' },
          isCash: { type: 'boolean' },
        },
        required: ['pickup', 'dropoff', 'riderPrice'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculate_route',
      description: 'Calculate the actual driving distance and duration between locations using Mapbox. Call this when the rider asks about distance, duration, or to suggest an accurate price. Pass the full address or landmark name for pickup and dropoff.',
      parameters: {
        type: 'object',
        properties: {
          pickup: { type: 'string', description: 'Pickup address or landmark (e.g. "Cleveland Ave, Atlanta, GA")' },
          dropoff: { type: 'string', description: 'Dropoff address or landmark (e.g. "Bankhead, Atlanta, GA")' },
          stops: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional intermediate stop addresses',
          },
        },
        required: ['pickup', 'dropoff'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare_pricing',
      description: 'Compare HMU pricing vs Uber estimate for a route. Call this when the rider asks about pricing, mentions Uber, or you want to show savings. If the rider provides an Uber quote, pass it as uberQuote. Otherwise the system will estimate.',
      parameters: {
        type: 'object',
        properties: {
          distanceMiles: { type: 'number', description: 'Route distance in miles (from calculate_route)' },
          durationMinutes: { type: 'number', description: 'Route duration in minutes (from calculate_route)' },
          driverMinimum: { type: 'number', description: 'Driver minimum price' },
          uberQuote: { type: 'number', description: 'Uber price quoted by the rider (if they provided one)' },
          timeOfDay: { type: 'string', enum: ['morning_rush', 'daytime', 'evening_rush', 'night', 'weekend'], description: 'Time of day for surge estimation' },
        },
        required: ['distanceMiles', 'durationMinutes', 'driverMinimum'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_sentiment',
      description: 'Analyze rider message for safety concerns, hostility, or spam. Call on any message that seems concerning.',
      parameters: {
        type: 'object',
        properties: {
          concern: { type: 'string', enum: ['hostile', 'safety_concern', 'spam', 'urgent'] },
          detail: { type: 'string' },
        },
        required: ['concern'],
      },
    },
  },
] as const;

/** Return a subset of ALL_TOOLS matching the admin's tools_enabled map. */
export function filterTools(toolsEnabled: Record<string, boolean>): typeof ALL_TOOLS[number][] {
  return ALL_TOOLS.filter((t) => toolsEnabled[t.function.name] !== false);
}

export function buildSystemPrompt(
  driver: Record<string, unknown>,
  pricing: Record<string, unknown>,
  areas: string[],
  override?: string | null,
): string {
  if (override && override.trim()) return override;

  const name = driver.display_name || driver.handle;
  const minPrice = pricing.minimum ? `$${pricing.minimum}` : 'no minimum';
  const cashStatus = driver.cash_only ? 'CASH ONLY' : driver.accepts_cash ? 'cash + digital' : 'digital only';

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are ${name}'s booking assistant on HMU ATL — peer-to-peer rides in Metro Atlanta.

TODAY: ${todayStr}
DRIVER: ${name} | Areas: ${areas.join(', ') || 'ATL'} | Min: ${minPrice} | Payment: ${cashStatus} | Chill: ${Number(driver.chill_score || 0).toFixed(0)}%

STRICT RULES:
1. EVERY response ends with a question — NO exceptions
2. NEVER say "one sec", "let me check", "hold on" or any filler
3. NEVER guess distance or price — use tools
4. Keep responses to 2-3 sentences max
5. Casual Atlanta voice — not corporate
6. You collect trip details — the APP handles booking
7. Follow the CURRENT STEP exactly — do not skip or repeat steps
8. PRICE RULE: The driver minimum (${minPrice}) is the FLOOR. Any price at or above it is VALID. Never push back on a valid price. When calling confirm_details, set riderPrice to the rider's stated amount — never override it with your recommendation.
9. DATE RULE: When a rider says a relative date ("next Friday", "this Sunday", "Saturday 3pm"), you MUST resolve it to the actual calendar date using TODAY as reference. Always set resolvedTime as an ISO timestamp (e.g. "2026-04-11T15:00:00"). Always confirm the resolved date back: "So that's Friday April 11th at 3pm — that right?" NEVER leave time as "next Friday" in resolvedTime.`;
}

export function getStepInstructions(step: string, driver: Record<string, unknown>): string {
  const name = driver.display_name || driver.handle;
  const cashOnly = !!driver.cash_only;
  const acceptsBoth = !!driver.accepts_cash && !cashOnly;
  const digitalOnly = !driver.accepts_cash && !cashOnly;

  switch (step) {
    case 'trip_details':
      return `GOAL: Get pickup location, dropoff location, and when they need the ride.
DO: Ask "Where you headed?" if no destination. Ask "When do you need the ride?" if no time.
DO: If they give both in one message, call calculate_route immediately.
DO: Accept natural language like "buckhead to airport tomorrow 2pm", "next Friday evening", "this Sunday 3pm"
DO: When the rider gives a relative date like "next Friday" or "this Sunday", IMMEDIATELY resolve it to the actual date using TODAY (${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}) as reference. Confirm it back: "So that's Friday April 11th — what time works?"
DO: If the rider only gives a day with no time, ask what time. If they say "afternoon" or "evening", resolve to 2pm or 6pm respectively.
ADVANCE TO NEXT STEP WHEN: You have pickup, dropoff, and a SPECIFIC date + time (not just "next Friday" — must be resolved).
OUTPUT: After calling calculate_route, share the distance and drive time, then ask about stops.`;
    case 'stops':
      return `GOAL: Ask if they need any stops along the way.
DO: Ask "Any stops along the way, or straight there?"
DO: If yes, note the stop. If no, move on.
ADVANCE TO NEXT STEP WHEN: Rider confirms stops or says no stops.
OUTPUT: Acknowledge and move to pricing.`;
    case 'extras':
      return `GOAL: Mention driver's extras/add-on services if they have any.
DO: If driver has service menu items, briefly mention 1-2 top ones: "FYI ${name} also offers [extras]. Want to add any?"
DO: If no services, skip and say "Cool, let me get you a price."
ADVANCE TO NEXT STEP WHEN: Rider says yes/no to extras.
OUTPUT: Move to quote.`;
    case 'quote':
      return `GOAL: Call compare_pricing and present the price with Uber comparison.
DO: Call compare_pricing with the route distance, duration, and driver minimum.
DO: The tool returns a recommended price AND the driver minimum — present BOTH.
DO: Present like: "Uber would charge around $X for this trip. ${name}'s minimum is $[min] — we'd suggest around $Y but anything at or above $[min] works. ${cashOnly ? `${name} is cash only.` : acceptsBoth ? `${name} takes cash or card.` : ''} What price works for you?"
DO: NEVER reveal the pricing formula or mention "midpoint", "lower bound", or "suggested price calculation"
DO: If rider offers a price AT or ABOVE the driver minimum, ACCEPT IT IMMEDIATELY — say "bet, $Z works" and advance. Do NOT try to upsell or suggest a higher price.
DO: If rider offers BELOW the driver minimum, explain: "${name}'s minimum is $[min] — can you do at least that?" This is the ONLY reason to push back on a price.
DO: NEVER reject or negotiate a price that is at or above the driver minimum, even if it's below your recommendation. The driver decides if the price works — your job is just to enforce the minimum floor.
CRITICAL: When calling confirm_details, set riderPrice to the EXACT amount the rider stated or agreed to. Do NOT substitute your recommendation. If the rider said "$15" and the minimum is $10, riderPrice must be 15 — not your suggested $22 or whatever. The booking form uses riderPrice as the default.
ADVANCE TO NEXT STEP WHEN: Rider states a price >= driver minimum.
OUTPUT: Confirm all details and call confirm_details.`;
    case 'confirm':
      return `GOAL: Summarize the trip and call confirm_details to save it.
DO: Call confirm_details with SEPARATE pickup and dropoff (not combined), time (rider's words), resolvedTime (ISO timestamp), stops, riderPrice, roundTrip, isCash.
${cashOnly ? `PAYMENT: ${name} is CASH ONLY. Always set isCash=true. Tell the rider: "Heads up — ${name} is cash only. Bring $[price] in cash for the ride."` : ''}
${digitalOnly ? `PAYMENT: ${name} accepts card payments only. Always set isCash=false. Do not mention cash.` : ''}
${acceptsBoth ? `PAYMENT: ${name} accepts cash OR card. Before calling confirm_details, you MUST ask the rider: "Paying cash or card?" Set isCash=true for cash, isCash=false for card. Do not call confirm_details until the rider has picked one. If they're unsure, tell them: "Card gets held now, charged when you're in the ride. Cash means you hand it to ${name} at pickup."` : ''}
DO: Summarize with the RESOLVED date: "Here's your trip: [pickup] → [dropoff], [resolved date like 'Friday April 11th at 3pm'], ~$[price]. You can adjust the price and time before confirming. Ready?"
DO: When mentioning payment, write it in plain English — "paying cash" or "on card" — never use code-like syntax.
DO: NEVER show an ISO timestamp to the rider — always use a friendly format like "Friday April 11th at 3:00 PM"
DO: Always mention they can adjust the price in the booking form.
ADVANCE TO NEXT STEP WHEN: confirm_details is called successfully.
OUTPUT: The app will show sign-up/booking buttons — your job is done.`;
    default:
      return 'Ask the rider where they want to go.';
  }
}

/** Atlanta UberX comparison (public rates). Pure function, safe to call in test mode. */
export function calculateUberComparison(args: {
  distanceMiles: number;
  durationMinutes: number;
  driverMinimum: number;
  uberQuote?: number;
  timeOfDay?: string;
}): Record<string, unknown> {
  const { distanceMiles, durationMinutes, driverMinimum, uberQuote, timeOfDay } = args;
  const UBER = { baseFare: 1.20, perMile: 0.90, perMinute: 0.18, bookingFee: 2.75, serviceFeeRate: 0.20, minimumFare: 7.93 };
  const surgeMultipliers: Record<string, number> = {
    morning_rush: 1.5, daytime: 1.3, evening_rush: 1.8, night: 2.2, weekend: 1.5,
  };
  const surge = surgeMultipliers[timeOfDay || 'daytime'] || 1.3;
  const uberBase = UBER.baseFare + (distanceMiles * UBER.perMile) + (durationMinutes * UBER.perMinute);
  const uberWithSurge = uberBase * surge;
  const uberServiceFee = uberWithSurge * UBER.serviceFeeRate;
  const uberTotal = Math.max(UBER.minimumFare, uberWithSurge + uberServiceFee + UBER.bookingFee);
  const uberEstimate = Math.round(uberTotal * 100) / 100;
  const uberPrice = uberQuote || uberEstimate;
  const hmuSuggested = Math.max(driverMinimum, Math.round((driverMinimum + uberPrice) / 2));
  const savings = Math.round(uberPrice - hmuSuggested);
  return {
    uberEstimate: uberPrice,
    recommendedPrice: hmuSuggested,
    driverMinimum: driverMinimum,
    acceptableRange: `Any price from $${driverMinimum} and up is valid — the rider can book at exactly $${driverMinimum} if they want`,
    savings: savings > 0 ? `Save ~$${savings} vs Uber` : 'Comparable to Uber',
    note: `IMPORTANT: If the rider offers $${driverMinimum} or more, ACCEPT IT. Do not push for the recommended $${hmuSuggested}. The minimum IS a valid price.`,
  };
}

async function geocode(address: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const query = address.toLowerCase().includes('atlanta') || address.toLowerCase().includes(', ga')
    ? address : `${address}, Atlanta, GA`;
  const encoded = encodeURIComponent(query);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=us&bbox=-84.8,33.5,-84.1,34.1&limit=1&types=address,poi,place,neighborhood,locality`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature?.geometry?.coordinates) return null;
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng, name: feature.place_name || feature.text || address };
}

export async function getMapboxRoute(
  pickup: string, dropoff: string, stops?: string[],
): Promise<{
  distanceMiles: number; durationMinutes: number;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  stops?: { address: string; lat: number; lng: number }[];
  suggestedPrice: { low: number; mid: number; high: number };
}> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('Mapbox not configured');
  const [pickupGeo, dropoffGeo] = await Promise.all([geocode(pickup), geocode(dropoff)]);
  if (!pickupGeo) throw new Error(`Could not find pickup location: ${pickup}`);
  if (!dropoffGeo) throw new Error(`Could not find dropoff location: ${dropoff}`);
  const waypoints: { lat: number; lng: number; address: string }[] = [{ ...pickupGeo, address: pickupGeo.name }];
  let stopGeos: { lat: number; lng: number; address: string }[] = [];
  if (stops?.length) {
    const geocoded = await Promise.all(stops.map(s => geocode(s)));
    stopGeos = geocoded.filter((g): g is NonNullable<typeof g> => g !== null).map(g => ({ ...g, address: g.name }));
    waypoints.push(...stopGeos);
  }
  waypoints.push({ ...dropoffGeo, address: dropoffGeo.name });
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const dirRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`);
  if (!dirRes.ok) throw new Error(`Mapbox Directions failed: ${await dirRes.text()}`);
  const dirData = await dirRes.json();
  const route = dirData.routes?.[0];
  if (!route) throw new Error('No route found between these locations');
  const distanceMiles = Math.round((route.distance / 1609.34) * 10) / 10;
  const durationMinutes = Math.round(route.duration / 60);
  const low = Math.max(10, Math.round(distanceMiles * 2));
  const mid = Math.max(10, Math.round(distanceMiles * 3));
  const high = Math.max(15, Math.round(distanceMiles * 4));
  return {
    distanceMiles, durationMinutes,
    pickup: { address: pickupGeo.name, lat: pickupGeo.lat, lng: pickupGeo.lng },
    dropoff: { address: dropoffGeo.name, lat: dropoffGeo.lat, lng: dropoffGeo.lng },
    stops: stopGeos.length > 0 ? stopGeos : undefined,
    suggestedPrice: { low, mid, high },
  };
}
