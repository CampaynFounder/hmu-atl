# HMU ATL — Admin Portal Specification

> Complete spec for the admin portal. Use this document as the single source of truth when building admin features.

---

## Access & Auth

- Route: `/admin` (protected by Clerk, `profile_type = 'admin'`)
- Only users with `profile_type = 'admin'` in the `users` table can access
- Admin actions are logged to `admin_audit_log` table (who did what, when)

---

## PHASE 1: Launch Essentials (Build First)

### 1.1 Live Operations Dashboard (`/admin`)

**Purpose:** Real-time view of platform health. This is the admin home screen.

**Map View (Mapbox):**
- All active rides plotted on map
- Color-coded markers by status:
  - Matched = blue
  - OTW = orange (show driver→pickup route line)
  - HERE = yellow (pulsing)
  - Confirming = orange (pulsing)
  - Active = green
- Click a marker to see: rider name, driver name, price, status, duration
- Stale ETA indicators: marker turns red if driver GPS >90s old

**Today's Stats (top bar):**
- Rides: matched / active / completed / cancelled / disputed
- Revenue: total captured, platform fees, fees waived
- Users: new signups today (rider/driver split)
- Active drivers: currently live / on a ride

**Alerts Panel:**
- Stale ETA rides (driver offline >90s during pickup)
- Failed payment captures
- New disputes (< 1 hour old)
- WEIRDO x3 flags
- Stripe webhook failures

**Data Source:**
- Rides: `SELECT * FROM rides WHERE status IN ('matched','otw','here','confirming','active') AND created_at > NOW() - INTERVAL '24 hours'`
- Stats: aggregate queries on `rides`, `users`, `transaction_ledger`
- Real-time: Ably subscription to `admin:feed` channel

---

### 1.2 Money Dashboard (`/admin/money`)

**Purpose:** See all money flowing through the platform.

**Daily/Weekly/Monthly Toggle:**

| Metric | Source |
|---|---|
| GMV (Gross Merchandise Value) | SUM of `final_agreed_price + add_on_total` for completed rides |
| Platform Revenue | SUM of `platform_fee_amount` from completed rides |
| Fees Waived (Launch Offer) | SUM of `waived_fee_amount` from completed rides |
| Stripe Processing Fees | SUM of `stripe_fee_amount` from completed rides |
| Net Platform Revenue | Platform Revenue - Stripe Fees |
| Driver Payouts | SUM of `driver_payout_amount` from completed rides |
| Pending in Stripe | Stripe API: sum of all connected account pending balances |
| Failed Captures | COUNT of rides where `payment_captured = false` and `status = 'ended'` |
| Refunds Issued | COUNT + SUM from `transaction_ledger` where `event_type = 'refund'` |

**Per-Ride Unit Economics:**
- Average ride price
- Average platform fee
- Average Stripe fee
- Average driver payout
- Average add-on total
- Cash vs digital ride split

**Charts:**
- Daily revenue line chart (30 days)
- GMV bar chart by week
- Fee tier distribution pie chart (10%/15%/20%/25% + HMU First 12%)

**Transaction Ledger Viewer:**
- Full searchable `transaction_ledger` table
- Filter by: ride ID, user ID, event type, direction, date range
- Export to CSV

---

### 1.3 Dispute Queue (`/admin/disputes`)

**Purpose:** Review and resolve disputes quickly with AI assist.

**Queue View:**
- Open disputes sorted by age (oldest first)
- Each card shows: ride ID, rider name, driver name, amount, time since filed
- Status filters: open, under_review, resolved_driver, resolved_rider, closed
- Priority flag: auto-escalated disputes (geo mismatch, WEIRDO flags)

**Dispute Detail View:**
- Full ride timeline: matched → OTW → HERE → active → ended → disputed
- Timestamps for each status change
- GPS data: driver route, pickup/dropoff locations, proximity at key moments
- Chat history (from `ride_messages`)
- Ably message history (72hr persistence)
- Financial details: amount held, amount captured, add-ons, fees
- Both user profiles (ratings, completed rides, dispute history)

**GPT-4o-mini Analysis:**
- Auto-generated summary: "Based on the timeline, the driver arrived at 8:15 PM, rider confirmed at 8:17 PM, ride lasted 12 minutes. The dispute was filed 5 minutes after ride ended. Chat shows [summary]."
- Recommendation: "This appears to be a [legitimate concern / retaliatory rating / misunderstanding]. Recommended action: [resolve for rider / resolve for driver / split]."
- Confidence score

**Actions:**
- Resolve for driver (release funds)
- Resolve for rider (full refund)
- Partial refund (enter amount)
- Escalate (flag for manual review)
- Add admin notes
- Contact rider/driver (pre-filled SMS via VOIP.ms)

**Auto-Flags (system-generated, appear in queue):**
- Rider disputes 3+ times → pattern flag
- Mutual WEIRDO within 5 min → retaliation flag
- GPS mismatch at ride end (>300ft) → geo flag
- Driver was offline >2 min before pulloff → stale flag

---

### 1.4 User Management (`/admin/users`)

**Purpose:** Search, view, and manage all user accounts.

**Search:**
- By name, handle, email, phone, Clerk ID, user ID
- Filters: profile type (rider/driver/admin), account status, tier, market

**User Profile View:**
- Account info: name, handle, email, phone, profile type, tier, status
- Clerk metadata sync status
- Stripe IDs: customer ID, Connect account ID
- Chill score, completed rides, dispute count
- OG status (riders), HMU First status (drivers)
- Video intro (playable)
- Member since date

**Ride History (within profile):**
- All rides for this user
- Expandable with full financial breakdown (same as driver rides page)

**Rating History:**
- All ratings received + given
- WEIRDO flag count + dates

**Actions:**
- Change account status: active / suspended / banned
- Change tier: free / hmu_first
- Grant/revoke OG status
- Reset chill score (after investigation)
- Send SMS to user (VOIP.ms)
- View Stripe dashboard link (deep link to their Connect account)
- Add admin notes

**Pending Activation Queue:**
- New drivers awaiting video intro review
- Video playback + approve / reject buttons
- Reject reason selector (inappropriate, can't verify identity, etc)

---

## PHASE 2: First Month

### 2.1 Analytics & Trends (`/admin/analytics`)

**User Acquisition:**
- Signups by day (line chart, rider vs driver)
- Signup source tracking (direct, referral, driver link, organic)
- Conversion funnel: signup → profile complete → first ride
- 7/14/30 day retention curves

**Ride Analytics:**
- Rides per day/week (line chart)
- Completion rate trend
- Average ride price trend
- Cash vs digital split over time
- Peak hours heat map (hour × day of week)
- Geographic heat map (pickup locations clustered)
- Funnel: browse → HMU → COO → OTW → completed (drop-off rates)
- Average time in each status (how long are drivers waiting at HERE?)

**Driver Analytics:**
- Active drivers per week (went live at least once)
- Average rides per active driver
- Top earners leaderboard
- Launch offer utilization: enrolled / cap used / projected cost
- Fee tier distribution over time
- HMU First conversion rate, churn rate
- Payout method distribution

**Revenue Analytics:**
- Revenue per ride trend
- Revenue by market
- CAC (cost to acquire): total SMS + offer cost / new active users
- LTV estimate: average revenue per user over 30/60/90 days

---

### 2.2 SMS Log & Cost Tracking (`/admin/sms`)

**Log Viewer:**
- Full `sms_log` table with search/filter
- Filter by: ride ID, user ID, event type, status, market, date range
- Show: to, from DID, message, status, error, retry count, timestamp

**Cost Dashboard:**
- Daily SMS count + estimated cost ($0.0075/SMS)
- Per-ride average SMS count
- SMS by event type breakdown (OTW notification vs ETA nudge vs quick message)
- Failed message rate
- Monthly projected SMS spend

---

### 2.3 User Support Submission (User-Facing, in Settings)

**User Side (`/rider/settings` and `/driver/settings`):**
- "Report an Issue" section
- Text field: "What happened?" (required, 500 char max)
- Category picker: Payment issue / Driver complaint / Rider complaint / Bug / Other
- Optional: attach screenshot (upload to R2)
- Auto-attach (hidden): user ID, last 3 ride IDs, device info (user agent), current ride if active
- Confirmation screen: "We got it. You'll hear back within 24 hours."

**Admin Side (`/admin/support`):**
- Ticket queue sorted by date
- Each ticket shows: user name, category, message preview, time since submitted
- Ticket detail: full message, screenshot, user profile link, recent rides
- Actions: reply (SMS), resolve, escalate, add internal note
- Status: open / in_progress / resolved / closed

---

### 2.4 Error & Health Monitoring (`/admin/health`)

**Stripe Health:**
- Webhook delivery status (success/failure rate)
- Failed captures list (ride ID, error, timestamp)
- Failed refunds list
- Chargeback alerts
- Connect account issues (incomplete onboarding, restricted accounts)

**Ably Health:**
- Channel count, message volume
- Connection count (active clients)
- Failed publishes from server

**API Health:**
- Error rate by endpoint (from Sentry)
- Slowest endpoints (P95 latency)
- 4xx vs 5xx split

**Dead Letter Queue:**
- Operations that failed and need manual intervention
- Payment captures that failed mid-process
- SMS that exhausted retries
- Webhook events that couldn't be processed

---

## PHASE 3: Growth

### 3.1 Content Moderation (`/admin/moderation`)

**Comment Queue:**
- Comments flagged by GPT-4o-mini sentiment analysis
- Show: comment text, sentiment score, flags, author, subject, ride
- Actions: approve, hide, warn user, suspend user

**Video Review Queue:**
- New driver video intros pending review
- Playback + approve / reject
- Rejection notifies driver with reason

**Profile Reports:**
- User-submitted reports about other users
- Link to both profiles + recent rides together

---

### 3.2 Support Inbox (`/admin/support` — enhanced)

- Full ticketing system
- Auto-categorize with GPT: parse message → assign category + priority
- Suggested responses: GPT generates draft based on category + context
- SLA tracking: time to first response, time to resolution
- Canned response library (editable)
- Bulk actions for common issues

---

### 3.3 Marketing & Promos (`/admin/marketing`)

**Promo Codes:**
- Create: code, type (flat $ / percentage), max uses, expiry date, market
- Track: uses, revenue impact
- Disable / expire

**Referral Tracking:**
- Who referred who (driver→driver, rider→rider, driver→rider)
- Credit status (pending / paid)
- Top referrers leaderboard

**Push Notifications (future — requires native app or web push):**
- Segment builder: all riders, all drivers, by market, by tier, by activity
- Message composer
- Schedule send
- Delivery + open rate tracking

---

### 3.4 Financial Reporting (`/admin/finance`)

- Monthly P&L: revenue, Stripe costs, SMS costs, infrastructure
- Tax prep: drivers earning >$600 (1099 data)
- Reconciliation: Stripe balance vs DB records
- Chargeback management: view, respond, track outcomes
- Export: CSV/PDF for accounting

---

## MARKET EXPANSION (Admin Features)

### Market Management (`/admin/markets`)

**Market List:**
- All markets with status: active / pre-launch / paused
- Per-market stats: drivers, riders, rides this week, revenue
- Health indicator: green (healthy supply/demand), yellow (imbalanced), red (critical)

**Market Setup Wizard:**
1. Name + slug + state + timezone
2. Geographic boundary (draw on Mapbox or enter zip codes)
3. Define neighborhoods/areas
4. Assign VOIP.ms DID
5. Set pricing: minimum ride price, platform fee overrides
6. Create launch offer for seed drivers
7. Generate assets: landing page, OG image, QR code, driver recruitment SMS template
8. Preview → activate

**Market Config:**
| Setting | What | Default |
|---|---|---|
| `min_ride_price` | Minimum digital ride price | $10 |
| `default_wait_minutes` | Driver wait time at HERE | 5 |
| `dispute_window_minutes` | Time rider has to dispute | 15 |
| `add_on_reserve_cap` | Max add-on reserve | $50 |
| `platform_fee_override` | Market-specific fee rate | null (use global) |
| `launch_offer_id` | Active launch offer for new drivers | null |
| `sms_did` | VOIP.ms DID for this market | required |

**Driver Recruitment Tools:**
- Bulk SMS invite: "Drive with HMU in [city]. First 15 rides fee-free."
- Signup link generator with market + promo code embedded
- Seed driver tracker: signed up → onboarded → went live → first ride
- Referral incentives per market

**Market Analytics:**
- Side-by-side comparison (ATL vs HOU)
- Growth curves overlay
- Revenue per market
- Supply/demand ratio per market
- Time to first ride for new drivers

---

## DATABASE ADDITIONS FOR ADMIN

```sql
-- Markets
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  state TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  is_active BOOLEAN DEFAULT FALSE,
  launched_at TIMESTAMPTZ,
  did_phone TEXT,
  geo_center_lat NUMERIC(10,8),
  geo_center_lng NUMERIC(11,8),
  geo_radius_miles INTEGER DEFAULT 50,
  areas TEXT[],
  min_ride_price NUMERIC(10,2) DEFAULT 10,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin audit log
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category TEXT CHECK (category IN ('payment','driver_complaint','rider_complaint','bug','other')),
  message TEXT NOT NULL,
  screenshot_url TEXT,
  device_info TEXT,
  ride_id UUID REFERENCES rides(id),
  status TEXT CHECK (status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
  admin_id UUID REFERENCES users(id),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add market to existing tables (non-breaking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
ALTER TABLE hmu_posts ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
```

---

## GPT-4o-mini INTEGRATION POINTS

| Feature | Prompt Pattern | Input | Output |
|---|---|---|---|
| Dispute analysis | "Analyze this ride dispute..." | Chat history, GPS data, timeline, amounts | Summary + recommendation + confidence |
| Comment moderation | "Rate this comment's sentiment..." | Comment text | Score (0-1), flags[], safe (bool) |
| Support categorization | "Categorize this support ticket..." | User message | Category, priority, suggested response |
| Admin search | "Convert to SQL..." | Natural language query | SQL query + human summary |
| Fraud detection | "Analyze this user's pattern..." | Ride history, ratings, disputes | Risk score, flags, recommendation |

---

## IMPLEMENTATION PROMPT

Use this prompt to request admin portal implementation:

```
Build the HMU ATL admin portal per the spec in ADMIN-PORTAL.md.

Read these files first:
1. ADMIN-PORTAL.md — the full spec
2. CLAUDE.md — tech stack and database schema
3. lib/db/client.ts — database connection
4. lib/ably/server.ts — Ably integration
5. lib/sms/textbee.ts — VOIP.ms SMS
6. lib/payments/escrow.ts — payment operations
7. lib/payments/fee-calculator.ts — fee calculation

Build Phase [1/2/3] in this order:
[list specific sections from the spec]

Requirements:
- Route under /admin, protected by Clerk profile_type = 'admin'
- Mobile-first (admin may check from phone)
- Dark theme matching existing HMU aesthetic
- Real-time updates via Ably where applicable
- All admin actions logged to admin_audit_log
- Do NOT modify existing rider/driver flows
```

---

*This document is the complete admin portal specification. Reference it for any admin-related implementation.*
