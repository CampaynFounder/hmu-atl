-- Admin market scoping (2026-04-30)
--
-- Lets a super admin restrict a non-super admin to a subset of markets.
-- The market dropdown in /admin/* and the /api/admin/markets response are
-- both filtered through this column. Super admins (admin_roles.is_super = true)
-- ignore this restriction entirely.
--
-- NULL  = unrestricted (default — super-style, sees every market)
-- []    = no markets (effectively locked out of market-scoped surfaces)
-- [...] = explicit allowlist

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_market_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN users.admin_market_ids IS
  'Admin-only: list of markets this admin can access. NULL = unrestricted (super-style); empty array = no markets (effectively locked out).';
