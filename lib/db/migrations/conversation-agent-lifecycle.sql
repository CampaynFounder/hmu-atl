-- Conversation Agent — lifecycle-stage routing
-- Adds two columns to conversation_personas so a single persona can be scoped
-- to a specific lifecycle stage (signup / payment_setup / ready_idle / etc.)
-- and carry an explicit activation goal that the system prompt + admin UI can
-- both reference. Existing personas default to 'any' (current behavior — match
-- regardless of stage), so this migration is fully backward-compatible.
--
-- Apply: against staging first; verify pickPersonaForUser still selects the
-- existing 3 personas before flipping stage values on them.

ALTER TABLE conversation_personas
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'any'
    CHECK (lifecycle_stage IN ('any','signup','profile_incomplete','payment_setup','ready_idle','engaged','dormant'));

ALTER TABLE conversation_personas
  ADD COLUMN IF NOT EXISTS goal TEXT;

-- Helpful filter index — most queries select active personas filtered by
-- (gender_match, user_type_match, lifecycle_stage), so a composite index
-- speeds the picker.
CREATE INDEX IF NOT EXISTS idx_conversation_personas_routing
  ON conversation_personas (is_active, lifecycle_stage, user_type_match, gender_match);
