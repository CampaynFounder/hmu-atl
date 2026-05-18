-- One active blast per rider, and a dedicated shortcode column.
--
-- 1. shortcode TEXT column on hmu_posts — normalises the value that was
--    previously only stored in areas[0] ('shortcode:XYZ') and
--    time_window->>'shortcode'. Backfill reads time_window first, then
--    falls back to parsing the areas array so no data is lost.
--    The expand route already references hp.shortcode; this makes it real.
--
-- 2. Partial unique index enforces one active blast per rider at the DB level.
--    Any attempt to INSERT a second active blast for the same user_id raises
--    a 23505 unique-violation, which the API catches and turns into a 409.
--    The API also pre-emptively cancels the old blast before inserting the
--    new one, so the constraint only fires as a safety net under races.

-- ── 1. Add shortcode column ──────────────────────────────────────────────────
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS shortcode TEXT;

-- Backfill from time_window JSON (canonical source), fall back to areas array.
UPDATE hmu_posts
SET shortcode = COALESCE(
  time_window->>'shortcode',
  (
    SELECT replace(elem, 'shortcode:', '')
    FROM unnest(areas) AS elem
    WHERE elem LIKE 'shortcode:%'
    LIMIT 1
  )
)
WHERE post_type = 'blast'
  AND shortcode IS NULL
  AND (
    time_window->>'shortcode' IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM unnest(areas) AS elem WHERE elem LIKE 'shortcode:%'
    )
  );

-- ── 2. One-active-blast-per-rider constraint ─────────────────────────────────
-- CONCURRENTLY avoids an exclusive table lock during index build, which is
-- safe for an online migration on a live table.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_one_active_blast_per_rider
  ON hmu_posts (user_id)
  WHERE post_type = 'blast'
    AND status = 'active';
