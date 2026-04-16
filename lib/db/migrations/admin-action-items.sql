-- Admin Action Items — badge count system for sidebar nav
-- Items are created when something needs admin attention, resolved when admin takes action.

CREATE TABLE IF NOT EXISTS admin_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,        -- 'users', 'disputes', 'support', 'leads'
  item_type TEXT NOT NULL,       -- 'new_signup', 'new_dispute', 'new_ticket', 'new_lead'
  reference_id TEXT NOT NULL,    -- user/dispute/lead ID
  title TEXT NOT NULL,           -- human-readable description
  priority TEXT DEFAULT 'info',  -- 'info', 'warning', 'urgent'
  resolved_at TIMESTAMPTZ,       -- null = unresolved = counts toward badge
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_unresolved ON admin_action_items(category) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_action_items_ref ON admin_action_items(reference_id, category);
