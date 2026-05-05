-- Admin Dashboards (Phase 0) — superadmin-built configurable dashboards for admin roles.
-- See docs/ADMIN-DASHBOARDS-SPEC.md for the full design.
--
-- Three new tables:
--   admin_dashboards            - dashboard definitions (slug, scope, market binding)
--   admin_dashboard_blocks      - ordered list of blocks per dashboard
--   admin_dashboard_role_grants - which admin roles can view each dashboard
--
-- Plus: admin_notes gets a nullable target_user_id so the user.admin_notes
-- block can surface notes about a specific user. NULL keeps the existing
-- "scratchpad" semantics — the marketing notepad query continues to work
-- when it adds `AND target_user_id IS NULL`.

-- =============================================================================
-- admin_dashboards
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('user_detail', 'market_overview')),
  market_id UUID REFERENCES markets(id),    -- NULL = available across all markets
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE, -- code-seeded, not user-deletable
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_dashboards_scope ON admin_dashboards(scope);
CREATE INDEX IF NOT EXISTS idx_admin_dashboards_market ON admin_dashboards(market_id);

-- =============================================================================
-- admin_dashboard_blocks
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_dashboard_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES admin_dashboards(id) ON DELETE CASCADE,
  block_key TEXT NOT NULL,                  -- registry key, e.g. 'user.driver_areas'
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL,
  col_span INTEGER NOT NULL DEFAULT 12 CHECK (col_span BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_blocks_dashboard
  ON admin_dashboard_blocks(dashboard_id, sort_order);

-- =============================================================================
-- admin_dashboard_role_grants
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_dashboard_role_grants (
  dashboard_id UUID NOT NULL REFERENCES admin_dashboards(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dashboard_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_role_grants_role
  ON admin_dashboard_role_grants(role_id);

-- =============================================================================
-- admin_notes — extend with target_user_id for user.admin_notes block
-- =============================================================================
-- Existing semantics preserved: NULL target_user_id = the original
-- per-admin scratchpad (marketing notepad). A SET target_user_id = a note
-- about a specific user, surfaced by the user.admin_notes dashboard block.
ALTER TABLE admin_notes
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for "show notes about this user" queries.
CREATE INDEX IF NOT EXISTS idx_admin_notes_target_user
  ON admin_notes(target_user_id, updated_at DESC)
  WHERE archived_at IS NULL AND target_user_id IS NOT NULL;
