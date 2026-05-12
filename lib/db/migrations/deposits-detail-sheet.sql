-- Deposits Detail Sheet feature flag
-- Gates the tappable "Your Deposits" tile on /driver/home that opens an
-- overlay with the deposit total, weekly/monthly bar chart, and trend line.
-- OFF = the tile stays static (current pre-launch behavior).

INSERT INTO feature_flags (slug, name, description, enabled)
VALUES (
  'driver_deposits_detail_sheet',
  'Driver Deposits Detail Sheet',
  'Makes the Your Deposits tile on /driver/home tappable. Opens an overlay with total deposits (count-up), a 6-bucket weekly/monthly bar chart with a 3-period trend line, and "best/vs-prior/streak" pills. OFF = static tile (current behavior).',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;
