// POST /api/admin/disputes/[id]/analyze — GPT-4o-mini dispute analysis
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;

  const rows = await sql`
    SELECT
      d.reason, d.created_at as dispute_time,
      COALESCE(r.final_agreed_price, r.amount) as amount,
      r.status as ride_status, r.pickup, r.dropoff,
      r.created_at as ride_start, r.ended_at as ride_end,
      r.otw_at, r.here_at, r.coo_at, r.started_at,
      COALESCE(dp.display_name, dp.first_name) as driver_name,
      COALESCE(rp.display_name, rp.first_name) as rider_name,
      (SELECT COUNT(*) FROM disputes WHERE filed_by = u_filer.id) as filer_disputes,
      COALESCE(u_filer.completed_rides, 0) as filer_rides
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    LEFT JOIN users u_filer ON u_filer.id = d.filed_by
    WHERE d.id = ${id}
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const d = rows[0];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      analysis: {
        summary: 'OpenAI API key not configured. Manual review required.',
        recommendation: 'Configure OPENAI_API_KEY to enable AI analysis.',
        confidence: 0,
      },
    });
  }

  const prompt = `Analyze this ride dispute for the HMU ATL rideshare platform.

Ride Details:
- Price: $${d.amount}
- Ride status: ${d.ride_status}
- Pickup: ${JSON.stringify(d.pickup)}
- Dropoff: ${JSON.stringify(d.dropoff)}
- COO (rider paid): ${d.coo_at ?? 'N/A'}
- OTW: ${d.otw_at ?? 'N/A'}
- HERE: ${d.here_at ?? 'N/A'}
- Ride started: ${d.started_at ?? 'N/A'}
- Ride ended: ${d.ride_end ?? 'N/A'}
- Driver: ${d.driver_name}
- Rider: ${d.rider_name}

Dispute Details:
- Reason filed: ${d.reason ?? 'No reason given'}
- Filed at: ${d.dispute_time}
- Filer's total disputes: ${d.filer_disputes}
- Filer's completed rides: ${d.filer_rides}

Provide:
1. A factual summary of the timeline
2. A recommendation (resolve_for_driver / resolve_for_rider / partial_refund / escalate)
3. A confidence score (0-100)

Respond in JSON format: { "summary": "...", "recommendation": "...", "confidence": 0-100 }`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    const analysis = JSON.parse(data.choices[0].message.content);

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({
      analysis: {
        summary: 'AI analysis failed. Please review manually.',
        recommendation: 'escalate',
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
