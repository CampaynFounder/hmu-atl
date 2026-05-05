-- Add 'user_grid' to admin_dashboards.scope (2026-05-05).
--
-- Grid dashboards: rows = users (filtered), columns = fields. Distinct from
-- the existing 'user_detail' (per-user fact sheet) — both kinds coexist.
-- Builder + viewer UX diverges by scope.

DO $$
DECLARE
  c TEXT;
BEGIN
  -- Find whatever PG named the scope CHECK and drop it.
  SELECT con.conname INTO c
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  WHERE cl.relname = 'admin_dashboards'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%scope%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_dashboards DROP CONSTRAINT %I', c);
  END IF;
END$$;

ALTER TABLE admin_dashboards
  ADD CONSTRAINT admin_dashboards_scope_check
  CHECK (scope IN ('user_detail', 'market_overview', 'user_grid'));
