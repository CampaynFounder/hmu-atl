import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkDriverAvailability } from '@/lib/schedule/conflicts';
import { parseNaturalTime } from '@/lib/schedule/parse-time';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { logSuspectEvent } from '@/lib/admin/suspect-events';

// Rate-limit ceilings — see PR1 design notes in docs.
const LIMIT_CHAT_MSG_PER_HOUR = 30;
const LIMIT_BOOKING_PER_HOUR = 5;
const LIMIT_SAME_DRIVER_PER_DAY = 2;

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
          proposedTime: { type: 'string', description: 'ISO 8601 timestamp to check. Resolve relative dates yourself: "next Friday 3pm" → "2026-04-11T15:00:00". Use today\'s date as reference.' },
        },
        required: ['proposedTime'],
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
];

export async function POST(req: NextRequest) {
  try {
    // Auth gate — chat is no longer public. Unauthenticated callers bounce so
    // we can attribute rate limits to a Neon user_id rather than IP.
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Sign in to chat' }, { status: 401 });
    }

    // Resolve Clerk id → Neon user_id for rate-limit keys + self-booking check.
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) {
      return NextResponse.json({ error: 'Finish onboarding to chat' }, { status: 403 });
    }
    const neonUserId = (userRows[0] as { id: string }).id;

    const { messages, driverHandle, extractedSoFar, currentStep } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      driverHandle: string;
      extractedSoFar?: Record<string, unknown>;
      currentStep?: string;
    };

    if (!messages?.length || !driverHandle) {
      return NextResponse.json({ error: 'messages and driverHandle required' }, { status: 400 });
    }

    // Chat message rate limit — counts every POST to this route.
    const msgLimit = await checkRateLimit({
      key: `chat:msg:${neonUserId}`,
      limit: LIMIT_CHAT_MSG_PER_HOUR,
      windowSeconds: 3600,
    });
    if (!msgLimit.ok) {
      await logSuspectEvent(neonUserId, 'chat_message_rate', {
        count: msgLimit.count,
        limit: msgLimit.limit,
        driverHandle,
      });
      return NextResponse.json(
        {
          error: 'You\'re chatting too fast. Take a break and try again in a few minutes.',
          retryAfter: msgLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
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

    // Server-side self-booking guard — the UI blocker is the first line, this
    // is the backstop in case someone calls the API directly.
    const driverUserId = String((driverRows[0] as Record<string, unknown>).user_id);
    if (driverUserId === neonUserId) {
      await logSuspectEvent(neonUserId, 'driver_booking_self_via_ui', { driverHandle });
      return NextResponse.json(
        { error: 'You can\'t book yourself. Try another driver.' },
        { status: 403 }
      );
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

          case 'confirm_details': {
            // Booking-conversion rate limits — protect drivers from a rider
            // spraying fake booking requests. Checked BEFORE persisting the
            // extracted details so we fail loud.
            const hourlyBook = await checkRateLimit({
              key: `book:${neonUserId}`,
              limit: LIMIT_BOOKING_PER_HOUR,
              windowSeconds: 3600,
            });
            if (!hourlyBook.ok) {
              await logSuspectEvent(neonUserId, 'booking_rate', {
                count: hourlyBook.count,
                limit: hourlyBook.limit,
                driverHandle,
              });
              result = {
                error: 'rate_limited',
                message: 'You\'ve submitted a lot of booking requests lately. Wait an hour and try again.',
              };
              break;
            }

            const sameDriverBook = await checkRateLimit({
              key: `book:${neonUserId}:${driverUserId}`,
              limit: LIMIT_SAME_DRIVER_PER_DAY,
              windowSeconds: 86400,
            });
            if (!sameDriverBook.ok) {
              await logSuspectEvent(neonUserId, 'same_driver_booking_rate', {
                count: sameDriverBook.count,
                limit: sameDriverBook.limit,
                driverHandle,
                driverUserId,
              });
              result = {
                error: 'rate_limited',
                message: `You've already submitted booking requests to ${driver.display_name || driverHandle} recently. Give them a chance to respond first.`,
              };
              break;
            }

            // Resolve the time to a concrete ISO timestamp + display string
            const timeInput = args.resolvedTime || args.time || '';
            const parsed = parseNaturalTime(timeInput);
            args.resolvedTime = parsed.iso;
            args.timeDisplay = parsed.display;
            args.isNow = parsed.isNow;

            result = {
              action: 'details_confirmed',
              booking: args,
              resolvedTimeDisplay: parsed.display,
            };
            break;
          }

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
        const confirmResult = confirmAction.result as Record<string, unknown>;
        // Rate-limit trip — tool handler set error + message, bail with 429.
        // The human-readable message goes in `error` so the chat client shows it;
        // `code` gives downstream consumers something machine-readable.
        if (confirmResult.error === 'rate_limited') {
          return NextResponse.json(
            { error: String(confirmResult.message), code: 'rate_limited' },
            { status: 429 }
          );
        }
        const booking = confirmResult.booking as Record<string, unknown>;
        // Ensure riderPrice takes priority — fall back to suggestedPrice for backwards compat
        if (booking.riderPrice) {
          booking.price = booking.riderPrice;
        } else if (booking.suggestedPrice && !booking.price) {
          booking.price = booking.suggestedPrice;
        }
        // Always pass driverMinimum so the booking form can validate
        if (!booking.driverMinimum && pricing.minimum) {
          booking.driverMinimum = Number(pricing.minimum);
        }
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

function getStepInstructions(step: string, driver: Record<string, unknown>): string {
  const name = driver.display_name || driver.handle;
  const hasCash = driver.cash_only || driver.accepts_cash;

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
DO: Present like: "Uber would charge around $X for this trip. ${name}'s minimum is $[min] — we'd suggest around $Y but anything at or above $[min] works. ${hasCash ? 'This would be a cash ride.' : ''} What price works for you?"
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
DO: Summarize with the RESOLVED date: "Here's your trip: [pickup] → [dropoff], [resolved date like 'Friday April 11th at 3pm'], ~$[price]. You can adjust the price and time before confirming. Ready?"
DO: NEVER show an ISO timestamp to the rider — always use a friendly format like "Friday April 11th at 3:00 PM"
DO: Always mention they can adjust the price in the booking form.
ADVANCE TO NEXT STEP WHEN: confirm_details is called successfully.
OUTPUT: The app will show sign-up/booking buttons — your job is done.`;

    default:
      return 'Ask the rider where they want to go.';
  }
}

/** Parse natural language time to ISO — delegates to shared parser */
function parseTimeToISO(timeStr: string): string {
  return parseNaturalTime(timeStr).iso;
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
    uberEstimate: uberPrice,
    recommendedPrice: hmuSuggested,
    driverMinimum: driverMinimum,
    acceptableRange: `Any price from $${driverMinimum} and up is valid — the rider can book at exactly $${driverMinimum} if they want`,
    savings: savings > 0 ? `Save ~$${savings} vs Uber` : 'Comparable to Uber',
    note: `IMPORTANT: If the rider offers $${driverMinimum} or more, ACCEPT IT. Do not push for the recommended $${hmuSuggested}. The minimum IS a valid price.`,
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
