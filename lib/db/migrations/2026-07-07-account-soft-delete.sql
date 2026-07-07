-- Account soft-delete ("mark for deletion").
--
-- A user can delete their account: they lose all access and become invisible to
-- everyone else, but the row + all FK children (rides, payments, ratings) are
-- RETAINED for safety/legal reasons — never hard-deleted. The account moves to
-- the terminal `account_status = 'deleted'` state.
--
-- Re-signup with the same phone: `createUser` inserts ON CONFLICT (clerk_id) and
-- `users.phone` is intentionally NOT unique, so a returning person gets a brand
-- new Clerk id -> a brand new users row -> brand new Stripe customer/Connect,
-- payment methods, ride history. Zero cross-pollination by construction.
-- Admins correlate the old <-> new rows by phone number.
--
-- deleted_at     — when the account was marked for deletion (audit).
-- deletion_source — 'self' (user-initiated), 'admin', or 'clerk' (Clerk-side
--                   user.deleted webhook). NULL for never-deleted rows.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_source TEXT;

-- Widen the account_status CHECK to allow the new terminal 'deleted' state.
-- (Live constraint today: pending_activation | active | suspended | banned.)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('pending_activation', 'active', 'suspended', 'banned', 'deleted'));

-- Cheap admin "old <-> new account" correlation by phone, and cheap "list
-- deleted accounts" scans. Partial so they stay small.
CREATE INDEX IF NOT EXISTS idx_users_phone_notnull ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at    ON users (deleted_at) WHERE deleted_at IS NOT NULL;

COMMIT;
