-- Wallet payment methods (Cash App Pay, Link, bank) have no card last4, but the
-- column was NOT NULL — so POST /api/rider/payment-methods/complete-setup threw
-- "null value in column last4 violates not-null constraint" whenever a rider
-- added a non-card method. Make it nullable; the UI labels by type/brand.
ALTER TABLE rider_payment_methods ALTER COLUMN last4 DROP NOT NULL;
