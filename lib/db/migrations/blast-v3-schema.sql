-- Blast v3 — additive schema migration
-- Per docs/BLAST-V3-AGENT-CONTRACT.md §3 + §7 + §9 + §11.4 (non-regression).
-- Applied via Neon MCP on 2026-05-14 to staging branch (br-billowing-credit-ant8jp80).
-- All changes ADDITIVE: no DROP, no RENAME, no NOT NULL on existing tables.
-- hmu_counter_price kept alongside new counter_price; rename to drop the old column
-- happens in a follow-up PR after v3 ships and is verified.

-- ==========================================================================
-- 1. Extend blast_driver_targets
-- ==========================================================================
ALTER TABLE blast_driver_targets
  ADD COLUMN IF NOT EXISTS pull_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interest_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS counter_price NUMERIC(10,2);

-- Backfill: counter_price mirrors hmu_counter_price for already-stored rows.
-- New writers populate both columns during the transition window.
UPDATE blast_driver_targets
SET counter_price = hmu_counter_price
WHERE counter_price IS NULL AND hmu_counter_price IS NOT NULL;

-- ==========================================================================
-- 2. Extend users
-- ==========================================================================
-- last_sign_in_at + sign_in_count already exist; Clerk session.created webhook
-- (sub-phase 2.2) writes to them. gender_preference is the rider/driver-side
-- preference for who they prefer to ride/drive with — distinct from the
-- existing `gender` column which is the user's own gender.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender_preference JSONB
    DEFAULT '{"preferred": [], "strict": false}'::jsonb;

-- ==========================================================================
-- 3. Extend hmu_posts
-- ==========================================================================
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS duplicated_from_id UUID REFERENCES hmu_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nlp_parse_confidence NUMERIC(3,2);

-- ==========================================================================
-- 4. Extend markets with per-market blast config overrides
-- (Per project memory: per-market configurability is a product principle)
-- ==========================================================================
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS reward_function TEXT DEFAULT 'revenue_per_blast',
  ADD COLUMN IF NOT EXISTS feed_min_score_percentile INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counter_offer_max_pct NUMERIC(4,3) DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS nlp_chip_only BOOLEAN DEFAULT FALSE;

-- ==========================================================================
-- 5. NEW: driver_schedule_blocks
-- Calendar soft (rider select) / hard (rider pull-up) blocks during blast lifecycle.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS driver_schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blast_id UUID REFERENCES hmu_posts(id) ON DELETE SET NULL,
  blocked_from TIMESTAMPTZ NOT NULL,
  blocked_until TIMESTAMPTZ NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('soft', 'hard')),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_schedule_blocks_lookup
  ON driver_schedule_blocks (driver_id, blocked_from, blocked_until)
  WHERE released_at IS NULL;

-- ==========================================================================
-- 6. NEW: blast_config (per-market overrides; market_slug NULL = global default)
-- Replaces the v2 `platform_config['blast_matching_v1']` row pattern.
-- Read by InternalMatcher; written by /admin/blast-config UI.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug TEXT UNIQUE,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  hard_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_function TEXT NOT NULL DEFAULT 'revenue_per_blast',
  counter_offer_max_pct NUMERIC(4,3) NOT NULL DEFAULT 0.25,
  feed_min_score_percentile INTEGER NOT NULL DEFAULT 0,
  nlp_chip_only BOOLEAN NOT NULL DEFAULT FALSE,
  config_version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the global default row (idempotent)
INSERT INTO blast_config (market_slug, weights, hard_filters, limits)
VALUES (NULL,
  '{"proximity_to_pickup":0.30,"recency_signin":0.15,"last_location_recency":0.10,"sex_match":0.10,"chill_score":0.10,"profile_view_count":0.05,"completed_rides":0.05,"rating":0.10,"low_recent_pass_rate":0.05}'::jsonb,
  '{"max_distance_mi":5.0,"min_chill_score":50,"must_match_sex_preference":false,"must_be_signed_in_within_hours":72,"exclude_if_in_active_ride":true,"exclude_if_today_passed_count_gte":3}'::jsonb,
  '{"max_drivers_to_notify":10,"min_drivers_to_notify":3,"expand_radius_step_mi":1.0,"expand_radius_max_mi":15.0,"same_driver_dedupe_minutes":30}'::jsonb
)
ON CONFLICT (market_slug) DO NOTHING;

-- ==========================================================================
-- 7. NEW: blast_config_audit (1-click rollback support per contract §11.4)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug TEXT,
  config_snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_blast_config_audit_market_changed
  ON blast_config_audit (market_slug, changed_at DESC);

-- ==========================================================================
-- 8. NEW: blast_match_log (full candidate set per blast)
-- Source of truth for the matching funnel — every (blast, driver) pair logged
-- including ones not notified. Drives /admin/blast/[id] observability page.
-- Eventually trains the Stage 2 logistic regression.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_match_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  filter_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC(6,3),
  percentile_rank INTEGER,
  was_notified BOOLEAN DEFAULT FALSE,
  config_version INTEGER,
  provider_name TEXT,
  experiment_arm_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blast_match_log_blast ON blast_match_log (blast_id);
CREATE INDEX IF NOT EXISTS idx_blast_match_log_driver_recent ON blast_match_log (driver_id, created_at DESC);

-- ==========================================================================
-- 9. NEW: blast_driver_events (append-only event log per contract §9)
-- Time-series of every driver-facing event in the blast lifecycle:
-- candidate_considered, filter_failed, scored, notify_eligible, notify_skipped,
-- sms_sent, sms_delivered, sms_failed, push_sent, push_delivered,
-- feed_impression, deep_link_clicked, offer_page_viewed, hmu, counter, pass,
-- expired, selected, pull_up, rejected.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_driver_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  source TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blast_driver_events_blast ON blast_driver_events (blast_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_blast_driver_events_driver ON blast_driver_events (driver_id, occurred_at DESC);

-- ==========================================================================
-- 10. NEW: blast_experiment_log (Stage 1 ε-greedy bandit assignments)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_experiment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  assignment_seed TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blast_experiment_log_exp ON blast_experiment_log (experiment_id, occurred_at DESC);

-- ==========================================================================
-- 11. NEW: blast_model_versions (Stage 2 logistic regression artifacts)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS blast_model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_kind TEXT NOT NULL,
  coefficients JSONB NOT NULL,
  training_data_through TIMESTAMPTZ,
  auc NUMERIC(5,4),
  calibration JSONB,
  deployed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
