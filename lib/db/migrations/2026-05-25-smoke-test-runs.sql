CREATE TABLE IF NOT EXISTS smoke_test_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  env           TEXT        NOT NULL CHECK (env IN ('staging', 'production')),
  market        TEXT        NOT NULL DEFAULT 'atl',
  triggered_by  TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'pass', 'fail')),
  results       JSONB,
  passed_count  INT         NOT NULL DEFAULT 0,
  failed_count  INT         NOT NULL DEFAULT 0,
  total_count   INT         NOT NULL DEFAULT 0,
  duration_ms   INT,
  commit_sha    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS smoke_test_runs_env_created  ON smoke_test_runs (env, created_at DESC);
CREATE INDEX IF NOT EXISTS smoke_test_runs_market        ON smoke_test_runs (market);
CREATE INDEX IF NOT EXISTS smoke_test_runs_status        ON smoke_test_runs (status);
