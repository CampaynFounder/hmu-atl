-- 2026-08-18-demo-accounts.sql
-- Admin-provisioned demo accounts + per-account OTP bypass codes.
--
-- Additive. The existing env-var reviewer flow (DEMO_LOGIN_PHONE / DEMO_LOGIN_CODE
-- / DEMO_PROVISION_SECRET) is untouched and still checked first — this table is a
-- second, DB-backed source so a superadmin can mint NEW demo accounts on demand
-- (any unique phone) with their own rotatable code, instead of a fixed env list.
--
-- Each demo account maps to a REAL Clerk user + Neon users row (fully functional,
-- active, NOT is_seed — they participate in matching like the reviewer accounts).
-- Deleting the registry row deactivates the demo account.
CREATE TABLE IF NOT EXISTS demo_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clerk_id    TEXT NOT NULL,
  phone       TEXT NOT NULL,              -- E.164, unique across demo accounts
  phone10     TEXT NOT NULL,              -- last-10 digits, for NANPA matching
  role        TEXT NOT NULL CHECK (role IN ('driver', 'rider')),
  otp_code    TEXT NOT NULL,              -- per-account bypass code (rotatable)
  market_id   UUID REFERENCES markets(id) ON DELETE SET NULL,
  label       TEXT,                        -- admin note (e.g. "QA driver", reviewer name)
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

-- One demo registry row per phone; fast lookup by last-10 for sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_accounts_phone10 ON demo_accounts(phone10);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_user ON demo_accounts(user_id);
