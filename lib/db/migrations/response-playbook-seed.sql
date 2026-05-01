-- Seed starter Response Playbook entries so admins aren't staring at an empty
-- picker on day one. Super admins should rewrite these in their own voice via
-- /admin/playbook — these are only meant to remove the cold-start.
--
-- Idempotent: each insert is gated on title not already existing so re-running
-- the migration is safe.

INSERT INTO response_playbook (title, question_text, answer_body, audience, priority, is_active)
SELECT * FROM (VALUES
  (
    'How does it work?',
    'how does this app work',
    'Local drivers, real cash, no surge — that''s HMU ATL. You post your ride, drivers nearby see it and ping you back if they want it. Pay through the app, rate after, done.',
    'rider',
    100,
    TRUE
  ),
  (
    'Why am I not getting rides?',
    'why no rides yet i posted',
    'New drivers start with a small visibility radius that grows after every completed ride. Make sure your photo, plate, and price are set, and post HMU in the app daily — that puts you back at the top of the rider feed.',
    'driver',
    90,
    TRUE
  ),
  (
    'When do I get paid?',
    'when is payday how do i cash out',
    'Free tier: payouts land the next morning at 6am ET. HMU First ($9.99/mo): instant payout after every single ride, plus a lower platform cap. You can switch tiers anytime in your driver settings.',
    'driver',
    80,
    TRUE
  ),
  (
    'How do I cash out?',
    'how do i get my money',
    'Open the app, hit the Earnings tab, then Cash Out. Bank, Cash App, Venmo, and Zelle are all free. Debit and PayPal carry a small fee. Most cash-outs land within minutes.',
    'driver',
    70,
    TRUE
  ),
  (
    'Is this safe?',
    'is hmu safe to use',
    'Every driver is phone-verified, video-introed, and reviewed by our team before going live. Riders rate drivers after every trip and we read every WEIRDO flag. If anything feels off, you can dispute the ride within 45 minutes.',
    'any',
    60,
    TRUE
  ),
  (
    'How much do drivers make?',
    'how much can i earn driving',
    'Drivers set their own prices, so it depends on what you charge and how often you''re live. Most active drivers in ATL are clearing $80–$200 a day. Daily and weekly platform-fee caps mean the more you drive, the more you keep.',
    'driver',
    50,
    TRUE
  )
) AS new_entries(title, question_text, answer_body, audience, priority, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM response_playbook rp WHERE rp.title = new_entries.title
);
