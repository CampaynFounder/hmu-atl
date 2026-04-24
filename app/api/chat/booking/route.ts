import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkDriverAvailability } from '@/lib/schedule/conflicts';
import { parseNaturalTime } from '@/lib/schedule/parse-time';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { logSuspectEvent } from '@/lib/admin/suspect-events';
import {
  BookingDraft,
  mergeExtract,
  computeBookingWindow,
  missingSlots,
} from '@/lib/chat/booking-draft';
import { getChatBookingConfig, resolveChatBookingForDriver } from '@/lib/chat/config';
import {
  ALL_TOOLS,
  filterTools,
  buildSystemPrompt,
  getStepInstructions,
  calculateUberComparison,
  getMapboxRoute,
  type ChatMessage,
} from '@/lib/chat/booking-handler';

// Rate-limit ceiling for chat messages. Booking rate limits live on
// /api/drivers/[handle]/book where they actually fire on real submissions.
const LIMIT_CHAT_MSG_PER_HOUR = 30;

/**
 * POST /api/chat/booking
 * GPT-powered conversational booking for HMU link visitors.
 * Uses function calling to extract booking details, check availability, etc.
 */


export async function POST(req: NextRequest) {
  try {
    // Chat is intentionally anonymous-friendly — the product flow is
    // "chat first, sign up at the booking moment, attribution on sign-up."
    // We attempt to resolve a Neon user_id if the caller is already logged in,
    // but a missing session is NOT an error. Rate limits fall back to IP.
    const { userId: clerkId } = await auth();
    let neonUserId: string | null = null;
    if (clerkId) {
      const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
      if (userRows.length) {
        neonUserId = (userRows[0] as { id: string }).id;
      }
    }

    // Anonymous callers get an IP-based rate-limit key via Cloudflare's
    // cf-connecting-ip header (the canonical source on Workers). Fall back
    // to x-forwarded-for, then a shared 'unknown' bucket of last resort.
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const rateLimitSubject = neonUserId ? `user:${neonUserId}` : `ip:${clientIp}`;

    const { messages, driverHandle, extractedSoFar, currentStep } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      driverHandle: string;
      extractedSoFar?: Record<string, unknown>;
      currentStep?: string;
    };

    if (!messages?.length || !driverHandle) {
      return NextResponse.json({ error: 'messages and driverHandle required' }, { status: 400 });
    }

    // Chat message rate limit — counts every POST to this route. Keyed on
    // user_id if signed in, IP if anonymous.
    const msgLimit = await checkRateLimit({
      key: `chat:msg:${rateLimitSubject}`,
      limit: LIMIT_CHAT_MSG_PER_HOUR,
      windowSeconds: 3600,
    });
    if (!msgLimit.ok) {
      // Only log a suspect event if we have a user_id to attribute it to.
      // Anonymous rate-limit trips just 429 without audit log (can't track).
      if (neonUserId) {
        await logSuspectEvent(neonUserId, 'chat_message_rate', {
          count: msgLimit.count,
          limit: msgLimit.limit,
          driverHandle,
        });
      }
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

    // Server-side self-booking guard — only fires when the caller is
    // authenticated (anonymous callers have no identity to match against).
    // The booking create endpoint /api/drivers/[handle]/book has its own
    // structural guard that catches anonymous→auth→self-booking attempts.
    const driverUserId = String((driverRows[0] as Record<string, unknown>).user_id);
    if (neonUserId && driverUserId === neonUserId) {
      await logSuspectEvent(neonUserId, 'driver_booking_self_via_ui', { driverHandle });
      return NextResponse.json(
        { error: 'You can\'t book yourself. Try another driver.' },
        { status: 403 }
      );
    }

    const driver = driverRows[0] as Record<string, unknown>;
    const pricing = (driver.pricing || {}) as Record<string, unknown>;
    const areas = Array.isArray(driver.areas) ? driver.areas : [];

    // Admin kill-switch. Client has an SSR-rendered flag that prevents the chat
    // modal from opening in the first place, but we re-check server-side so a
    // stale client can't bypass the toggle. 200 with disabled:true is preferred
    // over a 4xx so clients don't flag this as an error state.
    const chatCfg = await getChatBookingConfig();
    const chatResolution = resolveChatBookingForDriver(chatCfg, driverUserId);
    // Treat generative.enabled as an inner kill switch — when off, the whole
    // chat is off regardless of driver-level overrides. Lets admin kill LLM
    // spend without pulling the chat UI from every driver profile.
    if (!chatResolution.enabled || !chatCfg.generative.enabled) {
      return NextResponse.json({
        disabled: true,
        reason: !chatResolution.enabled ? chatResolution.reason : 'generative_off',
        reply: "Chat booking is off right now — use the Sign up or Sign in button to book directly.",
      });
    }

    // Build system prompt — respect admin override if set.
    const systemPrompt = buildSystemPrompt(driver, pricing, areas, chatCfg.generative.system_prompt_override);
    const step = currentStep || 'trip_details';
    const stepNote = `\n\nCURRENT STEP: ${step}
${extractedSoFar ? `COLLECTED SO FAR: ${JSON.stringify(extractedSoFar)}` : 'Nothing collected yet.'}

STEP INSTRUCTIONS:
${getStepInstructions(step, driver)}`;

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt + stepNote },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // Tools filtered by admin config. Disabling a tool strips it from the
    // OpenAI call so GPT literally can't invoke it (e.g. confirm_details off =
    // chat is discovery-only, never locks a booking).
    const enabledTools = filterTools(chatCfg.generative.tools_enabled);

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: chatCfg.generative.model,
        messages: fullMessages,
        tools: enabledTools,
        tool_choice: 'auto',
        temperature: chatCfg.generative.temperature,
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
            // Deterministic gate: merge GPT's args into the canonical draft,
            // re-resolve time via parseNaturalTime (never trust the model's
            // ISO string), compute a round-trip-aware availability window
            // with a driver buffer, then enforce completeness + working
            // hours + no conflict. GPT calling confirm_details is only a
            // SIGNAL that it thinks we're done — the server decides.
            const mergedForConfirm: BookingDraft = mergeExtract(
              mergeExtract({ driverMinimum: Number(pricing.minimum) || undefined } as BookingDraft, (extractedSoFar || {}) as Record<string, unknown>),
              args as Record<string, unknown>
            );

            // Pre-seed isCash when the driver's config leaves no choice —
            // cash-only or digital-only. Only accepts-both drivers expose
            // the 'payment' slot, forcing the rider to pick.
            const driverCashOnly = driver.cash_only === true;
            const driverAcceptsCash = driver.accepts_cash === true;
            if (driverCashOnly) mergedForConfirm.isCash = true;
            else if (!driverAcceptsCash) mergedForConfirm.isCash = false;

            const driverPayment = { cashOnly: driverCashOnly, acceptsCash: driverAcceptsCash };
            const still = missingSlots(mergedForConfirm, driverPayment, {
              enforceMinPrice: chatCfg.deterministic.enforce_min_price,
              requirePaymentSlot: chatCfg.deterministic.require_payment_slot,
            });
            if (still.length) {
              // If the ONLY thing missing is payment, the price is already
              // locked in. Hand GPT an explicit "ask payment, don't touch
              // price" signal so it doesn't loop back into negotiation.
              const onlyPaymentMissing = still.length === 1 && still[0] === 'payment';
              result = onlyPaymentMissing
                ? {
                    action: 'needs_payment',
                    missing: ['payment'],
                    error: 'Price and trip details are LOCKED IN. Ask ONLY "Cash or card?" then call confirm_details again with isCash set. Do NOT re-ask about price, pickup, dropoff, or time — they are already agreed.',
                    draft: mergedForConfirm,
                  }
                : {
                    action: 'incomplete',
                    missing: still,
                    error: `Still need: ${still.join(', ')}`,
                    draft: mergedForConfirm,
                  };
              break;
            }

            const window = computeBookingWindow(mergedForConfirm, {
              bufferMinutes: chatCfg.deterministic.buffer_minutes,
            });
            if (!window) {
              result = {
                action: 'incomplete',
                missing: ['time'],
                error: 'Could not resolve the ride time — try something like "tomorrow at 3pm"',
                draft: mergedForConfirm,
              };
              break;
            }

            let availabilityOk = true;
            let availabilityError: string | null = null;
            try {
              const avail = await checkDriverAvailability(
                driver.user_id as string,
                window.checkStart,
                window.checkEnd
              );
              if (!avail.available) {
                availabilityOk = false;
                availabilityError = avail.conflict
                  ? 'Driver already has a booking around that time. Pick a different time?'
                  : "Driver isn't scheduled to work at that time. Pick a different time?";
              }
            } catch (e) {
              console.error('confirm_details availability gate failed:', e);
              availabilityOk = false;
              availabilityError = 'Could not verify availability — please try again in a moment';
            }

            if (!availabilityOk) {
              result = {
                action: 'unavailable',
                error: availabilityError,
                resolvedTimeDisplay: mergedForConfirm.timeDisplay,
                draft: mergedForConfirm,
              };
              break;
            }

            // All gates passed — isCash is now guaranteed to be a boolean
            // (pre-seeded for deterministic driver configs, required by
            // missingSlots for accepts-both). Hand the client a fully
            // resolved booking payload.
            const bookingOut: Record<string, unknown> = {
              pickup: mergedForConfirm.pickup,
              dropoff: mergedForConfirm.dropoff,
              stops: mergedForConfirm.stops,
              roundTrip: mergedForConfirm.roundTrip,
              time: mergedForConfirm.timeRaw,
              resolvedTime: mergedForConfirm.timeIso,
              timeDisplay: mergedForConfirm.timeDisplay,
              isNow: mergedForConfirm.isNow,
              riderPrice: mergedForConfirm.riderPrice,
              price: mergedForConfirm.riderPrice,
              suggestedPrice: mergedForConfirm.suggestedPrice,
              driverMinimum: mergedForConfirm.driverMinimum,
              isCash: mergedForConfirm.isCash === true,
              estimatedRideMinutes:
                new Date(window.endAt).getTime() - new Date(window.startAt).getTime() > 0
                  ? Math.round(
                      (new Date(window.endAt).getTime() - new Date(window.startAt).getTime()) / 60000
                    )
                  : undefined,
            };

            result = {
              action: 'details_confirmed',
              booking: bookingOut,
              resolvedTimeDisplay: mergedForConfirm.timeDisplay,
              window,
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

        // Deterministic gate blocked the advance because the draft is still
        // missing required slots. Walk back to the right step and tell GPT
        // to paraphrase a question for the first missing field.
        if (confirmResult.action === 'incomplete') {
          const missing = (confirmResult.missing as string[]) || [];
          const finalRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: chatCfg.generative.model, messages: toolMessages, temperature: chatCfg.generative.temperature, max_tokens: 200 }),
          });
          const finalData = await finalRes.json();
          const finalMessage =
            finalData.choices?.[0]?.message?.content ||
            `Almost there — I still need ${missing.join(' and ')}. Fill me in?`;
          const walkBackStep =
            missing.includes('pickup') || missing.includes('dropoff') || missing.includes('time')
              ? 'trip_details'
              : missing.includes('price')
              ? 'quote'
              : 'trip_details';
          return NextResponse.json({
            reply: finalMessage,
            action: 'incomplete',
            missing,
            draft: confirmResult.draft || null,
            nextStep: walkBackStep,
          });
        }

        // Availability gate failed — surface the reason, do NOT mark as
        // details_confirmed. Client stays in the chat step so the rider
        // can pick another time.
        if (confirmResult.action === 'unavailable') {
          const finalRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: chatCfg.generative.model, messages: toolMessages, temperature: chatCfg.generative.temperature, max_tokens: 200 }),
          });
          const finalData = await finalRes.json();
          const finalMessage = finalData.choices?.[0]?.message?.content
            || (confirmResult.error as string)
            || 'That time isn\'t available. Want to try a different time?';
          return NextResponse.json({
            reply: finalMessage,
            action: 'unavailable',
            error: confirmResult.error || null,
            nextStep: 'trip_details',
          });
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
          body: JSON.stringify({ model: chatCfg.generative.model, messages: toolMessages, temperature: chatCfg.generative.temperature, max_tokens: 200 }),
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
          body: JSON.stringify({ model: chatCfg.generative.model, messages: toolMessages, temperature: chatCfg.generative.temperature, max_tokens: 300 }),
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
