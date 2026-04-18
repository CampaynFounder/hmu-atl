# Driver Activation & Playbook

Goal: increase driver conversion + first-time use by educating drivers on profile setup, pricing, and how to pull riders from FB/IG. Captures attribution so we can target acquisition. Ships **disabled** behind a single feature flag.

Status: **code merged, migration applied (2026-04-18), flag OFF**.

---

## Kill-switch

One DB-backed feature flag gates the entire initiative. When OFF, zero user-visible change — no FAB, no survey, no card, no banner, no nudge emails.

- Flag slug: `driver_playbook`
- Admin UI: `/admin/feature-flags`
- Table: `feature_flags` (slug PK, enabled, rollout_percentage, markets[])
- Helper: `isFeatureEnabled(slug, { userId, marketSlug })` in `lib/feature-flags.ts`

Rollout uses a deterministic hash of `users.id` → same user always gets the same answer. Safe to ramp from 10% → 100%.

---

## Components

| Layer | What | Where |
|---|---|---|
| Schema | `feature_flags`, `user_attribution`, `user_preferences`, `driver_fb_groups` + 6 additive `users` columns | `lib/db/migrations/driver-playbook.sql` |
| Attribution | First-touch cookie `hmu_attrib_id` (30d, public GETs only) | `middleware.ts`, `lib/attribution.ts` |
| Attribution API | Client posts UTMs when present | `/api/attribution/touch` |
| Attribution attach | Cookie → `users.id` on first authenticated dashboard visit | `app/driver/dashboard/page.tsx` |
| Post-onboarding survey | 2 questions (`how_heard`, `driver_intent`), 3 arms A/B via PostHog | `components/driver/post-onboarding-survey.tsx` + `/api/driver/survey` + `/api/driver/survey/skip` |
| Get Riders FAB | Bottom-right floating button with pulse + badge | `components/driver/get-riders-fab.tsx` |
| Command palette | Searchable sheet (Cmd+K / FAB tap) | `components/driver/command-palette.tsx` + `/api/driver/playbook/search-index` |
| Playbook page | `/driver/playbook` — hero economics copy + 4 sections + FB groups list | `app/driver/playbook/page.tsx`, `content/driver-playbook.ts` |
| FB groups admin | Full CRUD per market | `/admin/driver-playbook/fb-groups` + `/api/admin/driver-playbook/fb-groups[/id]` |
| Profile completion card | Dashboard card, % bar, "Finish profile" + "Let HMU set it up for me" auto-fill | `components/driver/profile-completion-card.tsx` + `/api/driver/activation-progress[/auto-fill]` |
| Tip banner | Dismissible banner on `/driver/*` via existing `user:{userId}:notify` channel | `components/driver/tip-banner.tsx` |
| Nudge cron | Weekly scan → one tip per stale driver | `/api/cron/driver-nudges` |
| Tips opt-out | Toggle at bottom of Playbook page | `components/driver/tips-preference-toggle.tsx` + `/api/driver/preferences` |

Driver layout: `app/driver/layout.tsx` reads the flag once and mounts `<DriverPlaybookLayer>` (FAB + palette + banner) for authenticated drivers only.

---

## Economics copy (the narrative)

Lives in `content/driver-playbook.ts` as `ECONOMICS_HERO`. Edit that file to tweak wording without a DB change.

> Who does the work keeps the money.
> At Uber, that's Uber.
> At HMU, that's YOU.
> *Promoting. Greeting. Driving. It's all you — so the money's all yours.*

Rendered as the hero of `/driver/playbook`. Same line repeated elsewhere in the playbook sections — repetition is the point.

---

## Post-onboarding survey

Fires modal on first visit to `/driver/dashboard` after signup. Gate: `users.survey_completed_at IS NULL AND users.survey_skipped_at IS NULL AND flag is ON`.

**Q1 — "How'd you find HMU?"** → FB group / IG / TikTok / FB or IG ad / friend referred / Google / other
**Q2 — "What you trying to do?"** → side income / full-time / drive friends / still figuring it out

**A/B via PostHog flag `driver_survey_mode`** with 3 variants:
- `required` — user can't skip; modal blocks dashboard until answered
- `skippable` — "Maybe later" button; after skip, never re-prompted (v1)
- `hidden` — control; never shows

If the PostHog flag isn't configured, defaults to `skippable`. Answers write to `users.how_heard` and `users.driver_intent`.

PostHog events: `driver_survey_shown`, `driver_survey_completed`, `driver_survey_skipped`.

---

## Attribution

Captures first-touch UTMs **independently** of the existing `users.signup_source` (which is UTM-derived at signup time from `unsafe_metadata`). Self-reported survey answers (`how_heard`) and UTM data (`user_attribution` table) can disagree — both are useful signals.

**Flow:**
1. Middleware sets `hmu_attrib_id` cookie (random UUID, 30d) on first public-page GET — only if missing
2. `<AttributionTracker>` in root layout posts to `/api/attribution/touch` when UTMs or external referrer present (ON CONFLICT DO NOTHING = first-touch wins)
3. On first authenticated visit to `/driver/dashboard`, server attaches `cookie_id` → `users.id` in `user_attribution` (fire-and-forget)

No changes to Clerk webhook, sign-up flow, or existing `unsafe_metadata` handling.

---

## Profile completion

6 fields count toward completion %, computed live from `driver_profiles`:

1. Profile photo (`thumbnail_url`)
2. Video intro (`video_url`)
3. Vehicle info (`vehicle_info` JSONB non-empty)
4. Pricing (`pricing` JSONB non-empty)
5. Schedule (`schedule` JSONB non-empty)
6. Service areas (`area_slugs[]` non-empty)

**"Let HMU set it up for me"** auto-fills ONLY what's empty:
- `pricing`: `{ min_ride: 25, rate_30min: 25, rate_1hr: 40, rate_2hr: 70, rate_out_of_town_per_hr: 50, round_trip: false }`
- `schedule`: `{ days: ['fri', 'sat'], notice_required: '30min' }`

To change defaults, edit `DEFAULT_PRICING` / `DEFAULT_SCHEDULE` in `lib/driver/activation.ts`.

---

## Tip banner + weekly nudge cron

`<TipBanner>` listens on `user:{userId}:notify` (existing Ably channel) for messages named `tip` with payload `{ id, title, body?, cta_label?, cta_href? }`. Slides down from top, dismissible per-message, respects `user_preferences.hide_tips`.

The cron `/api/cron/driver-nudges` runs once/week and finds drivers who:
- `account_status = 'active'`
- `profile_type = 'driver'`
- `hide_tips` is false/null
- Playbook flag is globally enabled

Then picks **one** tip per driver in this priority order (first missing wins, scan stops):

| Condition | Tip |
|---|---|
| No `thumbnail_url` | "Add a profile photo — riders book faces they trust." |
| No `video_url` | "Add a 15-second video intro." |
| Empty `pricing` | "Set your pricing — you're invisible without it." |
| Empty `schedule` | "Pick your days. No schedule = no matches." |
| Empty `area_slugs` | "Where you running? Pick your areas." |
| No `hmu_posts` in 14d | "Been quiet this week — drop your HMU link in a FB group." |

Complete drivers with recent activity get nothing.

**Security:** endpoint requires `Authorization: Bearer $CRON_SECRET`. Unauth = 401.

### Enabling the cron

1. Set the secret in production:
   ```bash
   npx wrangler secret put CRON_SECRET --config wrangler.worker.jsonc
   ```
   (pick a long random string — this is the only thing protecting the endpoint)

2. Add cron trigger to `wrangler.worker.jsonc`:
   ```jsonc
   {
     "triggers": {
       "crons": ["0 17 * * 1"]  // Mondays 17:00 UTC = 12pm ET
     }
   }
   ```

3. Wire up the scheduled handler. OpenNext/Cloudflare cron triggers call the Worker's `scheduled()` handler, not arbitrary routes. Options:
   - **Simplest:** use an external scheduler (GitHub Actions cron, Upstash QStash, Cloudflare Workers cron calling a small separate Worker) that does an authenticated `fetch` to `https://atl.hmucashride.com/api/cron/driver-nudges` with the Bearer token.
   - **Native:** add a `scheduled()` export to the worker that forwards to the route. Requires a tiny wrapper since OpenNext's generated worker doesn't handle `scheduled` by default.

4. Smoke test manually first:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://atl.hmucashride.com/api/cron/driver-nudges
   ```
   Returns `{ ok: true, scanned: N, sent: M }`. Flag must be ON for any tips to send.

---

## Admin surfaces added

- `/admin/feature-flags` — toggle flags, set rollout %, scope to markets. Super admin and anyone with full access should see this; no permission key (it's shown to all admins by default).
- `/admin/driver-playbook/fb-groups` — CRUD for FB groups per market. Fields: name, url, audience tag, suggested caption, why-this-group note, sort order, active toggle.
- Audit log entries: `feature_flag.update`, `fb_group.create`, `fb_group.update`, `fb_group.delete`

---

## Go-live checklist

1. ✅ Apply migration — done via Neon MCP on 2026-04-18 (project `still-rain-53751745`, branch `br-long-term-anw0uiwm`)
2. Seed FB groups at `/admin/driver-playbook/fb-groups` (ATL list — user to provide)
3. Configure PostHog flag `driver_survey_mode` with variants `required` / `skippable` / `hidden` (optional — defaults to `skippable`)
4. Flip `driver_playbook` flag at `/admin/feature-flags` — start at 10% rollout to bucket-test
5. Watch PostHog dashboard for key events (see Analytics below)
6. Ramp to 100% once metrics look healthy
7. (Later) Enable cron per steps above

---

## Analytics events

New PostHog events fired by the new code:

| Event | Properties | Fires when |
|---|---|---|
| `driver_survey_shown` | `variant` | Survey modal renders |
| `driver_survey_completed` | `variant`, `how_heard`, `driver_intent` | Driver submits both answers |
| `driver_survey_skipped` | `variant`, `step` | Driver taps "Maybe later" |
| `driver_get_riders_fab_clicked` | — | FAB tapped |
| `driver_palette_selected` | `kind`, `id`, `title` | Command palette result clicked |
| `driver_fb_group_opened` | `group_id`, `group_name` | FB group link opened |
| `driver_fb_caption_copied` | `group_id`, `group_name` | Caption copy button used |
| `driver_profile_finish_clicked` | `from` | "Finish profile" CTA clicked |
| `driver_profile_auto_filled` | `pricing`, `schedule` | Auto-fill applied defaults |
| `driver_profile_card_dismissed` | — | Dashboard card dismissed |
| `driver_tip_shown` / `driver_tip_clicked` / `driver_tip_dismissed` | `tip_id`, `title` | Tip banner lifecycle |
| `driver_hide_tips_toggled` | `hide_tips` | Opt-out toggle flipped |

Cohort ideas:
- Group by `how_heard` → which acquisition source converts to first ride fastest
- Group by `driver_intent` → side-income vs full-time activation curves
- Funnel: `driver_survey_shown` → `driver_profile_auto_filled` → `driver_fb_caption_copied` → first HMU post

---

## Design decisions (why it is the way it is)

- **DB-backed flag, not PostHog feature flag**, because (1) the gate covers server-side logic (cron, API routes, page server components) where PostHog adds round-trips, and (2) the admin UI needs CRUD anyway. PostHog handles the *A/B variant* inside the survey.
- **"Let HMU set it up for me" auto-fills only empty fields**, never overwriting driver's choices. Silent no-op if they've already set values.
- **FB groups in DB, not CMS**: structured fields (url, market, caption template) are easier to CRUD as rows than as CMS variants. If we need richer authoring later, port to `content_zones`.
- **Playbook copy is TypeScript, not CMS**, for v1. Lower friction to ship, authored as code. Port to CMS if we need admin edit or per-market variants.
- **Tip banner uses existing `user:{userId}:notify` channel** — no new Ably channels, no new token capabilities.
- **Middleware only writes cookies on public GETs** — explicitly skips `/api`, webhooks, and protected routes. Zero impact on auth/onboarding.
- **Attribution attaches at first authenticated dashboard visit**, not in the Clerk webhook, because the webhook is server-to-server and doesn't have the browser cookie.

---

## Follow-ups / future work (not blocking)

- **Per-market FAB behavior** — currently the FAB shows for all active drivers regardless of market; could key off `driver_profiles.area_slugs` once we have multiple active markets.
- **Market-median pricing defaults** — `applyDefaultsIfMissing()` uses static defaults. Could query the median of other active drivers in the same market for more contextual suggestions.
- **Survey re-prompt** — currently once-and-done. Could add `survey_skip_count` + "re-prompt 3 days after skip, max 2 times" if we want to raise completion rate.
- **Playbook content to CMS** — if we want per-market copy variants or admin authoring, port `content/driver-playbook.ts` into `content_zones` / `content_variants`.
- **Richer search** — command palette uses substring ranking. Swap for Fuse.js or similar if the item count grows past ~200.
- **Cron frequency** — weekly Mondays. If drivers are going stale faster than that, consider 2x/week with per-driver cooldown (don't send same tip id within 14 days).
- **FB group analytics** — we track `driver_fb_group_opened` and `driver_fb_caption_copied`, but not downstream conversion. Could tie copied captions to trackable short-links so admin sees which groups actually produce riders.
- **Deactivate FAB when 100% complete + posted recently** — right now the FAB shows for everyone when the flag is on. Could hide it (or change copy to "Run it back") once activation is done.
