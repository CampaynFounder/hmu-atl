-- Admin Permissions v2 — three-level permissions + two-person publish approval

-- Add approval config to roles
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS requires_publish_approval BOOLEAN DEFAULT FALSE;

-- Add approval tracking to content variants
ALTER TABLE content_variants ADD COLUMN IF NOT EXISTS approval_requested_by UUID REFERENCES users(id);
ALTER TABLE content_variants ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE content_variants ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;

-- Update seed roles to three-level format (view/edit/publish)
UPDATE admin_roles SET permissions = ARRAY[
  'grow.funnel.edit','grow.content.edit','grow.outreach.view','grow.leads.view','grow.messages.view'
], requires_publish_approval = TRUE WHERE slug = 'content_manager';

UPDATE admin_roles SET permissions = ARRAY[
  'act.support.edit','act.disputes.edit','act.users.view','act.notifications.edit'
] WHERE slug = 'support_agent';

UPDATE admin_roles SET permissions = ARRAY[
  'monitor.revenue.view','monitor.pricing.view','monitor.liveops.view','monitor.schedules.view'
] WHERE slug = 'finance';
