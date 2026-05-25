-- public_blast_drafts: server-side blast draft storage for the in-app browser
-- cross-browser handoff flow. Blast form saves here before routing to sign-up;
-- /auth-callback/blast fetches back when localStorage is empty (different browser).
-- 45-min TTL > Clerk sign-up time. Expired rows cleaned by expires_at index.

CREATE TABLE IF NOT EXISTS public_blast_drafts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_data  JSONB       NOT NULL,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '45 minutes'
);

CREATE INDEX IF NOT EXISTS public_blast_drafts_expires_idx
  ON public_blast_drafts (expires_at);
