# Session Summary — March 28-29, 2026

## What Was Built

### Admin Portal — Phase 1 (per ADMIN-PORTAL.md spec)

| Page | Route | Status |
|---|---|---|
| Live Operations Dashboard | `/admin` | Built |
| Money Dashboard | `/admin/money` | Built |
| Dispute Queue | `/admin/disputes` | Built |
| User Management | `/admin/users` | Built |
| Marketing / Outreach | `/admin/marketing` | Built (not in spec — new) |
| Messages | `/admin/messages` | Built (not in spec — new) |

### Beyond-Spec Features Built This Session

1. **Marketing SMS Hub** (`/admin/marketing`)
   - Enter Numbers mode: paste phone numbers
   - Upload CSV mode: fb name, sms, sex, issue columns + extras
   - 7 pre-built message templates
   - UTM link builder with domain, path, source, medium, campaign dropdowns
   - Message + link sent as separate SMS (each under 160 chars)
   - New Signups tab: recent signups with time filter, multi-select, dismiss, bulk send
   - Dismissed signups persist in localStorage

2. **Message History** (`/admin/messages`)
   - Thread list: all conversations grouped by phone number
   - Unread badge on sidebar (polls every 30s)
   - Chat view: outbound (green) + inbound (dark) bubbles
   - Reply inline from conversation
   - Inbound SMS webhook: `/api/webhooks/voipms`

3. **User Growth Chart** (`/admin/users` → Growth tab)
   - Daily/weekly/monthly stacked bar chart (riders vs drivers)
   - Cumulative line chart
   - Summary cards: total, riders, drivers, active, pending

4. **Send SMS from User Profile** (`/admin/users` → user detail → Actions)
   - Inline message compose with 160 char limit

5. **Admin Grant/Revoke** (`/admin/users` → user detail → Actions)
   - Grant Admin / Revoke Admin button
   - ADMIN badge on user profiles

6. **Search Feature** (header bar, all pages)
   - Global spotlight search across 17 driver features
   - Fuzzy matching on name, description, keywords
   - Breadcrumb trail on each result
   - Search behavior tracked to `search_events` table

7. **Driver Guide Page** (`/guide/driver`)
   - 9-step visual walkthrough: promote link → upload video → rider books → payment confirmed → OTW → ride active → add-ons → end ride → cashout
   - Public page (no auth required)

8. **Rider Guide Page** (`/guide/rider`)
   - 8-step visual walkthrough: find driver → book → Pull Up → share location → BET → extras → complete → no hidden fees
   - Public page (no auth required)

9. **Auto Welcome SMS on Signup**
   - Drivers: "Welcome to HMU ATL! We're Atlanta-based and built this for you." + guide link
   - Riders: "Welcome to HMU ATL! We're Atlanta-based and value every rider's voice." + guide link
   - Fires after onboarding completion (profile creation)

10. **Stripe Connect Embedded Components** (`/driver/payout-setup`)
    - In-app payouts management (view balance, initiate payouts)
    - In-app account details management (edit payout methods)
    - Dark theme matching HMU aesthetic

11. **Cashout Slider** (`/driver/home`)
    - Adjustable payout amount with slider
    - Real-time fee breakdown (payout, instant fee, net receive)
    - Max button
    - Uses `instant_available` for pending funds

12. **Payout Account Management** (`/driver/payout-setup`)
    - View linked accounts
    - "Change Payout Account" opens Stripe Express dashboard
    - Stripe verification notice: "Go ahead — start picking up riders"

---

## Variances from ADMIN-PORTAL.md Spec

### Auth Model Change
| Spec | Implemented | Reason |
|---|---|---|
| `profile_type = 'admin'` | `is_admin` boolean column | Separates admin access from user role. Drivers can be admins without losing driver functionality. Eliminates `both` and `admin` profile types. |
| DB constraint `rider/driver/admin/both` | Constraint now `rider/driver` only | `is_admin` is a separate flag |

### Phase 1 Spec Gaps (not yet built)
| Feature | Spec Section | Status |
|---|---|---|
| Ably real-time updates on dashboard | 1.1 | Not connected — uses 15s polling instead |
| Route lines on map (driver→pickup) | 1.1 | Not built — map shows dots only |
| Failed payment capture alerts | 1.1 Alerts | Not queried |
| Stripe webhook failure alerts | 1.1 Alerts | Not queried |
| Pending in Stripe (aggregate balance) | 1.2 | Not queried from Stripe API |
| Cash vs digital ride split | 1.2 | Not shown |
| Chat history in dispute detail | 1.3 | Not fetched (ride_messages not queried) |
| Ably message history in disputes | 1.3 | URL stored but not rendered |
| GPS mismatch auto-flag | 1.3 | Not implemented |
| Partial refund with amount entry | 1.3 Actions | Button exists but amount field not built |
| Contact rider/driver from dispute | 1.3 Actions | Not built (can use user profile SMS) |
| Search by email | 1.4 | Email not in driver/rider profiles |
| Admin notes on user profiles | 1.4 | Not persisted (no column) |
| Stripe dashboard deep link | 1.4 | Built in payout setup, not in admin user view |

### Additions Not in Spec
| Feature | Why Added |
|---|---|
| Marketing SMS hub | User request — needed outreach tools |
| UTM link builder | User request — tracking SMS campaign performance |
| Message history + inbound SMS | User request — see replies to outreach |
| User growth chart | User request — visualize signups over time |
| Driver/Rider guide pages | User request — onboarding visual manual |
| Auto welcome SMS | User request — thank new users on signup |
| Global feature search | User request — help drivers find app features |
| Cashout slider | User request — adjustable payout amount |
| Stripe embedded components | User request — in-app payout management |
| `is_admin` separation | User request — admin without losing driver role |

---

## Database Changes Made

| Table/Column | Change | Migration |
|---|---|---|
| `admin_audit_log` | Created | `lib/db/migrations/admin-portal.sql` |
| `markets` | Created | `lib/db/migrations/admin-portal.sql` |
| `support_tickets` | Created | `lib/db/migrations/admin-portal.sql` |
| `search_events` | Created | Via Neon MCP (no migration file) |
| `sms_inbound` | Created | Via Neon MCP (no migration file) |
| `users.is_admin` | Added boolean column | Via Neon MCP |
| `users.market` | Added text column | `lib/db/migrations/admin-portal.sql` |
| `rides.market` | Added text column | `lib/db/migrations/admin-portal.sql` |
| `hmu_posts.market` | Added text column | `lib/db/migrations/admin-portal.sql` |
| `users_profile_type_check` | Changed to `rider/driver` only | Via Neon MCP |
| `db/types.ts ProfileType` | Still includes `admin/both` | Should clean up to match DB |

---

## Copy Changes

| Before | After | Where |
|---|---|---|
| COO (Coming Out Outside) | Pull Up | All user-facing UI (10 files) |
| Private Car Rides For Cash In Atlanta | Make Bank Trips not Blank Trips. Ride Scammers Hold the L. | OG descriptions, meta tags |
| Home (driver nav) | Cashout | Driver hamburger menu |
| Flat nav items | GO / RIDES / ME sections | Driver hamburger menu |
| Flat admin nav | MONITOR / ACT / GROW sections | Admin sidebar |

---

## Environment / Config Changes

| Change | Detail |
|---|---|
| Clerk Account Portal | Disabled (was causing `accounts.atl.hmucashride.com` redirects) |
| `/admin(.*)` in public routes | Admin routes bypass Clerk middleware (layout handles auth) |
| `/api/admin(.*)` in public routes | Admin API routes bypass Clerk middleware (helpers handle auth) |
| `/guide/(.*)` in public routes | Guide pages accessible without login |
| VoIP.ms webhook URL | `https://atl.hmucashride.com/api/webhooks/voipms` (POST) |
| NPM packages added | `@stripe/connect-js`, `@stripe/react-connect-js` |

---

## Stripe Analysis Summary

| Finding | Detail |
|---|---|
| Charge model | Direct charges on driver's connected account with manual capture |
| Fee timing | `application_fee_amount` set at capture time (BET), not hold (Pull Up) |
| Stripe is losses collector | Yes — 2.9% + $0.30 deducted from application_fee, not from driver |
| Instant payout limit | Platform has $0/day volume — contact Stripe support to increase |
| Pending vs available | New accounts have 1-2 day hold; `instant_available` shows frontable amount |
| Express account limitation | Cannot add/remove external accounts via API — must use Stripe dashboard |

---

## Fast-Follow Items

### P0 — Before Next User Signups
- [ ] Contact Stripe support to increase instant payout daily volume limit
- [ ] Configure VoIP.ms inbound SMS callback URL (POST to webhook)
- [ ] Clean up `ProfileType` in `db/types.ts` — remove `admin` and `both`
- [ ] Create migration file for `search_events` and `sms_inbound` tables
- [ ] Test welcome SMS end-to-end with a fresh signup

### P1 — Phase 1 Completion
- [ ] Connect Ably real-time to admin dashboard (replace 15s polling)
- [ ] Add route lines to map (driver→pickup Mapbox directions)
- [ ] Add chat history to dispute detail view
- [ ] Add partial refund amount field to dispute resolution
- [ ] Add failed payment capture alerts
- [ ] Add Stripe webhook failure monitoring
- [ ] Query Stripe API for aggregate pending balance across connected accounts
- [ ] Add email to user search (requires storing email in profiles)

### P2 — Phase 2 (per ADMIN-PORTAL.md)
- [ ] Analytics & Trends page (`/admin/analytics`)
- [ ] SMS Log & Cost Tracking page (`/admin/sms`)
- [ ] User Support Submission (in-app ticket system)
- [ ] Error & Health Monitoring (`/admin/health`)

### P3 — Phase 3
- [ ] Content Moderation queue
- [ ] Enhanced Support Inbox with GPT categorization
- [ ] Promo Codes & Referral Tracking
- [ ] Financial Reporting & Reconciliation
- [ ] Market Expansion admin tools

### Stripe Fixes
- [ ] Add `charge.refunded` webhook handler
- [ ] Add `charge.dispute.created` webhook handler (chargebacks)
- [ ] Add `payout.paid` / `payout.failed` webhook handlers
- [ ] Fix cancelled ride `36464c84` — authorized but never voided ($14.26 stuck)
- [ ] Implement post-capture cancellation refund flow
- [ ] Add daily reconciliation (Stripe balance vs DB records)

### UX Improvements
- [ ] Rider guide page — add rider features when rider profile flow exists
- [ ] Add rider search features to global spotlight search
- [ ] Admin user profile — add Stripe dashboard deep link
- [ ] Admin user profile — persist admin notes (needs column)
- [ ] Cash vs digital ride split in money dashboard
