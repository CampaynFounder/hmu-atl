import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

const DRIVER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_my_rides',
      description: 'Get the driver\'s recent rides with details. Call when they ask about rides, payments, or need context for a report.',
      parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Number of rides (default 5)' } } },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_payment_details',
      description: 'Get payment breakdown for a specific ride. Shows gross, Stripe fee, platform fee, waived fee, net payout.',
      parameters: { type: 'object', properties: { rideId: { type: 'string' } }, required: ['rideId'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pending_payments',
      description: 'Show driver\'s pending Stripe balance and explanation of hold periods.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_ticket',
      description: 'Create a support ticket for admin review. Call when the driver has described an issue that needs follow-up. Extract category, subject, and details from the conversation.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['rider_no_show', 'rider_aggressive', 'rider_damage', 'payment_question', 'payment_missing', 'dispute_response', 'other'] },
          rideId: { type: 'string', description: 'Related ride ID if applicable' },
          subject: { type: 'string', description: 'Short summary of the issue' },
          details: { type: 'string', description: 'Full details from conversation' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
        required: ['category', 'subject', 'details'],
      },
    },
  },
];

const RIDER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_my_rides',
      description: 'Get the rider\'s recent rides with details.',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_payment_history',
      description: 'Show rider\'s recent charges, holds, and refunds.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_ticket',
      description: 'Create a support ticket. Extract category, subject, and details from conversation.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['driver_no_show', 'driver_inappropriate', 'driver_unsafe', 'overcharged', 'route_issue', 'refund_request', 'other'] },
          rideId: { type: 'string' },
          subject: { type: 'string' },
          details: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
        required: ['category', 'subject', 'details'],
      },
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, conversationId } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      conversationId?: string;
    };

    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

    // Get user info
    const userRows = await sql`
      SELECT u.id, u.profile_type, u.market_id, u.chill_score, u.completed_rides,
             m.name as market_name, m.timezone
      FROM users u LEFT JOIN markets m ON m.id = u.market_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0] as Record<string, unknown>;
    const isDriver = user.profile_type === 'driver';
    const userId = user.id as string;
    const marketId = user.market_id as string;

    // Get user display name
    const nameRows = isDriver
      ? await sql`SELECT handle, display_name FROM driver_profiles WHERE user_id = ${userId} LIMIT 1`
      : await sql`SELECT handle, display_name FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`;
    const userName = (nameRows[0] as Record<string, unknown>)?.handle || (nameRows[0] as Record<string, unknown>)?.display_name || 'there';

    const tools = isDriver ? DRIVER_TOOLS : RIDER_TOOLS;
    const systemPrompt = buildSupportPrompt(isDriver, userName as string, user);

    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    // Call GPT
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: fullMessages, tools, tool_choice: 'auto', temperature: 0.7, max_tokens: 400 }),
    });

    if (!gptRes.ok) {
      const err = await gptRes.text();
      console.error('OpenAI support error:', err);
      return NextResponse.json({ error: 'AI unavailable' }, { status: 502 });
    }

    const gptData = await gptRes.json();
    const message = gptData.choices?.[0]?.message;

    // Handle tool calls
    if (message?.tool_calls?.length) {
      const toolResults: { toolCallId: string; name: string; result: Record<string, unknown> }[] = [];

      for (const tc of message.tool_calls as ToolCall[]) {
        const args = JSON.parse(tc.function.arguments);
        let result: Record<string, unknown>;

        switch (tc.function.name) {
          case 'get_my_rides': {
            const limit = args.limit || 5;
            const ridesQuery = isDriver
              ? sql`SELECT id, status, amount, final_agreed_price, add_on_total, driver_payout_amount, platform_fee_amount, stripe_fee_amount, is_cash, pickup_address, dropoff_address, created_at, ended_at
                    FROM rides WHERE driver_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`
              : sql`SELECT id, status, amount, final_agreed_price, add_on_total, is_cash, pickup_address, dropoff_address, created_at, ended_at
                    FROM rides WHERE rider_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
            const rides = await ridesQuery;
            result = {
              rides: rides.map((r: Record<string, unknown>) => ({
                id: r.id, status: r.status,
                price: Number(r.final_agreed_price || r.amount || 0),
                addOns: Number(r.add_on_total || 0),
                payout: Number(r.driver_payout_amount || 0),
                isCash: r.is_cash,
                pickup: r.pickup_address, dropoff: r.dropoff_address,
                date: r.created_at,
              })),
            };
            break;
          }

          case 'get_payment_details': {
            const rideRows = await sql`
              SELECT amount, final_agreed_price, add_on_total, driver_payout_amount,
                     platform_fee_amount, stripe_fee_amount, waived_fee_amount, is_cash,
                     status, pickup_address, dropoff_address, created_at
              FROM rides WHERE id = ${args.rideId} AND ${isDriver ? sql`driver_id = ${userId}` : sql`rider_id = ${userId}`} LIMIT 1
            `;
            if (!rideRows.length) { result = { error: 'Ride not found' }; break; }
            const r = rideRows[0] as Record<string, unknown>;
            result = {
              rideId: args.rideId,
              gross: Number(r.final_agreed_price || r.amount || 0) + Number(r.add_on_total || 0),
              stripeFee: Number(r.stripe_fee_amount || 0),
              platformFee: Number(r.platform_fee_amount || 0),
              waivedFee: Number(r.waived_fee_amount || 0),
              netPayout: Number(r.driver_payout_amount || 0),
              isCash: r.is_cash,
              status: r.status,
              formula: 'Gross - Stripe fee - Platform fee = Net payout',
            };
            break;
          }

          case 'get_pending_payments': {
            const dpRows = await sql`SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${userId} LIMIT 1`;
            const stripeId = (dpRows[0] as Record<string, unknown>)?.stripe_account_id as string;
            if (!stripeId) { result = { error: 'No payout account linked' }; break; }
            // Query our DB for recent completed rides
            const pendingRides = await sql`
              SELECT COUNT(*) as count, COALESCE(SUM(driver_payout_amount), 0) as total
              FROM rides WHERE driver_id = ${userId} AND status IN ('ended', 'completed') AND is_cash = false
            `;
            const p = pendingRides[0] as Record<string, unknown>;
            result = {
              digitalRides: Number(p.count || 0),
              digitalTotal: Number(p.total || 0),
              note: 'Stripe holds funds 1-2 days for new accounts. After your first payout, funds are usually available same day or next day.',
              action: 'Check your Cashout page for current available balance',
            };
            break;
          }

          case 'get_payment_history': {
            const charges = await sql`
              SELECT id, amount, final_agreed_price, add_on_total, status, is_cash, created_at
              FROM rides WHERE rider_id = ${userId} ORDER BY created_at DESC LIMIT 10
            `;
            result = {
              rides: charges.map((r: Record<string, unknown>) => ({
                id: r.id, status: r.status,
                charged: Number(r.final_agreed_price || r.amount || 0) + Number(r.add_on_total || 0),
                isCash: r.is_cash, date: r.created_at,
              })),
            };
            break;
          }

          case 'create_ticket': {
            const ticketRows = await sql`
              INSERT INTO support_tickets (user_id, category, ride_id, subject, details, severity, market_id, conversation_id)
              VALUES (${userId}, ${args.category}, ${args.rideId || null}, ${args.subject}, ${args.details}, ${args.severity || 'medium'}, ${marketId}, ${conversationId || null})
              RETURNING id
            `;
            const ticketId = (ticketRows[0] as { id: string }).id;
            result = { ticketId, status: 'created', message: 'Support ticket created — our team will follow up' };
            break;
          }

          default:
            result = { error: 'Unknown tool' };
        }
        toolResults.push({ toolCallId: tc.id, name: tc.function.name, result });
      }

      // Get GPT follow-up with tool results
      const toolMessages = [
        ...fullMessages,
        { role: 'assistant' as const, content: message.content || '', tool_calls: message.tool_calls },
        ...toolResults.map(tr => ({ role: 'tool' as const, tool_call_id: tr.toolCallId, content: JSON.stringify(tr.result) })),
      ];

      let followUpContent = 'How else can I help?';
      try {
        const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: toolMessages, temperature: 0.7, max_tokens: 400 }),
        });
        if (followUpRes.ok) {
          const followUpData = await followUpRes.json();
          followUpContent = followUpData.choices?.[0]?.message?.content || followUpContent;
        }
      } catch { /* use fallback */ }

      // Check if a ticket was created
      const ticketResult = toolResults.find(tr => tr.name === 'create_ticket');

      // Save conversation
      await saveConversation(userId, isDriver ? 'driver' : 'rider', marketId, messages, followUpContent, conversationId, ticketResult?.result?.category as string);

      return NextResponse.json({
        reply: followUpContent,
        ticketCreated: ticketResult ? ticketResult.result : null,
      });
    }

    // No tool calls
    await saveConversation(userId, isDriver ? 'driver' : 'rider', marketId, messages, message?.content || '', conversationId);

    return NextResponse.json({ reply: message?.content || 'How can I help?' });
  } catch (error) {
    console.error('Support chat error:', error);
    return NextResponse.json({ error: 'Failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

async function saveConversation(
  userId: string, role: string, marketId: string,
  messages: { role: string; content: string }[],
  lastReply: string, existingId?: string, category?: string
): Promise<string> {
  const allMessages = [...messages.map(m => ({ role: m.role, content: m.content, at: new Date().toISOString() })),
    { role: 'assistant', content: lastReply, at: new Date().toISOString() }];

  if (existingId) {
    await sql`
      UPDATE support_conversations SET messages = ${JSON.stringify(allMessages)}::jsonb, updated_at = NOW()
        ${category ? sql`, category = ${category}` : sql``}
      WHERE id = ${existingId}
    `;
    return existingId;
  }

  const rows = await sql`
    INSERT INTO support_conversations (user_id, user_role, market_id, messages, category)
    VALUES (${userId}, ${role}, ${marketId}, ${JSON.stringify(allMessages)}::jsonb, ${category || null})
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

function buildSupportPrompt(isDriver: boolean, userName: string, user: Record<string, unknown>): string {
  const role = isDriver ? 'driver' : 'rider';
  const market = user.market_name || 'Atlanta';

  return `You are the HMU ATL support assistant for ${userName}, a ${role} in the ${market} market.

YOUR JOB:
- Help ${role}s with ride issues, payment questions, disputes, and safety reports
- Look up their rides and payments using tools — NEVER guess
- When they describe a problem, gather enough detail then create a support ticket
- Be empathetic but efficient — resolve what you can, escalate what you can't

WHAT YOU CAN DO:
- Look up rides and payment breakdowns
- Explain how fees and payouts work
- Create support tickets for admin follow-up
- Document safety concerns and disputes

WHAT YOU CANNOT DO:
- Issue refunds or change payment amounts
- Suspend or ban users
- Override dispute decisions
- Make promises about outcomes

TICKET CREATION:
- When the ${role} describes an issue, ask clarifying questions first
- Then create a ticket with: category, subject (short), details (full story), severity
- Severity guide: low = question, medium = issue affecting one ride, high = repeated problem, critical = safety threat
- After creating a ticket, give them the ticket confirmation and tell them the team will follow up

TONE:
- Supportive, direct, not overly formal
- Atlanta casual — "got it", "for sure", "no worries"
- Never dismissive — every concern is valid
- EVERY response ends with a question or next step

RULES:
- NEVER say "one sec" or "let me check" — present tool results directly
- NEVER guess payment amounts — always call get_payment_details
- For safety concerns (aggressive, unsafe, damage), always create a ticket immediately
- Always confirm details before creating a ticket: "Just to make sure I got this right..."`;
}
