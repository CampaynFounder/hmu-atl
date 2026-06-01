-- Blast SMS copy: guarantee trip details (pickup→dropoff) in both the blast
-- notification and the "ride taken / cancelled" SMS, fitted under the 155-char
-- VoIP.ms cap (sendSms hard-truncates the tail, which drops the link).
--
-- These are forced UPDATEs, not INSERT ... ON CONFLICT DO NOTHING: the seed in
-- sql/sms-templates.sql only inserts when the row is absent, so once a row
-- exists (or an admin edits it via the no-code template UI) re-seeding can
-- never restore the trip-detail placeholders. This migration re-asserts the
-- canonical bodies. Admins can still override afterward via the template UI.
--
-- Char budget (worst case, with pickup/dropoff each ~20 chars from shortLabel):
--   blast_notify ≈ 130 chars, blast_taken ≈ 125 chars — both safely < 155.

UPDATE sms_templates
   SET body = 'New ride 🚨 ${{price}} {{pickup}}→{{dropoff}}. {{n_drivers}} drivers got this — first to HMU wins: {{link}}'
 WHERE event_key = 'blast_notify';

UPDATE sms_templates
   SET body = 'Your ${{price}} {{pickup}}→{{dropoff}} ride got snatched. Stay ready — more coming: {{app_link}}'
 WHERE event_key = 'blast_taken';
