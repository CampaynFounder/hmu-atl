-- Add gender + pronouns to driver_profiles and rider_profiles.
-- Applied via Neon MCP on 2026-04-20.
-- Columns were declared in lib/db/types.ts and expected by UPDATE paths in
-- lib/db/profiles.ts, but never existed in the DB — so onboarding silently
-- dropped the fields and profile edit never persisted them.

ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS pronouns TEXT;
