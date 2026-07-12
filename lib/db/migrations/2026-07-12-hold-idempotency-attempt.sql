-- Payment-hold idempotency retry counter.
--
-- A Stripe idempotency key binds to its first request body for 24h. Our hold
-- keys were fixed per ride/blast (`hold_{rideId}_{amount}`,
-- `blast_deposit_{blastId}`), so once a decline bound the key to the failed
-- card, every retry reused the same key with a different body and Stripe
-- rejected it — making Pull Up permanently un-recoverable and driving a
-- cancel→rebook→cancel loop.
--
-- These counters are an increment-on-failure "retry generation" folded into the
-- idempotency key (see lib/payments/idempotency.ts). They are bumped ONLY after
-- a failed authorization, so:
--   * an accidental double-tap reuses the same key → Stripe dedupes to one hold
--   * a deliberate retry after a decline (new card OR same card topped up) gets
--     a fresh key → the request actually reaches Stripe
--
-- The application code reads/bumps these tolerantly (falls back to 0 if the
-- column is absent), so it is safe to deploy the code before or after this
-- migration; running it just unlocks the same-card-retry edge.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS hold_attempt INTEGER NOT NULL DEFAULT 0;

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS deposit_attempt INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN rides.hold_attempt IS
  'Retry generation for the ride payment hold; bumped only after a failed authorization. Folded into the Stripe idempotency key so a declined card can be retried without a key collision.';

COMMENT ON COLUMN hmu_posts.deposit_attempt IS
  'Retry generation for the blast deposit hold; bumped only after a failed authorization. Folded into the Stripe idempotency key.';
