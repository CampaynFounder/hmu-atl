-- Fix FK constraints on tables referencing users(id) so hard-deleting a user
-- doesn't require manual pre-deletion of dependent rows.
--
-- CASCADE  → rows owned by the user (search history, payment methods, etc.)
-- SET NULL → audit/reference rows that should survive with a null user link

-- ── search_events ────────────────────────────────────────────────────────────
ALTER TABLE search_events
  DROP CONSTRAINT IF EXISTS search_events_user_id_fkey;
ALTER TABLE search_events
  ADD CONSTRAINT search_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── rider_payment_methods ────────────────────────────────────────────────────
ALTER TABLE rider_payment_methods
  DROP CONSTRAINT IF EXISTS rider_payment_methods_rider_id_fkey;
ALTER TABLE rider_payment_methods
  ADD CONSTRAINT rider_payment_methods_rider_id_fkey
  FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── subscription_events ──────────────────────────────────────────────────────
ALTER TABLE subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_user_id_fkey;
ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── admin_audit_log ──────────────────────────────────────────────────────────
ALTER TABLE admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_admin_id_fkey;
ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_log_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_user_id_fkey;
ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── admin_action_items ───────────────────────────────────────────────────────
ALTER TABLE admin_action_items
  DROP CONSTRAINT IF EXISTS admin_action_items_user_id_fkey;
ALTER TABLE admin_action_items
  ADD CONSTRAINT admin_action_items_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_action_items
  DROP CONSTRAINT IF EXISTS admin_action_items_admin_id_fkey;
ALTER TABLE admin_action_items
  ADD CONSTRAINT admin_action_items_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── admin_growth_outreach ────────────────────────────────────────────────────
ALTER TABLE admin_growth_outreach
  DROP CONSTRAINT IF EXISTS admin_growth_outreach_admin_id_fkey;
ALTER TABLE admin_growth_outreach
  ADD CONSTRAINT admin_growth_outreach_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_growth_outreach
  DROP CONSTRAINT IF EXISTS admin_growth_outreach_recipient_id_fkey;
ALTER TABLE admin_growth_outreach
  ADD CONSTRAINT admin_growth_outreach_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── response_playbook_items ──────────────────────────────────────────────────
ALTER TABLE response_playbook_items
  DROP CONSTRAINT IF EXISTS response_playbook_items_created_by_fkey;
ALTER TABLE response_playbook_items
  ADD CONSTRAINT response_playbook_items_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE response_playbook_items
  DROP CONSTRAINT IF EXISTS response_playbook_items_admin_id_fkey;
ALTER TABLE response_playbook_items
  ADD CONSTRAINT response_playbook_items_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE response_playbook_items
  DROP CONSTRAINT IF EXISTS response_playbook_items_recipient_id_fkey;
ALTER TABLE response_playbook_items
  ADD CONSTRAINT response_playbook_items_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── admin_dashboards / grants ────────────────────────────────────────────────
ALTER TABLE admin_dashboards
  DROP CONSTRAINT IF EXISTS admin_dashboards_created_by_fkey;
ALTER TABLE admin_dashboards
  ADD CONSTRAINT admin_dashboards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_dashboard_grants
  DROP CONSTRAINT IF EXISTS admin_dashboard_grants_granted_by_fkey;
ALTER TABLE admin_dashboard_grants
  ADD CONSTRAINT admin_dashboard_grants_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── marketing_templates ──────────────────────────────────────────────────────
ALTER TABLE marketing_templates
  DROP CONSTRAINT IF EXISTS marketing_templates_created_by_fkey;
ALTER TABLE marketing_templates
  ADD CONSTRAINT marketing_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── content_variants ─────────────────────────────────────────────────────────
ALTER TABLE content_variants
  DROP CONSTRAINT IF EXISTS content_variants_approval_requested_by_fkey;
ALTER TABLE content_variants
  ADD CONSTRAINT content_variants_approval_requested_by_fkey
  FOREIGN KEY (approval_requested_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE content_variants
  DROP CONSTRAINT IF EXISTS content_variants_approved_by_fkey;
ALTER TABLE content_variants
  ADD CONSTRAINT content_variants_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── conversation_agent tables ────────────────────────────────────────────────
ALTER TABLE conversation_agent_templates
  DROP CONSTRAINT IF EXISTS conversation_agent_templates_created_by_fkey;
ALTER TABLE conversation_agent_templates
  ADD CONSTRAINT conversation_agent_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversation_agent_templates
  DROP CONSTRAINT IF EXISTS conversation_agent_templates_updated_by_fkey;
ALTER TABLE conversation_agent_templates
  ADD CONSTRAINT conversation_agent_templates_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversation_agent_scripts
  DROP CONSTRAINT IF EXISTS conversation_agent_scripts_updated_by_fkey;
ALTER TABLE conversation_agent_scripts
  ADD CONSTRAINT conversation_agent_scripts_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── driver/funnel playbook ───────────────────────────────────────────────────
ALTER TABLE driver_playbook_items
  DROP CONSTRAINT IF EXISTS driver_playbook_items_updated_by_fkey;
ALTER TABLE driver_playbook_items
  ADD CONSTRAINT driver_playbook_items_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE driver_playbook_item_versions
  DROP CONSTRAINT IF EXISTS driver_playbook_item_versions_created_by_fkey;
ALTER TABLE driver_playbook_item_versions
  ADD CONSTRAINT driver_playbook_item_versions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE driver_playbook_item_versions
  DROP CONSTRAINT IF EXISTS driver_playbook_item_versions_updated_by_fkey;
ALTER TABLE driver_playbook_item_versions
  ADD CONSTRAINT driver_playbook_item_versions_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_stages
  DROP CONSTRAINT IF EXISTS funnel_stages_created_by_fkey;
ALTER TABLE funnel_stages
  ADD CONSTRAINT funnel_stages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_stages
  DROP CONSTRAINT IF EXISTS funnel_stages_updated_by_fkey;
ALTER TABLE funnel_stages
  ADD CONSTRAINT funnel_stages_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_pages
  DROP CONSTRAINT IF EXISTS funnel_pages_created_by_fkey;
ALTER TABLE funnel_pages
  ADD CONSTRAINT funnel_pages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_pages
  DROP CONSTRAINT IF EXISTS funnel_pages_updated_by_fkey;
ALTER TABLE funnel_pages
  ADD CONSTRAINT funnel_pages_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_variants
  DROP CONSTRAINT IF EXISTS funnel_variants_created_by_fkey;
ALTER TABLE funnel_variants
  ADD CONSTRAINT funnel_variants_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_variants
  DROP CONSTRAINT IF EXISTS funnel_variants_updated_by_fkey;
ALTER TABLE funnel_variants
  ADD CONSTRAINT funnel_variants_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE funnel_zone_variants
  DROP CONSTRAINT IF EXISTS funnel_zone_variants_updated_by_fkey;
ALTER TABLE funnel_zone_variants
  ADD CONSTRAINT funnel_zone_variants_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── maintenance_mode ─────────────────────────────────────────────────────────
ALTER TABLE maintenance_mode
  DROP CONSTRAINT IF EXISTS maintenance_mode_updated_by_fkey;
ALTER TABLE maintenance_mode
  ADD CONSTRAINT maintenance_mode_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
