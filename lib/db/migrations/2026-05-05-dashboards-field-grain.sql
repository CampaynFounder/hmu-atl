-- Pivot dashboards from block-grain to field-grain (2026-05-05).
--
-- Rows in admin_dashboard_blocks now represent SECTIONS (titled groupings)
-- containing an ordered list of FIELD KEYS. The old block_key column is
-- repurposed as section_type — most rows will be 'fields' (a stat/list grid).
--
-- The 5 seeded builtins from yesterday are wiped here; reconcile re-seeds
-- them as field-based on next cold start. No human had built custom
-- dashboards yet so this is a safe hard cutover.

DELETE FROM admin_dashboard_blocks;

ALTER TABLE admin_dashboard_blocks RENAME COLUMN block_key TO section_type;
ALTER TABLE admin_dashboard_blocks ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE admin_dashboard_blocks ADD COLUMN IF NOT EXISTS field_keys TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_dashboard_blocks ALTER COLUMN section_type SET DEFAULT 'fields';
