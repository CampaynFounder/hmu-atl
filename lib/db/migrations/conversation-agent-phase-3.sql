-- Conversation Agent — Phase 3 schema
-- Applied via Neon MCP on 2026-04-19.
-- Additive only. Supports Claude-powered replies, per-thread follow-up tracking,
-- per-persona follow-up copy, and rolling daily Claude spend cap.

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS followups_sent INT NOT NULL DEFAULT 0;

ALTER TABLE conversation_personas
  ADD COLUMN IF NOT EXISTS follow_up_template TEXT;

ALTER TABLE conversation_agent_config
  ADD COLUMN IF NOT EXISTS claude_spend_today_cents INT NOT NULL DEFAULT 0;

ALTER TABLE conversation_agent_config
  ADD COLUMN IF NOT EXISTS claude_spend_reset_date DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE conversation_personas
SET follow_up_template = 'Hey it''s Tenay — just checkin in. No rush, just sayin hi again. Still here if you got questions.'
WHERE slug = 'tenay' AND follow_up_template IS NULL;

UPDATE conversation_personas
SET follow_up_template = 'Yo it''s Trell — checkin back. Holler whenever, I''m around.'
WHERE slug = 'trell' AND follow_up_template IS NULL;

UPDATE conversation_personas
SET follow_up_template = 'Sky here — just checking in. No pressure, around whenever you want.'
WHERE slug = 'neutral' AND follow_up_template IS NULL;
