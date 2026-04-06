# HMU ATL — Screen Recording Guide

All recordings should be **vertical (9:16)** at **1080x1920** resolution.
Record on a real phone or use Chrome DevTools mobile mode at 390px width.

Place finished recordings in `public/recordings/`.
Place fallback screenshots in `public/screenshots/`.

---

## VIDEO 1: Driver Onboarding — "Start Earning on HMU"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `driver-onboarding-welcome.mp4` | Tap "Drive" on landing page → onboarding welcome screen appears | ~7s |
| 2 | `driver-onboarding-profile.mp4` | Fill in name, pronouns, phone number on profile step | ~6s |
| 3 | `driver-onboarding-vehicle.mp4` | Enter vehicle make/model/year, upload plate photo, vehicle photo | ~7s |
| 4 | `driver-onboarding-video-intro.mp4` | Tap record → film 5-second video intro → preview | ~7s |
| 5 | `driver-onboarding-areas.mp4` | Select service areas, set minimum price, choose schedule | ~6s |
| 6 | `driver-onboarding-payout.mp4` | Stripe Connect payout setup → link bank/debit | ~4s |
| 7 | `driver-onboarding-golive.mp4` | Dashboard loads with "Go Live" button → tap it | ~3s |

---

## VIDEO 2: Passenger Booking — "Find Your Ride"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `rider-feed-browse.mp4` | Rider home feed showing live drivers | ~5s |
| 2 | `rider-browse-filter.mp4` | Swiping through drivers, applying filters (area, price, chill score) | ~7s |
| 3 | `rider-driver-profile.mp4` | Tap driver card → full profile with video, vehicle, service menu | ~6s |
| 4 | `rider-post-request.mp4` | Post a ride request — enter pickup, dropoff, price | ~6s |
| 5 | `rider-match-chat.mp4` | Driver responds → match notification → chat opens | ~6s |
| 6 | `rider-chat-details.mp4` | Chat interface — send quick messages, discuss details | ~5s |
| 7 | `rider-coo-confirm.mp4` | Tap COO → payment hold confirmed → "Driver OTW" | ~5s |

---

## VIDEO 3: The Ride Experience — "OTW to Done"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `ride-otw-map.mp4` | Driver taps OTW → rider sees map with driver location | ~6s |
| 2 | `ride-here-notify.mp4` | HERE status → rider gets arrival notification | ~6s |
| 3 | `ride-bet-active.mp4` | Rider taps BET → ride status changes to Active | ~5s |
| 4 | `ride-active-map.mp4` | Active ride screen — live map, chat button, ETA | ~7s |
| 5 | `ride-addons-menu.mp4` | Open add-ons menu mid-ride, browse driver services, add a stop | ~8s |
| 6 | `ride-addon-confirm.mp4` | Select add-on → see price → confirm → total updates | ~6s |
| 7 | `ride-end.mp4` | Driver taps End Ride → completion screen with cost breakdown | ~6s |
| 8 | `ride-rating.mp4` | Rating screen — tap CHILL or Cool AF | ~6s |

---

## VIDEO 4: In-Ride Add-Ons — "More Than a Ride"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `addons-driver-menu-setup.mp4` | Driver adding items to service menu (name, price, icon) | ~6s |
| 2 | `addons-rider-browse.mp4` | Rider browsing add-ons during an active ride | ~6s |
| 3 | `addons-tap-confirm.mp4` | Tap an add-on → price popup → confirm | ~6s |
| 4 | `addons-ride-total.mp4` | Ride total screen with add-on line items visible | ~6s |
| 5 | `addons-driver-earnings.mp4` | Driver earnings page showing add-on revenue included | ~6s |

---

## VIDEO 5: Chat Booking — "Talk First, Ride After"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `chat-share-link.mp4` | Copy/share a driver's public profile link (`/d/handle`) | ~6s |
| 2 | `chat-driver-profile.mp4` | Open the link → see driver profile with "Book" button | ~6s |
| 3 | `chat-messaging.mp4` | Chat interface with quick messages being sent | ~6s |
| 4 | `chat-negotiate.mp4` | Price negotiation happening in chat | ~6s |
| 5 | `chat-confirm-otw.mp4` | Tap COO → confirmation → driver is OTW | ~6s |

---

## VIDEO 6: Driver Earnings — "Keep Your Bag"

| # | Filename | What to Record | Duration |
|---|----------|----------------|----------|
| 1 | `earnings-dashboard.mp4` | Driver earnings dashboard overview | ~6s |
| 2 | `earnings-ride-breakdown.mp4` | Single ride detail — "You kept $X / HMU took $X" | ~6s |
| 3 | `earnings-cap-hit.mp4` | Daily cap hit moment — $0 fee, celebration UI | ~6s |
| 4 | `earnings-hmu-first.mp4` | HMU First upgrade page — benefits, pricing | ~6s |
| 5 | `earnings-cashout.mp4` | Tap cashout → select bank/debit → confirm | ~8s |
| 6 | `earnings-weekly.mp4` | Weekly earnings summary view | ~4s |

---

## Recording Tips

- **Clean state**: Log out and back in before each video's recordings for a fresh UI
- **Slow and steady**: Tap deliberately — recordings will be sped up if needed in Remotion
- **Wi-Fi on**: Ensure real data loads (or use demo/seed data)
- **Notifications off**: Turn off system notifications before recording
- **Dark mode**: The app is dark-themed by default — keep it that way
- **No status bar clutter**: Use Do Not Disturb to clean up the phone status bar
