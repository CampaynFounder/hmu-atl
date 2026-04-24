// Admin test playground for chat booking. Runs the SAME pipeline as the
// production /api/chat/booking handler — identical system prompt, tool
// definitions, deterministic gate, and model config — with these
// exceptions:
//   - admin-gated (requireAdmin)
//   - no rate limit
//   - no DB writes (sentiment flags, suspect events) — all side-effects off
//   - returns a structured trace (tool calls, args, extracted payload,
//     deterministic gate verdict) so the admin can see what production
//     would have done
//
// Reuses lib/chat/booking-handler.ts so TOOLS / prompts stay in lockstep.
// If you edit this file, do NOT diverge from the prod route's semantics —
// that's the whole point of this playground.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { checkDriverAvailability } from '@/lib/schedule/conflicts';
import {
  BookingDraft,
  mergeExtract,
  computeBookingWindow,
  missingSlots,
} from '@/lib/chat/booking-draft';
import { getChatBookingConfig } from '@/lib/chat/config';
import {
  filterTools,
  buildSystemPrompt,
  getStepInstructions,
  calculateUberComparison,
  getMapboxRoute,
  type ChatMessage,
} from '@/lib/chat/booking-handler';

interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
}

interface DeterministicResult {
  action: 'incomplete' | 'unavailable' | 'details_confirmed';
  reason?: string;
  payload?: unknown;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as {
    driverHandle?: string;
    messages?: { role: 'user' | 'assistant'; content: string }[];
    extractedSoFar?: Record<string, unknown>;
    currentStep?: string;
  } | null;

  if (!body?.driverHandle || !body.messages?.length) {
    return NextResponse.json({ error: 'driverHandle and messages required' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

  // Driver lookup — same projection as prod so the prompt gets the same context.
  const driverRows = await sql`
    SELECT dp.user_id, dp.display_name, dp.handle, dp.areas, dp.pricing,
           dp.accepts_cash, dp.cash_only, dp.allow_in_route_stops,
           u.chill_score, u.completed_rides, u.tier
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.handle = ${body.driverHandle} LIMIT 1
  `;
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const driver = driverRows[0] as Record<string, unknown>;
  const pricing = (driver.pricing || {}) as Record<string, unknown>;
  const areas = Array.isArray(driver.areas) ? driver.areas : [];

  const cfg = await getChatBookingConfig();
  const step = body.currentStep || 'trip_details';

  const systemPrompt = buildSystemPrompt(driver, pricing, areas, cfg.generative.system_prompt_override);
  const stepNote = `\n\nCURRENT STEP: ${step}
${body.extractedSoFar ? `COLLECTED SO FAR: ${JSON.stringify(body.extractedSoFar)}` : 'Nothing collected yet.'}

STEP INSTRUCTIONS:
${getStepInstructions(step, driver)}`;

  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt + stepNote },
    ...body.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const enabledTools = filterTools(cfg.generative.tools_enabled);

  const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.generative.model,
      messages: fullMessages,
      tools: enabledTools,
      tool_choice: 'auto',
      temperature: cfg.generative.temperature,
      max_tokens: 300,
    }),
  });
  if (!gptRes.ok) {
    const err = await gptRes.text();
    return NextResponse.json({ error: 'OpenAI error', detail: err, status: gptRes.status }, { status: 502 });
  }

  const gptData = await gptRes.json();
  const message = gptData.choices?.[0]?.message;

  const trace: {
    toolCalls: ToolTrace[];
    extracted: Record<string, unknown> | null;
    finalMessage: string | null;
    deterministic: DeterministicResult | null;
  } = { toolCalls: [], extracted: null, finalMessage: null, deterministic: null };

  if (!message?.tool_calls?.length) {
    trace.finalMessage = message?.content || null;
    return NextResponse.json({ trace });
  }

  const extractedAccum: Record<string, unknown> = { ...(body.extractedSoFar ?? {}) };
  const toolResults: Record<string, unknown>[] = [];

  for (const tc of message.tool_calls) {
    const args = JSON.parse(tc.function.arguments);
    trace.toolCalls.push({ name: tc.function.name, args });
    let result: Record<string, unknown>;

    switch (tc.function.name) {
      case 'extract_booking':
        result = { extracted: true, ...args };
        Object.assign(extractedAccum, args);
        break;
      case 'calculate_route':
        try {
          result = await getMapboxRoute(args.pickup, args.dropoff, args.stops);
          Object.assign(extractedAccum, { route: result });
        } catch (e) {
          result = { error: 'Could not calculate route', detail: e instanceof Error ? e.message : 'unknown' };
        }
        break;
      case 'compare_pricing':
        result = calculateUberComparison(args);
        Object.assign(extractedAccum, { pricing: result });
        break;
      case 'confirm_details': {
        const draft: BookingDraft = mergeExtract(
          mergeExtract({ driverMinimum: Number(pricing.minimum) || undefined } as BookingDraft, extractedAccum),
          args as Record<string, unknown>,
        );
        const driverCashOnly = driver.cash_only === true;
        const driverAcceptsCash = driver.accepts_cash === true;
        if (driverCashOnly) draft.isCash = true;
        else if (!driverAcceptsCash) draft.isCash = false;

        const missing = missingSlots(draft, { cashOnly: driverCashOnly, acceptsCash: driverAcceptsCash }, {
          enforceMinPrice: cfg.deterministic.enforce_min_price,
          requirePaymentSlot: cfg.deterministic.require_payment_slot,
        });
        if (missing.length) {
          trace.deterministic = { action: 'incomplete', reason: missing.join(', '), payload: draft };
          result = { action: 'incomplete', missing, draft };
          break;
        }

        const window = computeBookingWindow(draft, { bufferMinutes: cfg.deterministic.buffer_minutes });
        if (!window) {
          trace.deterministic = { action: 'incomplete', reason: 'time unresolved', payload: draft };
          result = { action: 'incomplete', missing: ['time'], draft };
          break;
        }

        try {
          const avail = await checkDriverAvailability(driver.user_id as string, window.checkStart, window.checkEnd);
          if (!avail.available) {
            const why = avail.conflict ? 'conflict' : 'outside schedule';
            trace.deterministic = { action: 'unavailable', reason: why, payload: { draft, window } };
            result = { action: 'unavailable', error: why, draft };
            break;
          }
        } catch (e) {
          trace.deterministic = { action: 'unavailable', reason: 'availability check failed', payload: { error: String(e) } };
          result = { action: 'unavailable', error: 'check_failed' };
          break;
        }

        const bookingOut = {
          pickup: draft.pickup, dropoff: draft.dropoff,
          stops: draft.stops, roundTrip: draft.roundTrip,
          time: draft.timeRaw, resolvedTime: draft.timeIso, timeDisplay: draft.timeDisplay,
          isNow: draft.isNow,
          riderPrice: draft.riderPrice, price: draft.riderPrice,
          suggestedPrice: draft.suggestedPrice, driverMinimum: draft.driverMinimum,
          isCash: draft.isCash === true,
        };
        trace.deterministic = { action: 'details_confirmed', payload: { booking: bookingOut, window } };
        Object.assign(extractedAccum, bookingOut);
        result = { action: 'details_confirmed', booking: bookingOut, window };
        break;
      }
      case 'analyze_sentiment':
        // Test mode: do not write to schedule_events. Just echo.
        result = { flagged: true, ...args, __test_mode: 'db_write_skipped' };
        break;
      default:
        result = { error: 'Unknown tool' };
    }
    toolResults.push({ toolCallId: tc.id, name: tc.function.name, result });
  }

  // Follow-up completion so we get GPT's natural-language reply.
  const toolMessages: ChatMessage[] = [
    ...fullMessages,
    { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls },
    ...toolResults.map((tr) => ({
      role: 'tool' as const,
      tool_call_id: tr.toolCallId as string,
      content: JSON.stringify(tr.result),
    })),
  ];
  try {
    const followUp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: cfg.generative.model,
        messages: toolMessages,
        temperature: cfg.generative.temperature,
        max_tokens: 250,
      }),
    });
    if (followUp.ok) {
      const followData = await followUp.json();
      trace.finalMessage = followData.choices?.[0]?.message?.content || null;
    }
  } catch { /* final message is optional */ }

  trace.extracted = Object.keys(extractedAccum).length ? extractedAccum : null;

  return NextResponse.json({ trace });
}
