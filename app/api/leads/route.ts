import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { createActionItem } from '@/lib/admin/action-items';

export async function POST(request: NextRequest) {
  try {
    const { email, phone, lead_type, source, utm_source, utm_medium, utm_campaign, funnel_stage, audience, persona } = await request.json();

    if (!lead_type || !['driver', 'rider'].includes(lead_type)) {
      return NextResponse.json({ error: 'Invalid lead_type' }, { status: 400 });
    }

    if (!email && !phone) {
      return NextResponse.json({ error: 'Email or phone required' }, { status: 400 });
    }

    // Upsert by email+lead_type — update phone/funnel if provided on repeat visit
    const rows = await sql`
      INSERT INTO leads (email, phone, lead_type, source, utm_source, utm_medium, utm_campaign, funnel_stage, audience, persona)
      VALUES (${email || null}, ${phone || null}, ${lead_type}, ${source || 'landing_page'}, ${utm_source || null}, ${utm_medium || null}, ${utm_campaign || null}, ${funnel_stage || null}, ${audience || lead_type}, ${persona || null})
      ON CONFLICT (email, lead_type) WHERE email IS NOT NULL
      DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, leads.phone),
        utm_source = COALESCE(EXCLUDED.utm_source, leads.utm_source),
        utm_medium = COALESCE(EXCLUDED.utm_medium, leads.utm_medium),
        utm_campaign = COALESCE(EXCLUDED.utm_campaign, leads.utm_campaign),
        funnel_stage = COALESCE(EXCLUDED.funnel_stage, leads.funnel_stage),
        audience = COALESCE(EXCLUDED.audience, leads.audience),
        persona = COALESCE(EXCLUDED.persona, leads.persona)
      RETURNING id
    `;

    const leadId = rows[0]?.id;

    // Create action item for admin badge
    if (leadId) {
      await createActionItem({
        category: 'leads',
        itemType: 'new_lead',
        referenceId: leadId as string,
        title: `New ${lead_type} lead: ${email || phone}`,
      });
    }

    return NextResponse.json({ id: leadId, stored: true }, { status: 201 });
  } catch (error) {
    console.error('Lead capture error:', error);
    return NextResponse.json({ error: 'Failed to store lead' }, { status: 500 });
  }
}
