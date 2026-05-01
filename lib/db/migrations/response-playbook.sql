-- Response Playbook
-- Super-admin-curated Q&A library used by admins inside /admin/messages
-- to one-click send (Send) or pre-fill the reply box (Compose) when answering
-- inbound questions from drivers/riders. Long answers are split into ~150-char
-- SMS chunks at send time by lib/sms/chunk.ts.

CREATE TABLE IF NOT EXISTS response_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('driver', 'rider', 'any')) DEFAULT 'any',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_playbook_active_priority
  ON response_playbook(is_active, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_playbook_audience_active
  ON response_playbook(audience) WHERE is_active = TRUE;

-- Audit trail: which playbook entry was sent, by which admin, to which phone,
-- whether it was edited via Compose before sending, and how many SMS chunks
-- it became after splitting.
CREATE TABLE IF NOT EXISTS response_playbook_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID REFERENCES response_playbook(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES users(id),
  to_phone TEXT NOT NULL,
  recipient_id UUID REFERENCES users(id),
  chunk_count INTEGER NOT NULL DEFAULT 1,
  was_edited BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playbook_sends_playbook
  ON response_playbook_sends(playbook_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_playbook_sends_recipient
  ON response_playbook_sends(recipient_id, sent_at DESC);
