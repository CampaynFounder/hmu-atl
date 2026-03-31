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
      name: 'ready_to_book',
      description: 'Call this when the rider has confirmed all details and is ready to book. This triggers the sign-up / payment / booking flow on the client.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string' },
          time: { type: 'string' },
          stops: { type: 'string' },
          roundTrip: { type: 'boolean' },
          price: { type: 'number' },
          isCash: { type: 'boolean' },
        },
        required: ['destination', 'price'],
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
    const { messages, driverHandle, extractedSoFar } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      driverHandle: string;
      extractedSoFar?: { destination?: string; time?: string; stops?: string; roundTrip?: boolean; price?: number; isCash?: boolean };
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

    // Build system prompt with driver context + conversation state
    const systemPrompt = buildSystemPrompt(driver, pricing, areas);
    const contextNote = extractedSoFar ? `\n\nCONVERSATION STATE (already discussed — DO NOT ask again):\n${JSON.stringify(extractedSoFar, null, 2)}\nIf the rider confirms, call ready_to_book with these details.` : '';

    // Build full message array
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt + contextNote },
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

          case 'ready_to_book':
            result = {
              action: 'ready_to_book',
              booking: args,
              message: 'Rider confirmed — trigger sign-up flow',
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

      // Check if ready_to_book was called — return action to client
      const readyAction = toolResults.find(tr => tr.name === 'ready_to_book');
      if (readyAction) {
        // Get final GPT message with tool results
        const finalRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: toolMessages, temperature: 0.7, max_tokens: 200 }),
        });
        const finalData = await finalRes.json();
        const finalMessage = finalData.choices?.[0]?.message?.content || "Let's get you booked!";

        return NextResponse.json({
          reply: finalMessage,
          action: 'ready_to_book',
          booking: (readyAction.result as Record<string, unknown>).booking,
        });
      }

      // Regular tool call — get GPT's follow-up response
      const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: toolMessages, tools: TOOLS, tool_choice: 'auto', temperature: 0.7, max_tokens: 300 }),
      });
      const followUpData = await followUpRes.json();
      const followUpMessage = followUpData.choices?.[0]?.message;

      // Check for sentiment flags and extracted data
      const sentimentFlag = toolResults.find(tr => tr.name === 'analyze_sentiment');
      const extractedResult = toolResults.find(tr => tr.name === 'extract_booking');

      return NextResponse.json({
        reply: followUpMessage?.content || 'Got it! Anything else or should I book this?',
        sentiment: sentimentFlag ? (sentimentFlag.result as Record<string, unknown>).concern : null,
        extracted: extractedResult ? (extractedResult.result as Record<string, unknown>) : null,
      });
    }

    // No tool calls — just a regular message
    return NextResponse.json({
      reply: message?.content || "Hey! Where do you need a ride to?",
    });
  } catch (error) {
    console.error('Chat booking error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

function buildSystemPrompt(driver: Record<string, unknown>, pricing: Record<string, unknown>, areas: string[]): string {
  const name = driver.display_name || driver.handle;
  const minPrice = pricing.minimum ? `$${pricing.minimum}` : 'no minimum';
  const cashStatus = driver.cash_only ? 'CASH ONLY — no digital payments' : driver.accepts_cash ? 'accepts cash and digital' : 'digital payments only';

  return `You are the booking assistant for ${name}, a driver on HMU ATL — a peer-to-peer ride platform in Metro Atlanta.

ABOUT ${String(name).toUpperCase()}:
- Areas: ${areas.join(', ') || 'Metro Atlanta'}
- Minimum price: ${minPrice}
- Base rate: ${pricing.base_rate ? `$${pricing.base_rate}/30min` : 'rider proposes price'}
- Hourly: ${pricing.hourly ? `$${pricing.hourly}/hr` : 'N/A'}
- Out of town: ${pricing.out_of_town ? `$${pricing.out_of_town}/hr` : 'N/A'}
- Payment: ${cashStatus}
- Chill Score: ${Number(driver.chill_score || 0).toFixed(0)}%
- Completed rides: ${driver.total_rides || 0}
- In-route stops: ${driver.allow_in_route_stops ? 'allowed' : 'not allowed'}

YOUR JOB:
1. Ask where they're going and when (be natural, not robotic)
2. Call calculate_route to get REAL distance and duration — NEVER guess
3. Suggest a fair price based on the route distance and driver's rates
4. Check availability using the check_availability tool
5. Confirm all details and call ready_to_book when they say yes
6. If anything seems hostile or concerning, call analyze_sentiment

TONE:
- Casual Atlanta voice — friendly, direct, not corporate
- Keep messages SHORT (2-3 sentences max)
- Use "bet", "cool", "for sure" naturally but don't overdo it
- Never say "I'm an AI" — you're ${name}'s booking assistant

RULES:
- ALWAYS call calculate_route for distance — NEVER guess or estimate distance yourself
- When sharing distance, include both miles and estimated drive time
- Use the route distance to suggest price: roughly $2-4/mile depending on time of day
- NEVER make up availability — always call check_availability
- NEVER confirm a booking without the rider explicitly saying yes
- If price is below minimum (${minPrice}), explain the minimum
- If driver is cash only, mention it early so rider knows
- Always confirm: destination, time, price, round trip before calling ready_to_book`;
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
