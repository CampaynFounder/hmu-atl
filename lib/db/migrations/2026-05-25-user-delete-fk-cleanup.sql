-- Fix FK constraints on tables referencing users(id).
--
-- CASCADE  → rows owned by the user (deleted when user is deleted)
-- SET NULL → audit/reference rows that survive with a null user link
--
-- Each SET NULL block uses a DO guard so the migration is safe even if
-- a column doesn't exist in this environment (schema drift between envs).

-- ── search_events ─────────────────────────────────────────────────────────
-- Confirmed blocker: search_events_user_id_fkey had no ON DELETE behavior.
ALTER TABLE search_events
  DROP CONSTRAINT IF EXISTS search_events_user_id_fkey;
ALTER TABLE search_events
  ADD CONSTRAINT search_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── rider_payment_methods ──────────────────────────────────────────────────
ALTER TABLE rider_payment_methods
  DROP CONSTRAINT IF EXISTS rider_payment_methods_rider_id_fkey;
ALTER TABLE rider_payment_methods
  ADD CONSTRAINT rider_payment_methods_rider_id_fkey
  FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── subscription_events ────────────────────────────────────────────────────
ALTER TABLE subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_user_id_fkey;
ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── admin_audit_log (admin_id only — no user_id column) ───────────────────
ALTER TABLE admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_admin_id_fkey;
ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_log_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── support_tickets ────────────────────────────────────────────────────────
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_admin_id_fkey;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── Reference columns — guarded DO blocks ─────────────────────────────────
-- Each block checks the column exists before touching the constraint so the
-- migration is safe against environments where a column was never added.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_growth_outreach' AND column_name='admin_id') THEN
    ALTER TABLE admin_growth_outreach DROP CONSTRAINT IF EXISTS admin_growth_outreach_admin_id_fkey;
    ALTER TABLE admin_growth_outreach ADD CONSTRAINT admin_growth_outreach_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_growth_outreach' AND column_name='recipient_id') THEN
    ALTER TABLE admin_growth_outreach DROP CONSTRAINT IF EXISTS admin_growth_outreach_recipient_id_fkey;
    ALTER TABLE admin_growth_outreach ADD CONSTRAINT admin_growth_outreach_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='response_playbook_items' AND column_name='created_by') THEN
    ALTER TABLE response_playbook_items DROP CONSTRAINT IF EXISTS response_playbook_items_created_by_fkey;
    ALTER TABLE response_playbook_items ADD CONSTRAINT response_playbook_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='response_playbook_items' AND column_name='admin_id') THEN
    ALTER TABLE response_playbook_items DROP CONSTRAINT IF EXISTS response_playbook_items_admin_id_fkey;
    ALTER TABLE response_playbook_items ADD CONSTRAINT response_playbook_items_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='response_playbook_items' AND column_name='recipient_id') THEN
    ALTER TABLE response_playbook_items DROP CONSTRAINT IF EXISTS response_playbook_items_recipient_id_fkey;
    ALTER TABLE response_playbook_items ADD CONSTRAINT response_playbook_items_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_dashboards' AND column_name='created_by') THEN
    ALTER TABLE admin_dashboards DROP CONSTRAINT IF EXISTS admin_dashboards_created_by_fkey;
    ALTER TABLE admin_dashboards ADD CONSTRAINT admin_dashboards_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_dashboard_grants' AND column_name='granted_by') THEN
    ALTER TABLE admin_dashboard_grants DROP CONSTRAINT IF EXISTS admin_dashboard_grants_granted_by_fkey;
    ALTER TABLE admin_dashboard_grants ADD CONSTRAINT admin_dashboard_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marketing_templates' AND column_name='created_by') THEN
    ALTER TABLE marketing_templates DROP CONSTRAINT IF EXISTS marketing_templates_created_by_fkey;
    ALTER TABLE marketing_templates ADD CONSTRAINT marketing_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content_variants' AND column_name='approval_requested_by') THEN
    ALTER TABLE content_variants DROP CONSTRAINT IF EXISTS content_variants_approval_requested_by_fkey;
    ALTER TABLE content_variants ADD CONSTRAINT content_variants_approval_requested_by_fkey FOREIGN KEY (approval_requested_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content_variants' AND column_name='approved_by') THEN
    ALTER TABLE content_variants DROP CONSTRAINT IF EXISTS content_variants_approved_by_fkey;
    ALTER TABLE content_variants ADD CONSTRAINT content_variants_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_agent_templates' AND column_name='created_by') THEN
    ALTER TABLE conversation_agent_templates DROP CONSTRAINT IF EXISTS conversation_agent_templates_created_by_fkey;
    ALTER TABLE conversation_agent_templates ADD CONSTRAINT conversation_agent_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_agent_templates' AND column_name='updated_by') THEN
    ALTER TABLE conversation_agent_templates DROP CONSTRAINT IF EXISTS conversation_agent_templates_updated_by_fkey;
    ALTER TABLE conversation_agent_templates ADD CONSTRAINT conversation_agent_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_agent_scripts' AND column_name='updated_by') THEN
    ALTER TABLE conversation_agent_scripts DROP CONSTRAINT IF EXISTS conversation_agent_scripts_updated_by_fkey;
    ALTER TABLE conversation_agent_scripts ADD CONSTRAINT conversation_agent_scripts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_playbook_items' AND column_name='updated_by') THEN
    ALTER TABLE driver_playbook_items DROP CONSTRAINT IF EXISTS driver_playbook_items_updated_by_fkey;
    ALTER TABLE driver_playbook_items ADD CONSTRAINT driver_playbook_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_playbook_item_versions' AND column_name='created_by') THEN
    ALTER TABLE driver_playbook_item_versions DROP CONSTRAINT IF EXISTS driver_playbook_item_versions_created_by_fkey;
    ALTER TABLE driver_playbook_item_versions ADD CONSTRAINT driver_playbook_item_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_playbook_item_versions' AND column_name='updated_by') THEN
    ALTER TABLE driver_playbook_item_versions DROP CONSTRAINT IF EXISTS driver_playbook_item_versions_updated_by_fkey;
    ALTER TABLE driver_playbook_item_versions ADD CONSTRAINT driver_playbook_item_versions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_stages' AND column_name='created_by') THEN
    ALTER TABLE funnel_stages DROP CONSTRAINT IF EXISTS funnel_stages_created_by_fkey;
    ALTER TABLE funnel_stages ADD CONSTRAINT funnel_stages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_stages' AND column_name='updated_by') THEN
    ALTER TABLE funnel_stages DROP CONSTRAINT IF EXISTS funnel_stages_updated_by_fkey;
    ALTER TABLE funnel_stages ADD CONSTRAINT funnel_stages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_pages' AND column_name='created_by') THEN
    ALTER TABLE funnel_pages DROP CONSTRAINT IF EXISTS funnel_pages_created_by_fkey;
    ALTER TABLE funnel_pages ADD CONSTRAINT funnel_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_pages' AND column_name='updated_by') THEN
    ALTER TABLE funnel_pages DROP CONSTRAINT IF EXISTS funnel_pages_updated_by_fkey;
    ALTER TABLE funnel_pages ADD CONSTRAINT funnel_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_variants' AND column_name='created_by') THEN
    ALTER TABLE funnel_variants DROP CONSTRAINT IF EXISTS funnel_variants_created_by_fkey;
    ALTER TABLE funnel_variants ADD CONSTRAINT funnel_variants_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_variants' AND column_name='updated_by') THEN
    ALTER TABLE funnel_variants DROP CONSTRAINT IF EXISTS funnel_variants_updated_by_fkey;
    ALTER TABLE funnel_variants ADD CONSTRAINT funnel_variants_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='funnel_zone_variants' AND column_name='updated_by') THEN
    ALTER TABLE funnel_zone_variants DROP CONSTRAINT IF EXISTS funnel_zone_variants_updated_by_fkey;
    ALTER TABLE funnel_zone_variants ADD CONSTRAINT funnel_zone_variants_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='maintenance_mode' AND column_name='updated_by') THEN
    ALTER TABLE maintenance_mode DROP CONSTRAINT IF EXISTS maintenance_mode_updated_by_fkey;
    ALTER TABLE maintenance_mode ADD CONSTRAINT maintenance_mode_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
