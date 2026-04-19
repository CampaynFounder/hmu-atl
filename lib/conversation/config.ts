// Singleton global config for the conversation agent.
// Exactly one row with id=1 — enforced by CHECK (id=1) on the table.

import { sql } from '@/lib/db/client';

export type VisionTrigger = 'first_reply' | 'immediate' | 'manual';
export type RiderNarrativeStyle = 'value' | 'trust' | 'relationship';

export interface ConversationAgentConfig {
  id: number;
  first_message_delay_minutes: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_enforced: boolean;
  opt_in_required: boolean;
  opt_in_disclosure_text: string;
  stop_acknowledgment_text: string;
  vision_trigger: VisionTrigger;
  rider_narrative_style: RiderNarrativeStyle;
  claude_model: string;
  max_inbound_per_thread: number;
  claude_rate_limit_seconds: number;
  daily_spend_cap_cents: number | null;
  claude_spend_today_cents: number;
  claude_spend_reset_date: string;  // 'YYYY-MM-DD'
  updated_at: Date;
  updated_by: string | null;
}

// Admin-editable subset. Rolling spend counters are excluded — the orchestrator
// owns them.
export type ConfigUpdate = Omit<
  ConversationAgentConfig,
  'id' | 'updated_at' | 'updated_by' | 'claude_spend_today_cents' | 'claude_spend_reset_date'
>;

export async function getConfig(): Promise<ConversationAgentConfig> {
  const rows = await sql`SELECT * FROM conversation_agent_config WHERE id = 1 LIMIT 1`;
  if (!rows[0]) {
    // Defensive — migration seeds id=1, but re-seed if missing.
    await sql`INSERT INTO conversation_agent_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
    const again = await sql`SELECT * FROM conversation_agent_config WHERE id = 1 LIMIT 1`;
    return again[0] as ConversationAgentConfig;
  }
  return rows[0] as ConversationAgentConfig;
}

export async function updateConfig(update: ConfigUpdate, updatedBy: string): Promise<ConversationAgentConfig> {
  const rows = await sql`
    UPDATE conversation_agent_config
    SET
      first_message_delay_minutes = ${update.first_message_delay_minutes},
      quiet_hours_start = ${update.quiet_hours_start},
      quiet_hours_end = ${update.quiet_hours_end},
      quiet_hours_enforced = ${update.quiet_hours_enforced},
      opt_in_required = ${update.opt_in_required},
      opt_in_disclosure_text = ${update.opt_in_disclosure_text},
      stop_acknowledgment_text = ${update.stop_acknowledgment_text},
      vision_trigger = ${update.vision_trigger},
      rider_narrative_style = ${update.rider_narrative_style},
      claude_model = ${update.claude_model},
      max_inbound_per_thread = ${update.max_inbound_per_thread},
      claude_rate_limit_seconds = ${update.claude_rate_limit_seconds},
      daily_spend_cap_cents = ${update.daily_spend_cap_cents},
      updated_at = NOW(),
      updated_by = ${updatedBy}
    WHERE id = 1
    RETURNING *
  `;
  return rows[0] as ConversationAgentConfig;
}
