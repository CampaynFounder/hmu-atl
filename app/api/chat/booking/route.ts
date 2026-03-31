import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { checkDriverAvailability } from '@/lib/schedule/conflicts';

/**
 * POST /api/chat/booking
 * GPT-powered conversational booking for HMU link visitors.
 * Uses function calling to extract booking details, check availability, etc.
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'extract_booking',
      description: 'Extract structured booking details from the conversation so far. Call this when you have enough info to summarize.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string', description: 'Where the rider wants to go (e.g. "Buckhead to Airport")' },
          time: { type: 'string', description: 'When they want the ride (e.g. "tomorrow 2pm", "now", "Friday evening")' },
          stops: { type: 'string', description: 'Any intermediate stops (e.g. "stop at Kroger on the way")' },
          roundTrip: { type: 'boolean', description: 'Whether this is a round trip' },
          suggestedPrice: { type: 'number', description: 'Suggested price based on driver pricing and distance' },
          isCash: { type: 'boolean', description: 'Whether this should be a cash ride' },
        },
        required: ['destination'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_availability',
      description: 'Check if the driver is available at the requested time. Call this before confirming a booking.',
      parameters: {
        type: 'object',
        properties: {
          proposedTime: { type: 'string', description: 'ISO timestamp or natural language time to check' },
        },
        required: ['proposedTime'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirm_details',
      description: 'Call this when you have collected enough ride details (destination, time, price) to summarize for the rider. This saves the details for the booking form. After calling this, ask the rider if they want to proceed.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string' },
          time: { type: 'string' },
          stops: { type: 'string' },
          roundTrip: { type: 'boolean' },
          suggestedPrice: { type: 'number' },
          isCash: { type: 'boolean' },
        },
        required: ['destination', 'suggestedPrice'],
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
];

export async function POST(req: NextRequest) {
  try {
    const { messages, driverHandle, extractedSoFar, currentStep } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      driverHandle: string;
      extractedSoFar?: Record<string, unknown>;
      currentStep?: string;
    };

    if (!messages?.length || !driverHandle) {
      return NextResponse.json({ error: 'messages and driverHandle required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI not configured', keyPresent: false }, { status: 500 });
    }

    // Fetch driver info for context
    const driverRows = await sql`
      SELECT dp.user_id, dp.display_name, dp.handle, dp.areas, dp.pricing,
             dp.accepts_cash, dp.cash_only, dp.allow_in_route_stops,
             u.chill_score, u.completed_rides, u.tier,
             (SELECT COUNT(*) FROM rides WHERE driver_id = dp.user_id AND status IN ('completed', 'ended'))::int as total_rides
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.handle = ${driverHandle} LIMIT 1
    `;

    if (!driverRows.length) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const driver = driverRows[0] as Record<string, unknown>;
    const pricing = (driver.pricing || {}) as Record<string, unknown>;
    const areas = Array.isArray(driver.areas) ? driver.areas : [];

    // Build system prompt with driver context + step state
    const systemPrompt = buildSystemPrompt(driver, pricing, areas);
    const step = currentStep || 'trip_details';
    const stepNote = `\n\nCURRENT STEP: ${step}
${extractedSoFar ? `COLLECTED SO FAR: ${JSON.stringify(extractedSoFar)}` : 'Nothing collected yet.'}

STEP INSTRUCTIONS:
${getStepInstructions(step, driver)}`;

    // Build full message array
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt + stepNote },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // Call GPT with function calling
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: fullMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!gptRes.ok) {
      const err = await gptRes.text();
      console.error('OpenAI error:', gptRes.status, err);
      return NextResponse.json({ error: 'AI unavailable', detail: err, status: gptRes.status }, { status: 502 });
    }

    const gptData = await gptRes.json();
    const choice = gptData.choices?.[0];
    const message = choice?.message;

    // Handle tool calls
    if (message?.tool_calls?.length) {
      const toolResults: Record<string, unknown>[] = [];

      for (const tc of message.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        let result: Record<string, unknown>;

        switch (tc.function.name) {
          case 'extract_booking':
            result = { extracted: true, ...args };
            break;

          case 'check_availability': {
            try {
              const proposedStart = parseTimeToISO(args.proposedTime);
              const proposedEnd = new Date(new Date(proposedStart).getTime() + 45 * 60000).toISOString();
              const avail = await checkDriverAvailability(driver.user_id as string, proposedStart, proposedEnd);
              result = {
                available: avail.available,
                isWorkingHours: avail.isWorkingHours,
                conflict: avail.conflict ? 'Driver has another booking at this time' : null,
              };
            } catch {
              result = { available: true, isWorkingHours: true, note: 'Could not verify — assume available' };
            }
            break;
          }

          case 'calculate_route': {
            try {
              const routeData = await getMapboxRoute(args.pickup, args.dropoff, args.stops);
              result = routeData;
            } catch (e) {
              result = { error: 'Could not calculate route', detail: e instanceof Error ? e.message : 'unknown' };
            }
            break;
          }

          case 'compare_pricing': {
            result = calculateUberComparison(args);
            break;
          }

          case 'confirm_details':
            result = {
              action: 'details_confirmed',
              booking: args,
            };
            break;

          case 'analyze_sentiment':
            result = { flagged: true, ...args };
            // Log to DB
            await sql`
              INSERT INTO schedule_events (event_type, details, created_at)
              VALUES ('sentiment_flag', ${JSON.stringify(args)}::jsonb, NOW())
            `.catch(() => {});
            break;

          default:
            result = { error: 'Unknown tool' };
        }

        toolResults.push({ toolCallId: tc.id, name: tc.function.name, result });
      }

      // If GPT called tools, we need to send results back for a final response
      const toolMessages: ChatMessage[] = [
        ...fullMessages,
        { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls },
        ...toolResults.map(tr => ({
          role: 'tool' as const,
          tool_call_id: tr.toolCallId as string,
          content: JSON.stringify(tr.result),
        })),
      ];

      // Check if confirm_details was called — return extracted data to client
      const confirmAction = toolResults.find(tr => tr.name === 'confirm_details');
      if (confirmAction) {
        const booking = (confirmAction.result as Record<string, unknown>).booking;
        // Get GPT's follow-up question
        const finalRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: toolMessages, temperature: 0.7, max_tokens: 200 }),
        });
        const finalData = await finalRes.json();
        const finalMessage = finalData.choices?.[0]?.message?.content || 'Sound good? Tap below to get this booked!';

        return NextResponse.json({
          reply: finalMessage,
          action: 'details_confirmed',
          booking,
          nextStep: 'confirm',
        });
      }

      // Regular tool call — get GPT's follow-up response
      let followUpMessage: { content?: string } | null = null;
      try {
        const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: toolMessages, temperature: 0.7, max_tokens: 300 }),
        });
        if (followUpRes.ok) {
          const followUpData = await followUpRes.json();
          followUpMessage = followUpData.choices?.[0]?.message;
        }
      } catch (e) {
        console.error('GPT follow-up failed:', e);
      }

      // Check for flags and extracted data
      const sentimentFlag = toolResults.find(tr => tr.name === 'analyze_sentiment');
      const extractedResult = toolResults.find(tr => tr.name === 'extract_booking');
      const routeResult = toolResults.find(tr => tr.name === 'calculate_route');
      const pricingResult = toolResults.find(tr => tr.name === 'compare_pricing');

      // Determine next step based on what tools were called
      let nextStep = currentStep || 'trip_details';
      if (routeResult && nextStep === 'trip_details') nextStep = 'stops';
      if (pricingResult && (nextStep === 'extras' || nextStep === 'stops')) nextStep = 'quote';

      // Merge extracted data from tools
      const extracted: Record<string, unknown> = {};
      if (extractedResult) Object.assign(extracted, extractedResult.result);
      if (routeResult) Object.assign(extracted, { route: routeResult.result });
      if (pricingResult) Object.assign(extracted, { pricing: pricingResult.result });

      return NextResponse.json({
        reply: followUpMessage?.content || 'What do you think?',
        sentiment: sentimentFlag ? (sentimentFlag.result as Record<string, unknown>).concern : null,
        extracted: Object.keys(extracted).length > 0 ? extracted : null,
        nextStep,
      });
    }

    // No tool calls — just a regular message
    return NextResponse.json({
      reply: message?.content || "Hey! Where do you need a ride to?",
    });
  } catch (error) {
    console.error('Chat booking error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed', detail: msg }, { status: 500 });
  }
}

function buildSystemPrompt(driver: Record<string, unknown>, pricing: Record<string, unknown>, areas: string[]): string {
  const name = driver.display_name || driver.handle;
  const minPrice = pricing.minimum ? `$${pricing.minimum}` : 'no minimum';
  const cashStatus = driver.cash_only ? 'CASH ONLY' : driver.accepts_cash ? 'cash + digital' : 'digital only';

  return `You are ${name}'s booking assistant on HMU ATL — peer-to-peer rides in Metro Atlanta.

DRIVER: ${name} | Areas: ${areas.join(', ') || 'ATL'} | Min: ${minPrice} | Payment: ${cashStatus} | Chill: ${Number(driver.chill_score || 0).toFixed(0)}%

STRICT RULES:
1. EVERY response ends with a question — NO exceptions
2. NEVER say "one sec", "let me check", "hold on" or any filler
3. NEVER guess distance or price — use tools
4. Keep responses to 2-3 sentences max
5. Casual Atlanta voice — not corporate
6. You collect trip details — the APP handles booking
7. Follow the CURRENT STEP exactly — do not skip or repeat steps`;
}

function getStepInstructions(step: string, driver: Record<string, unknown>): string {
  const name = driver.display_name || driver.handle;
  const hasCash = driver.cash_only || driver.accepts_cash;

  switch (step) {
    case 'trip_details':
      return `GOAL: Get pickup location, dropoff location, and when they need the ride.
DO: Ask "Where you headed?" if no destination. Ask "When do you need the ride?" if no time.
DO: If they give both in one message, call calculate_route immediately.
DO: Accept natural language like "buckhead to airport tomorrow 2pm"
ADVANCE TO NEXT STEP WHEN: You have pickup, dropoff, and time.
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
      return `GOAL: Call compare_pricing and present the price quote with Uber comparison.
DO: Call compare_pricing with the route distance, duration, and driver minimum.
DO: Present like: "Uber typically charges $X for this. With ${name}, expect $Y-Z — save about $W. ${hasCash ? 'This would be a cash ride.' : ''} Sound good?"
DO: If rider negotiates, adjust within range. If below minimum, explain.
ADVANCE TO NEXT STEP WHEN: Rider agrees to a price.
OUTPUT: Confirm all details and call confirm_details.`;

    case 'confirm':
      return `GOAL: Summarize the trip and call confirm_details to save it.
DO: Call confirm_details with destination, time, stops, price, roundTrip, isCash.
DO: Summarize like: "Here's your trip: [pickup] to [dropoff], [time], ~$[price]. You can adjust the price before confirming. Ready to lock this in?"
DO: Always mention they can adjust the price in the booking form.
ADVANCE TO NEXT STEP WHEN: confirm_details is called successfully.
OUTPUT: The app will show sign-up/booking buttons — your job is done.`;

    default:
      return 'Ask the rider where they want to go.';
  }
}

function parseTimeToISO(timeStr: string): string {
  const now = new Date();
  const lower = timeStr.toLowerCase();

  if (lower === 'now' || lower === 'asap') return now.toISOString();

  // Try to parse relative dates
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hourMatch = lower.match(/(\d{1,2})\s*(am|pm|a|p)/i);
    if (hourMatch) {
      let hour = parseInt(hourMatch[1]);
      if (hourMatch[2].toLowerCase().startsWith('p') && hour < 12) hour += 12;
      if (hourMatch[2].toLowerCase().startsWith('a') && hour === 12) hour = 0;
      tomorrow.setHours(hour, 0, 0, 0);
    } else {
      tomorrow.setHours(12, 0, 0, 0);
    }
    return tomorrow.toISOString();
  }

  // Try direct parse
  const parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  // Fallback to now
  return now.toISOString();
}

/**
 * Calculate Uber price estimate and HMU comparison.
 * Uses Atlanta UberX rates (publicly available).
 */
function calculateUberComparison(args: {
  distanceMiles: number;
  durationMinutes: number;
  driverMinimum: number;
  uberQuote?: number;
  timeOfDay?: string;
}): Record<string, unknown> {
  const { distanceMiles, durationMinutes, driverMinimum, uberQuote, timeOfDay } = args;

  // Atlanta UberX base rates (public)
  const UBER = {
    baseFare: 1.20,
    perMile: 0.90,
    perMinute: 0.18,
    bookingFee: 2.75,
    serviceFeeRate: 0.20, // ~20%
    minimumFare: 7.93,
  };

  // Always include surge — riders see surge prices, so should our comparison
  // These reflect typical Atlanta surge ranges (conservative estimates)
  const surgeMultipliers: Record<string, number> = {
    morning_rush: 1.5,  // 7-9am
    daytime: 1.3,       // 9am-4pm — Uber still surges during busy periods
    evening_rush: 1.8,  // 4-7pm
    night: 2.2,         // 10pm-2am
    weekend: 1.5,       // Sat/Sun
  };

  const surge = surgeMultipliers[timeOfDay || 'daytime'] || 1.3;

  // Calculate Uber estimate
  const uberBase = UBER.baseFare + (distanceMiles * UBER.perMile) + (durationMinutes * UBER.perMinute);
  const uberWithSurge = uberBase * surge;
  const uberServiceFee = uberWithSurge * UBER.serviceFeeRate;
  const uberTotal = Math.max(UBER.minimumFare, uberWithSurge + uberServiceFee + UBER.bookingFee);
  const uberEstimate = Math.round(uberTotal * 100) / 100;

  // If rider provided an Uber quote, use it; otherwise use our estimate
  const uberPrice = uberQuote || uberEstimate;

  // HMU suggested price: halfway between driver minimum and Uber price
  const hmuSuggested = Math.max(driverMinimum, Math.round((driverMinimum + uberPrice) / 2));
  const hmuLow = Math.max(driverMinimum, hmuSuggested - 3);
  const hmuHigh = hmuSuggested + 3;

  const savings = Math.round(uberPrice - hmuSuggested);
  const savingsPercent = Math.round((savings / uberPrice) * 100);

  return {
    uber: {
      estimate: uberEstimate,
      quote: uberQuote || null,
      priceUsed: uberPrice,
      breakdown: {
        baseFare: UBER.baseFare,
        distance: Math.round(distanceMiles * UBER.perMile * 100) / 100,
        time: Math.round(durationMinutes * UBER.perMinute * 100) / 100,
        bookingFee: UBER.bookingFee,
        serviceFee: Math.round(uberServiceFee * 100) / 100,
        surge: surge > 1 ? `${surge}x` : 'none',
      },
    },
    hmu: {
      suggested: hmuSuggested,
      range: { low: hmuLow, high: hmuHigh },
      driverMinimum: driverMinimum,
      note: 'Driver sets final price — this is the expected range',
    },
    savings: {
      amount: savings,
      percent: savingsPercent,
      message: savings > 0
        ? `Save ~$${savings} (${savingsPercent}%) vs Uber`
        : 'Comparable to Uber — but you support a local driver',
    },
    perMile: {
      uber: Math.round((uberPrice / distanceMiles) * 100) / 100,
      hmu: Math.round((hmuSuggested / distanceMiles) * 100) / 100,
    },
  };
}

/**
 * Geocode an address to coordinates using Mapbox Geocoding v5 API.
 */
async function geocode(address: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.error('MAPBOX TOKEN missing');
    return null;
  }

  // Add "Atlanta GA" context if not already specific
  const query = address.toLowerCase().includes('atlanta') || address.toLowerCase().includes(', ga')
    ? address
    : `${address}, Atlanta, GA`;

  const encoded = encodeURIComponent(query);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=us&bbox=-84.8,33.5,-84.1,34.1&limit=1&types=address,poi,place,neighborhood,locality`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error('Mapbox geocode failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature?.geometry?.coordinates) return null;

  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng, name: feature.place_name || feature.text || address };
}

/**
 * Get driving route from Mapbox Directions API.
 * Returns distance in miles, duration in minutes, and route summary.
 */
async function getMapboxRoute(
  pickup: string,
  dropoff: string,
  stops?: string[]
): Promise<{
  distanceMiles: number;
  durationMinutes: number;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  stops?: { address: string; lat: number; lng: number }[];
  suggestedPrice: { low: number; mid: number; high: number };
}> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('Mapbox not configured');

  // Geocode all locations
  const [pickupGeo, dropoffGeo] = await Promise.all([
    geocode(pickup),
    geocode(dropoff),
  ]);

  if (!pickupGeo) throw new Error(`Could not find pickup location: ${pickup}`);
  if (!dropoffGeo) throw new Error(`Could not find dropoff location: ${dropoff}`);

  // Build waypoints: pickup → stops → dropoff
  const waypoints: { lat: number; lng: number; address: string }[] = [
    { ...pickupGeo, address: pickupGeo.name },
  ];

  let stopGeos: { lat: number; lng: number; address: string }[] = [];
  if (stops?.length) {
    const geocoded = await Promise.all(stops.map(s => geocode(s)));
    stopGeos = geocoded
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .map(g => ({ ...g, address: g.name }));
    waypoints.push(...stopGeos);
  }

  waypoints.push({ ...dropoffGeo, address: dropoffGeo.name });

  // Build coordinates string for Directions API
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');

  const dirRes = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`
  );

  if (!dirRes.ok) {
    const err = await dirRes.text();
    throw new Error(`Mapbox Directions failed: ${err}`);
  }

  const dirData = await dirRes.json();
  const route = dirData.routes?.[0];

  if (!route) throw new Error('No route found between these locations');

  const distanceMiles = Math.round((route.distance / 1609.34) * 10) / 10;
  const durationMinutes = Math.round(route.duration / 60);

  // Suggest price based on distance
  const low = Math.max(10, Math.round(distanceMiles * 2));
  const mid = Math.max(10, Math.round(distanceMiles * 3));
  const high = Math.max(15, Math.round(distanceMiles * 4));

  return {
    distanceMiles,
    durationMinutes,
    pickup: { address: pickupGeo.name, lat: pickupGeo.lat, lng: pickupGeo.lng },
    dropoff: { address: dropoffGeo.name, lat: dropoffGeo.lat, lng: dropoffGeo.lng },
    stops: stopGeos.length > 0 ? stopGeos : undefined,
    suggestedPrice: { low, mid, high },
  };
}
