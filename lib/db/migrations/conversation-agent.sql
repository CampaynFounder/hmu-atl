-- Conversational SMS Agent — Phase 1 schema
-- Additive only. Gated by feature_flags.slug='conversation_agent' (seeded DISABLED).

-- ============================================================
-- 1. Persona definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  gender_match TEXT NOT NULL CHECK (gender_match IN ('female','male','nonbinary','any')),
  user_type_match TEXT NOT NULL CHECK (user_type_match IN ('driver','rider','any')),
  greeting_template TEXT NOT NULL,
  vision_template TEXT,
  system_prompt TEXT NOT NULL,
  max_messages_per_thread INT NOT NULL DEFAULT 3,
  quiet_hours_start TIME NOT NULL DEFAULT '21:00',
  quiet_hours_end TIME NOT NULL DEFAULT '09:00',
  follow_up_schedule_hours INT[] NOT NULL DEFAULT '{24,168}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- ============================================================
-- 2. Global config (singleton — id is always 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_agent_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  first_message_delay_minutes INT NOT NULL DEFAULT 10,
  quiet_hours_start TIME NOT NULL DEFAULT '21:00',
  quiet_hours_end TIME NOT NULL DEFAULT '09:00',
  quiet_hours_enforced BOOLEAN NOT NULL DEFAULT TRUE,
  opt_in_required BOOLEAN NOT NULL DEFAULT TRUE,
  opt_in_disclosure_text TEXT NOT NULL DEFAULT 'By checking this you agree to receive SMS from HMU. Reply STOP to opt out. Msg & data rates may apply.',
  stop_acknowledgment_text TEXT NOT NULL DEFAULT 'You''re unsubscribed. No more texts. Reply START to opt back in.',
  vision_trigger TEXT NOT NULL DEFAULT 'first_reply' CHECK (vision_trigger IN ('first_reply','immediate','manual')),
  rider_narrative_style TEXT NOT NULL DEFAULT 'relationship' CHECK (rider_narrative_style IN ('value','trust','relationship')),
  claude_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_inbound_per_thread INT NOT NULL DEFAULT 10,
  claude_rate_limit_seconds INT NOT NULL DEFAULT 300,
  daily_spend_cap_cents INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- ============================================================
-- 3. Threads (one per user + persona)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES conversation_personas(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','dormant','opted_out','closed','manual')),
  phone TEXT NOT NULL,
  market_slug TEXT,
  messages_sent INT NOT NULL DEFAULT 0,
  messages_received INT NOT NULL DEFAULT 0,
  last_outbound_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  vision_delivered_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user ON conversation_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_phone ON conversation_threads(phone);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_status ON conversation_threads(status, last_outbound_at);

-- ============================================================
-- 4. Messages (full audit trail — inbound + outbound)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT NOT NULL,
  generated_by TEXT CHECK (generated_by IN ('template','claude','human')),
  voipms_id TEXT,
  delivery_status TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread ON conversation_messages(thread_id, sent_at);

-- ============================================================
-- 5. Scheduled outbound queue (cron drains this)
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('greeting','follow_up','vision')),
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scheduled_outbound_due ON scheduled_outbound_messages(status, send_at) WHERE status = 'pending';

-- ============================================================
-- 6. users.opt_in_sms — explicit TCPA opt-in
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS opt_in_sms BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 7. Feature flag + global config + seed personas
-- ============================================================
INSERT INTO feature_flags (slug, name, description, enabled)
VALUES (
  'conversation_agent',
  'Conversational SMS Agent',
  'Post-signup SMS conversation with gender/type-aware personas (Tenay, Trell, Sky). OFF = no outbound SMS from agent.',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO conversation_agent_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_personas (slug, display_name, gender_match, user_type_match, greeting_template, vision_template, system_prompt, sort_order)
VALUES
  ('tenay', 'Tenay', 'female', 'any',
   'Hey I''m Tenay 👋 welcome to HMU. Thanks for rolling with us. No rush — just saying hi. How''s your day going?',
   'Real quick on the why: HMU makes drivers actually profitable. You do the work, you keep the money. That''s the whole thing. Hit me back whenever.',
   E'You are Tenay, a friendly concierge for HMU Cash Ride in Atlanta. You text new users to welcome them personally. Text like a real person — short, warm, lowercase where it reads natural, no corporate voice. Hard rules: do not claim specific earnings, prices, rates, or features. If asked anything about payments, legal issues, disputes, or specific money questions, reply "a real person from the team will hit you up on this" and stop responding. Keep every message under 155 characters. If directly asked whether you are a real person, say you are a concierge working with the HMU team. Never pretend to be human outright.',
   10),
  ('trell', 'Trell', 'male', 'any',
   'Hey I''m Trell 🤙 welcome to HMU fam. Thanks for signing up. No pressure — just saying what up. How''s everything?',
   'Quick why: HMU makes drivers actually profitable. You do the work. You keep the money. Simple. Holler when you need anything.',
   E'You are Trell, a friendly concierge for HMU Cash Ride in Atlanta. You text new users to welcome them personally. Text like a real person — short, warm, casual Atlanta voice, no corporate tone. Hard rules: do not claim specific earnings, prices, rates, or features. If asked about payments, legal issues, disputes, or specific money questions, reply "a real person from the team will hit you up on this" and stop responding. Keep every message under 155 characters. If directly asked whether you are a real person, say you are a concierge working with the HMU team. Never pretend to be human outright.',
   20),
  ('neutral', 'Sky', 'any', 'any',
   'Hey — I''m Sky from HMU. Thanks for signing up. No rush, just saying welcome. How''s everything?',
   'Heads up on the why: HMU makes drivers actually profitable. You do the work. You keep the money. That''s the whole pitch. Holler when you need anything.',
   E'You are Sky, a friendly concierge for HMU Cash Ride in Atlanta. You text new users to welcome them personally. Gender-neutral voice. Text like a real person — short, warm, casual, no corporate tone. Hard rules: do not claim specific earnings, prices, rates, or features. If asked about payments, legal issues, disputes, or specific money questions, reply "a real person from the team will hit you up on this" and stop responding. Keep every message under 155 characters. If directly asked whether you are a real person, say you are a concierge working with the HMU team. Never pretend to be human outright.',
   30)
ON CONFLICT (slug) DO NOTHING;
