-- Marketing templates: add optional link column.
-- Lets admins save the outreach link alongside the message body so loading a
-- template populates both fields. Nullable + idempotent so re-runs are safe
-- and existing templates without a link keep working unchanged.

ALTER TABLE marketing_templates
  ADD COLUMN IF NOT EXISTS link TEXT;
