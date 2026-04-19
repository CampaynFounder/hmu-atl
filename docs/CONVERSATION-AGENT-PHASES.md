# Conversational SMS Agent — Phase Plan

Goal: a first-time text conversation with new drivers and riders. Gender + user-type-aware personas ("Tenay" for women, "Trell" for men, "Neutral" fallback). Personable, not overbearing. Delivers the "you keep the money because you do the work" vision on engagement. Admin-configurable end-to-end.

All new tables, routes, and UI are gated by feature flag `conversation_agent` (existing DB-backed flag infra). OFF = zero user-visible change, no SMS sent, no Clerk webhook side-effects.

---

## Locked decisions (2026-04-19)

| Decision | Locked value |
|---|---|
| **Gender fallback** | Three personas: `tenay` (female), `trell` (male), `neutral` (everyone else). Admin configurable at persona level. |
| **Pacing — max messages per thread** | 3 outbound total if user hasn't replied |
| **Pacing — quiet hours** | 9pm–9am ET, enforced; admin-configurable |
| **Pacing — STOP keyword** | Stops thread permanently, flips `users.opt_in_sms=false`, sends acknowledgment |
| **Pacing — first-message delay** | 10 minutes after phone-verified signup (configurable) |
| **Pacing — follow-ups** | 24h, 168h if no reply, then stop (configurable) |
| **Compliance — opt-in** | Explicit checkbox during signup with disclosure text. `users.opt_in_sms BOOLEAN DEFAULT FALSE`. Agent skips users without it. |
| **Engagement — vision trigger** | Fires after first non-STOP reply. Not in first message. |
| **Rider narrative** | "Relationship" framing — "find drivers you vibe with and stick with them." Editable in admin. |
| **Claude model** | `claude-haiku-4-5-20251001` for replies (fast, cheap). System prompt pre-built from persona + config. |
| **Transport** | VoIP.ms via existing `lib/sms/textbee.ts` |
| **Trigger point** | Clerk `user.updated` webhook, inside the "phone verified → Neon row created" branch (line 95 of `app/api/webhooks/clerk/route.ts`) |
| **Delay mechanism** | `scheduled_outbound_messages` table + 1-minute cron (no Cloudflare Queues yet) |
| **Admin UI** | `/admin/conversation-agent` — overview card + 5 expandable accordion panels (Personas / Pacing / Opt-In / Engagement / Threads) using the already-installed `@base-ui/react` Accordion. |

---

## Phased scope

### Phase 1 — Schema + admin config UI (this session)
Ship the whole config surface so founder can tune personas, pacing, opt-in copy, engagement rules before any message sends. Nothing is live yet.

**Schema** (migration `lib/db/migrations/conversation-agent.sql`):
- `conversation_personas` — slug, display_name, gender_match, user_type_match, greeting_template, vision_template, system_prompt, max_messages_per_thread, quiet_hours_*, follow_up_schedule_hours[], is_active
- `conversation_agent_config` — singleton row with global defaults (first_message_delay_minutes, rider_narrative_style, claude_model, opt_in_disclosure_text, stop_acknowledgment_text, default quiet hours)
- `conversation_threads` — thread per (user_id, persona_slug): status ('pending','active','dormant','opted_out','closed'), message counts, last_*_at timestamps
- `conversation_messages` — per-message audit: direction, body, generated_by ('template'/'claude'/'human'), sent_at, delivery_status, voipms_id or error
- `scheduled_outbound_messages` — send_at TIMESTAMPTZ, status, payload, attempts; scanned by cron
- `users.opt_in_sms BOOLEAN NOT NULL DEFAULT FALSE`
- Seed: `feature_flags` row for `conversation_agent` (disabled), default `conversation_agent_config` row, Tenay/Trell/Neutral persona rows

**Backend:**
- `lib/conversation/personas.ts` — `listPersonas`, `getPersona`, `createPersona`, `updatePersona`, `deletePersona`, `pickPersonaForUser(gender, profileType)`
- `lib/conversation/config.ts` — `getConfig`, `updateConfig` (singleton pattern — one row)
- `lib/conversation/threads.ts` — read-only for Phase 1: `listThreads`, `getThread`, `listMessages(threadId)`

**Admin APIs:**
- `/api/admin/conversation-agent/config` — GET, PATCH
- `/api/admin/conversation-agent/personas` — GET, POST
- `/api/admin/conversation-agent/personas/[id]` — PATCH, DELETE
- `/api/admin/conversation-agent/threads` — GET (paginated)

**Admin UI at `/admin/conversation-agent`:**
- Overview card: feature flag toggle (shortcut to `/admin/feature-flags`), thread count, reply rate, opt-outs
- Accordion with 5 panels (collapsed by default, open one at a time):
  1. **Personas** — table of personas, inline editor per row (greeting template, vision template, system prompt, gender/user-type match, active toggle)
  2. **Pacing & Limits** — max messages per thread, quiet hours, STOP handling, first-message delay, follow-up schedule
  3. **Opt-In & Compliance** — disclosure text (shown in signup UI in Phase 2), opt-in required toggle, STOP acknowledgment message, quiet-hours enforcement toggle
  4. **Engagement** — when vision fires (always `first_reply` for now, future: `first_reply | immediate | manual`), rider narrative style radio (value/trust/relationship), Claude model dropdown, system prompt preview (read-only, live-rendered)
  5. **Live Threads** — read-only list; placeholder empty state until Phase 2 starts sending

Sidebar nav entry under GROW: `💬 Conversation Agent`.

**DoD:**
- `/admin/conversation-agent` loads, renders three seeded personas
- All 5 panels collapse/expand cleanly
- Can edit + save a persona (name, templates, system prompt, toggles)
- Can edit + save global config (pacing, disclosure, etc.)
- Feature flag `conversation_agent` toggle at `/admin/feature-flags` works
- Schema migration applied to Neon (via MCP, prepare→verify→complete)
- Zero Clerk webhook changes, zero SMS sent

---

### Phase 2 — Outbound sender + trigger + opt-in (next session)

**Trigger:** extend Clerk `user.updated` webhook (around line 95) to insert a `scheduled_outbound_messages` row with `send_at = NOW() + config.first_message_delay_minutes` when:
- User has verified phone
- Neon row created
- `conversation_agent` flag is ON
- `users.opt_in_sms = TRUE`
- Matching active persona exists for (gender, profile_type)

**Cron:** `/api/cron/conversation-agent/process-queue/route.ts` — runs every 1 minute, finds due messages where `status='pending' AND send_at <= NOW()`, picks persona, renders greeting from template, calls `sendSms()`, writes `conversation_messages` row, flips thread to `active`. Bearer-authed with `CRON_SECRET`.

**Inbound routing:** extend `/api/webhooks/voipms/route.ts` to (a) check if sender's phone matches an active `conversation_threads` row and (b) route inbound message to conversation agent. STOP keyword handling: flip `users.opt_in_sms=false`, thread `status='opted_out'`, send static acknowledgment. Non-STOP replies stored in `conversation_messages` for Phase 3 to handle.

**Opt-in UI:** add checkbox to signup flow (`app/sign-up/[[...sign-up]]/page.tsx` or onboarding) with disclosure from admin config. Writes to `users.opt_in_sms` via Clerk metadata or a post-signup API call.

**Admin UI adds:** live thread viewer is no longer placeholder — shows real threads with message history. Manual "resend first message" button for testing.

**DoD:**
- New signup with opt-in checked → 10 minutes later → receives first outbound from correct persona
- Replying STOP flips opt-out flag and sends acknowledgment, no further messages
- Non-STOP replies captured in DB, no auto-response yet
- Admin can view thread history live
- New signup without opt-in → no message sent

---

### Phase 3 — Claude conversational replies + vision trigger

**Reply orchestrator:** when inbound message arrives (non-STOP) on an active thread:
1. Load thread + last N messages from `conversation_messages`
2. Build Claude prompt: persona's `system_prompt` + global config + recent history
3. If this is the first inbound response AND vision hasn't fired yet, inject directive: "in this reply, weave in the platform vision at the end, concisely"
4. Call `claude-haiku-4-5-20251001` via raw fetch (same pattern as `lib/content/claude.ts`)
5. Rate-limit: one Claude call per thread per 5 minutes; hard-cap 10 inbound messages per thread total
6. Send response via `sendSms()`, store in `conversation_messages` with `generated_by='claude'`

**Follow-up scheduler:** if no inbound reply after `follow_up_schedule_hours[i]`, fire the next follow-up. Follow-up messages are templated in persona row (short nudge, not a full conversation). After last item in array, thread flips to `dormant`, no more outbound.

**Vision message:** admin-configurable template per user_type (driver vs rider narrative). Inserted by Claude on first-reply turn per the system prompt directive.

**Guardrails in system prompt:**
- Never make promises about earnings
- Never quote specific prices
- Never commit to features not yet shipped
- If user asks anything payment/legal/dispute-related, respond "a real person will hit you up — forwarding this now" and flag thread for admin review
- Never pretend to be a real person if directly asked

**Admin UI adds:** "system prompt preview" renders a full composed prompt with sample user context, so founder can eyeball what Claude will see.

**DoD:**
- User signs up (female, driver) → receives greeting from Tenay at T+10min
- User replies "yo" → Tenay responds within 60s with a short personable reply + weaves in the driver vision
- User replies again → Tenay responds again (capped at 10 total inbound per thread)
- User goes silent 24h → follow-up message fires → still silent 7d → second follow-up fires → silent after → thread dormant
- User asks "how much do I actually make?" → Tenay says "a real person will hit you up" + admin review flag set

---

### Phase 4 — Analytics + admin tooling

- Thread funnel dashboard: first-message-sent → any-reply → vision-delivered → thread-dormant → first-ride
- Per-persona metrics: reply rate, opt-out rate, avg messages per thread, avg time-to-reply
- Per-acquisition-source slice: which `how_heard` values correlate to highest engagement
- Manual "send test to my phone" button in persona editor
- Hand-off-to-human button: flips thread to `manual`, pauses auto-replies, pings admin via Ably
- Per-thread transcript export (CSV/PDF for compliance)

**DoD:**
- Admin can see reply rate per persona over last 7/30 days
- Hand-off button works; admin can reply from `/admin/messages` and Claude stops intercepting

---

## Hard constraints (respect across all phases)

- **Flag OFF = zero user-visible change.** Every new component, hook, webhook branch, and cron must early-exit if `isFeatureEnabled('conversation_agent')` is false.
- **Never send SMS to users without `opt_in_sms=TRUE`.** Even if flag is on, even if admin manually creates a thread. Compliance-critical.
- **STOP is sacred.** Any inbound "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT" (case-insensitive) stops the thread permanently and flips `opt_in_sms=false`. Single acknowledgment allowed ("You're unsubscribed. Text START to opt back in.") then silence forever.
- **Quiet hours enforced.** No outbound between 9pm–9am ET by default. Even cron-scheduled follow-ups defer until next morning 9am.
- **No payment/earnings promises.** System prompt must forbid them. Phase 3 Claude integration must include automated detection + hand-off if user pushes.
- **Thread persistence in Neon.** All inbound + outbound logged in `conversation_messages` for admin review, compliance, abuse investigation.
- **No signup-blocking.** The Clerk webhook hook is fire-and-forget. If scheduling fails, signup still succeeds. Wrap in try/catch with error logged.
- **Admin writes auditable.** Every persona create/update/delete, config change, manual send → `admin_audit_log` entry.
- **Rate-limit Claude.** Cap inbound-per-thread (10), Claude-call frequency (1 per 5 min per thread), and burn $ guardrails (global daily spend cap in config, alert when exceeded).
- **Don't break existing SMS infrastructure.** `lib/sms/textbee.ts`, `/api/webhooks/voipms/route.ts`, `/admin/messages/*` must keep working exactly as they do today. New work is additive.

---

## Prompt for resuming in a future session

Copy-paste to a fresh Claude session to continue:

---

> **Task — continue the Conversational SMS Agent in HMU ATL.**
>
> Full plan: `docs/CONVERSATION-AGENT-PHASES.md`. Read it and the "Hard constraints" section before touching anything. Also read `CLAUDE.md` for project conventions (especially the DEPLOYMENT section — deploy to the `hmu-atl` Worker, not Pages).
>
> **Where things stand (check git + Neon before trusting this):**
> - Phase 1 (schema + admin config UI) shipped. Feature flag `conversation_agent` is OFF. Admin can configure personas, pacing, opt-in text, engagement rules, and view (empty) thread list at `/admin/conversation-agent`.
> - Phase 2 (outbound sender + trigger + opt-in UI) NOT started.
> - Phase 3 (Claude replies + vision + follow-ups) NOT started.
> - Phase 4 (analytics + hand-off) NOT started.
>
> **What to do (pick one, ask if unclear):**
> 1. Ship Phase 2: scheduled_outbound_messages cron processor, Clerk webhook hook, VoIP.ms inbound routing for active threads, STOP keyword handler, signup opt-in checkbox. Do not send any message to a user without `users.opt_in_sms=TRUE`. Don't break the existing `/api/webhooks/voipms` or `/admin/messages` flows.
> 2. Ship Phase 3: Claude Haiku 4.5 reply orchestrator using the raw-fetch pattern in `lib/content/claude.ts`. System prompt built from persona + config + last N messages. Rate-limit as specified. Follow-up scheduler honors quiet hours. Hand-off detection on payment/legal/earnings questions.
> 3. Ship Phase 4: analytics dashboard, hand-off button, test-send button in persona editor.
>
> **Constraints — read the plan doc before writing code. Critical ones:**
> - Flag OFF = zero user-visible change. Early-exit every new entry point.
> - Never SMS a user with `opt_in_sms=FALSE`.
> - STOP keyword stops thread permanently + flips opt_in_sms=false. Single acknowledgment then silence.
> - Quiet hours 9pm–9am ET. Defer follow-ups, never breach.
> - No earnings/payment/legal promises. Hand-off on those.
> - Don't touch `lib/db/enrollment-offers.ts`, the pricing-promotions work-in-progress (see `docs/PRICING-PROMOTIONS-RESUME.md`), or the remotion video props.
> - Schema writes via Neon MCP (prepare → verify → complete). Project id: `still-rain-53751745`.
> - Deploy via `npm run build && npx opennextjs-cloudflare build && npx wrangler deploy --config wrangler.worker.jsonc`.
>
> Before writing code, confirm the phase you're on and list what you'll verify before shipping.

---

## Open questions (parked)

- **Claude spend cap.** Hard $/day cap in `conversation_agent_config`? Alert or auto-pause when breached?
- **Multi-market personas.** Phase 1 personas are global. When market #2 launches, do we clone personas per market or scope them?
- **Opt-back-in.** User texts START after opting out — should we re-initiate conversation or require re-onboarding? Default: silent ACK, no re-engagement (their choice was no).
- **Non-conversational user.** If user never replies across 3 outbound, do we ever re-engage later (e.g., after their 5th completed ride)? Not in initial phases.
- **Time zone.** Quiet hours are ET-fixed. If we expand markets beyond ATL, do we honor local TZ? Deferred.
