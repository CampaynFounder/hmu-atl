-- No-Show Protection — Phase 0 (evidence + audit scaffolding)
--
-- Rider protection for deposit mode: if a driver never shows (or shows far past
-- ETA) the rider must not lose their deposit, while a driver who genuinely
-- reached pickup stays protected. The verdict is arbitrated from GPS truth
-- (ride_locations) + two new evidence columns, and EVERY adjudication — even a
-- "no action" one — is written to an append-only audit table.
--
-- Phase 0 is additive and inert: columns are stamped and adjudications are
-- shadow-logged, but no money action is taken until a later phase flips the
-- per-market flag. All statements are IF NOT EXISTS so re-apply is a no-op and
-- column reads tolerate the ~40s window where the Worker deploys ahead of this
-- migration (PG 42703).
--
-- Apply with: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/2026-07-20-no-show-protection.sql

-- ============================================================
-- 1. Evidence columns on rides
-- ============================================================
-- The arrival deadline the whole system pivots on. Stamped ONCE at OTW
-- (otw_at + estimated drive time + grace) and never extended, so a driver
-- cannot reset it by re-going-OTW. Revives the intent of the dead
-- `otw_deadline` column with clearer semantics.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS arrival_deadline_at TIMESTAMPTZ;

-- First moment the driver's live GPS was verified within pickup proximity,
-- stamped by the location-ingestion route (NOT a driver tap — a no-showing
-- driver never taps HERE). Dwell = now - driver_arrived_at while still close.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_arrived_at TIMESTAMPTZ;

-- ============================================================
-- 2. Append-only adjudication audit log
-- Binds {GPS facts observed} -> {verdict} -> {money action} -> {actor/trigger}
-- with a frozen snapshot of the effective policy at decision time. Never
-- UPDATEd: a reversal writes a NEW row referencing the prior via supersedes_id,
-- so the trail is tamper-evident. This is the single source ops, driver-facing
-- "why was I dinged", and chargeback evidence all read from.
-- ============================================================
CREATE TABLE IF NOT EXISTS no_show_adjudications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  -- 'ride' (direct/blast/down_bad share the rides table) or 'delivery' (Phase 2).
  subject_type TEXT NOT NULL DEFAULT 'ride' CHECK (subject_type IN ('ride', 'delivery')),
  booking_type TEXT,                    -- direct_booking | blast | down_bad | delivery | ...

  -- What kicked off the adjudication.
  trigger TEXT NOT NULL CHECK (trigger IN (
    'rider_tap',        -- rider tapped "Driver's not here"
    'cron_deadline',    -- proactive deadline sweep
    'driver_pulloff',   -- driver claimed rider no-show
    'admin'             -- admin override / manual resolution
  )),
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = system/cron

  -- The verdict from adjudicateNoShow().
  verdict TEXT NOT NULL CHECK (verdict IN (
    'driver_no_show',   -- driver never verified-arrived by deadline -> rider protected
    'rider_no_show',    -- driver verified-arrived, rider absent -> driver protected
    'connection',       -- both present, couldn't connect -> no charge, escalate
    'en_route'          -- deadline not reached / driver still inbound -> no action yet
  )),

  -- Full rationale, frozen at decision time (rider/driver distances, dwell,
  -- staleness, here_verified, eta_used, proximity radius, deadline, etc.).
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Effective no-show policy config in force when the verdict was reached, so a
  -- charge can later be reproduced even after the config is edited.
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- What actually happened to the money.
  money_action TEXT NOT NULL DEFAULT 'none' CHECK (money_action IN (
    'none',                  -- no money moved (shadow mode, or en_route/connection)
    'void',                  -- rider hold released (driver no-show)
    'no_show_capture',       -- deposit captured (rider no-show)
    'blocked_driver_stale'   -- charge blocked because driver GPS was stale
  )),
  ledger_ref TEXT,           -- correlates to transaction_ledger rows / event_type
  ledger_write_ok BOOLEAN,   -- surfaces the swallowed-ledger-failure gap in the audit row
  stripe_pi TEXT,

  -- Was this a real enforcement decision or a Phase-0 shadow log (no action taken)?
  shadow BOOLEAN NOT NULL DEFAULT TRUE,

  -- Append-only correction chain.
  supersedes_id UUID REFERENCES no_show_adjudications(id) ON DELETE SET NULL,

  -- Admin resolution (for connection/dispute follow-up).
  admin_resolved_at TIMESTAMPTZ,
  admin_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_show_adj_ride ON no_show_adjudications(ride_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_no_show_adj_verdict ON no_show_adjudications(verdict, created_at DESC);
-- Ops queue: real (non-shadow) verdicts that moved money and aren't yet resolved.
CREATE INDEX IF NOT EXISTS idx_no_show_adj_open
  ON no_show_adjudications(created_at DESC)
  WHERE shadow = FALSE AND admin_resolved_at IS NULL AND money_action <> 'none';

-- ============================================================
-- 3. Platform defaults — one JSON blob under config_key='no_show'.
-- Per-market override via 'no_show:market:{slug}' merged by lib/payments/config
-- pattern. Superadmin edits via a no-code admin surface (later phase); server
-- reads through lib/platform-config/get.ts. All durations in seconds.
-- ============================================================
INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES (
  'no_show',
  '{
    "enabled": false,
    "arrival_grace_sec": 300,
    "min_dwell_sec": 180,
    "stale_sec": 120,
    "proximity_radius_ft": 300,
    "default_eta_floor_sec": 300,
    "eta_avg_speed_mph": 25,
    "rider_late_nudge": true,
    "driver_late_nudge": true,
    "rider_remedy": "void",
    "auto_void_after_sec": null
  }'::jsonb,
  'no-show-protection-phase0-seed'
)
ON CONFLICT (config_key) DO NOTHING;
