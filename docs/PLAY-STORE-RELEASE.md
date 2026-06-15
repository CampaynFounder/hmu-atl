# Google Play Store Release Runbook — HMU ATL (Android)

> Companion to the iOS/TestFlight flow. The Expo app lives in `mobile/`.
> Package name (Android applicationId) = **`com.hmucashride`** — same as the iOS
> bundle id. **NEVER change it** once a build is uploaded to Play.

This runbook covers the steps that live **outside the repo**. The in-repo Android
config (adaptive icon, splash, permissions) is already wired in `mobile/app.json`
and the EAS build/submit profiles in `mobile/eas.json`.

---

## 0. What's already done in the repo

- `mobile/app.json`
  - `android.package` = `com.hmucashride`
  - `android.adaptiveIcon` → foreground / background / monochrome images (themed-icon ready for Android 13+)
  - `splash` → `splash-icon.png`, `contain`, `#080808`
  - `android.permissions` trimmed to what's actually used (location incl. background — used by `lib/location-tracking.ts` — camera/mic, notifications, foreground-service). Legacy `*_EXTERNAL_STORAGE` removed.
- `mobile/eas.json`
  - `production.android.buildType` = `app-bundle` (AAB — required by Play)
  - `production.android.credentialsSource` = `remote` (EAS holds the upload keystore)
  - `submit.production.android` → `track: internal`, `releaseStatus: draft`
  - `cli.appVersionSource` = `remote` → **EAS owns `versionCode`**. The first
    production build is `versionCode 1`; `autoIncrement` bumps it each build.
    **Do not** add `versionCode` to `app.json` — with remote source it's ignored
    and EAS will warn.

---

## 1. Google Play Console — create the app (one-time)

1. Create the Google Play Developer account ($25 one-time). Use the team Google account.
2. **Create app** → app name "HMU ATL", default language en-US, type **App**, **Free**.
3. Set the package name to `com.hmucashride` implicitly on first upload (Play locks it).

## 2. Service account for `eas submit` (one-time)

EAS needs a Google service-account JSON to upload builds.

1. Google Play Console → **Setup → API access** → link a Google Cloud project.
2. Create a **service account** in that GCP project, grant it the **Release Manager**
   (or **Admin (all permissions)** for first setup) role in Play Console → Users & permissions.
3. Download the service-account **JSON key**.
4. Store it for EAS (do **not** commit it — `mobile/eas.json` references `./google-play-key.json`):
   ```bash
   cd mobile
   # Option A: keep the file locally next to eas.json (gitignored)
   cp ~/Downloads/<key>.json ./google-play-key.json
   # Option B (preferred): upload as an EAS secret
   eas secret:create --scope project --name GOOGLE_SERVICE_ACCOUNT_KEY --type file --value ./google-play-key.json
   ```
   If you use the secret, point `serviceAccountKeyPath` at the materialized path or
   use `--service-account-key-path` on the submit command.

## 3. Other EAS secrets (verify present)

```bash
cd mobile
eas secret:list
# Required for the Android build:
#   RNMAPBOX_DOWNLOAD_TOKEN   (sk.… Mapbox secret — see app.config.js)
# If missing:
eas secret:create --scope project --name RNMAPBOX_DOWNLOAD_TOKEN --value "sk.…"
```

## 4. Privacy policy (BLOCKING — Play rejects without it)

- Host a privacy policy at a public URL, e.g. **`https://atl.hmucashride.com/privacy`**.
- Enter that URL in Play Console → **Policy → App content → Privacy policy**.

## 5. Data safety form (BLOCKING)

Play Console → **Policy → App content → Data safety**. Declare collection/sharing
for every SDK the app ships:

| SDK | Data | Purpose |
|---|---|---|
| Clerk | email, phone, name, user IDs | Account / auth |
| Stripe | payment info (tokenized — Stripe collects card, app does not store PAN) | Payments |
| Mapbox + expo-location | precise location (incl. background) | Find drivers, live ride tracking |
| Sentry | crash logs, device info | Diagnostics |
| PostHog | product analytics / usage events | Analytics |
| Ably | real-time messages | App functionality |

Flag **background location** explicitly and be ready with the in-app justification
video Play requires for background-location apps (ride tracking while the app is
backgrounded — implemented in `lib/location-tracking.ts`).

## 6. Store listing assets (BLOCKING for production track)

- **App icon** 512×512 (from `assets/icon.png`).
- **Feature graphic** 1024×500 PNG/JPG.
- **Phone screenshots** — min 2, 1080p+ (capture rider home, browse, ride map, driver feed).
- Short description (≤80 chars) + full description.

## 7. Build + submit

```bash
cd mobile

# Internal-test APK to sanity-check on a real device first (optional)
eas build -p android --profile preview

# Production AAB for Play
eas build -p android --profile production

# Upload to the Play internal track as a DRAFT (per eas.json submit config)
eas submit -p android --profile production
# (add --latest to grab the most recent build automatically)
```

`eas submit` lands the build in **Internal testing** as a **draft** — nothing goes
live until you promote it in Play Console.

## 8. Verify before promoting

- [ ] Build appears in Play Console → Testing → Internal testing.
- [ ] Install via the internal-test opt-in link on a real Android device (Pixel + a Samsung if possible).
- [ ] App launches; adaptive icon + splash render correctly.
- [ ] Clerk sign-in works (Android WebView handshake).
- [ ] Location permission prompt + background-location justification flow OK.
- [ ] Stripe / Google Pay sheet opens.
- [ ] Mapbox ride map renders (token wired).
- [ ] Booking-type "Coming soon" gating reflects the market's flags (see `/admin/booking-types`).
- [ ] Pre-launch report (Play Console runs it automatically) has no crashes.

## 9. Promote

Internal → Closed (beta) → Production, completing the content rating questionnaire,
target-audience, and ads declarations along the way.

---

## Rollback / hotfix

There's no rollback for a published Play release — you ship a higher `versionCode`.
For a bad internal build, just upload a new one; drafts never reached users.

## Open items the founder must supply

- [ ] Google Play Developer account access
- [ ] Service-account JSON key (§2)
- [ ] Privacy-policy page live at a public URL (§4)
- [ ] Data-safety answers confirmed (§5)
- [ ] Feature graphic + screenshots (§6)
