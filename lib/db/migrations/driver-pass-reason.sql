-- Driver pass reason + optional message.
--
-- hmu_posts captures the most recent pass on direct_booking flow so the
-- rider /rider/posts/[postId]/passed page can show it.
-- ride_interests captures per-driver pass on broadcast rider_request flow
-- (not rider-surfaced today — stored for future targeting + analytics).
--
-- Reasons whitelist: 'price' | 'distance' | 'booked' | 'other'.
-- Message: up to 140 chars, enforced at API layer.
--
-- Applied: 2026-04-24 to production (still-rain-53751745, neondb).

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS last_declined_reason TEXT;

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS last_declined_message TEXT;

ALTER TABLE hmu_posts
  DROP CONSTRAINT IF EXISTS hmu_posts_last_declined_reason_check;
ALTER TABLE hmu_posts
  ADD CONSTRAINT hmu_posts_last_declined_reason_check
  CHECK (last_declined_reason IS NULL OR last_declined_reason IN ('price', 'distance', 'booked', 'other'));

ALTER TABLE ride_interests
  ADD COLUMN IF NOT EXISTS pass_reason TEXT;

ALTER TABLE ride_interests
  ADD COLUMN IF NOT EXISTS pass_message TEXT;

ALTER TABLE ride_interests
  DROP CONSTRAINT IF EXISTS ride_interests_pass_reason_check;
ALTER TABLE ride_interests
  ADD CONSTRAINT ride_interests_pass_reason_check
  CHECK (pass_reason IS NULL OR pass_reason IN ('price', 'distance', 'booked', 'other'));
