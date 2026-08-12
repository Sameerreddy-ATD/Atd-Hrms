# Anytime Workforce — Launch status (as of 12 Aug 2026)

Living checklist of what is done, what is waiting, and Play Store readiness.
Canonical product docs remain in the rest of `docs/`. Credentials stay on the laptop only
(`~/Anytime-Workforce-Credentials`), never in Git.

## Done

### Product / web (production `https://hrms.anytime-diesel.com`)
- Capacitor-ready workforce web app (attendance GPS, optional face, leave, Work Planner, etc.)
- Public legal pages (no login): `/privacy`, `/terms`, `/account-deletion`
- Login + Profile links to privacy / terms / account deletion
- Stronger permission disclosure before OS prompts
- Face camera constraint fallback for Android WebView
- Native push subscribe API (`web` | `fcm` | `apns`) + DB migration `push_subscriptions.channel`
- Backend FCM HTTP v1 sender (`FCM_SERVICE_ACCOUNT_JSON` / `FCM_PROJECT_ID`) with legacy key fallback
- Digital Asset Links: `public/.well-known/assetlinks.json` (upload-key SHA-256)
- Security hardening (12 Aug 2026): TTL support password, secret startup checks, Web Push SSRF allowlist, signed ID-card tokens, private-file ownership — see `docs/SECURITY_HARDENING_2026-08-12.md`
- Deploy host: `ubuntu@13.204.5.57` via `InsidesalesHRMS.pem` → `/opt/anytime-crew-hub` (rsync; no `.git` on server), PM2 `atd-backend` / `atd-frontend`

### Android / Play packaging
- App id `com.anytimediesel.workforce`
- Capacitor 7 shell loading production HTTPS (cookie auth preserved)
- `compileSdk` / `targetSdk` **36** (Play current-API readiness)
- Manifest: no hard `screenOrientation=portrait` (phones lock via JS/Capacitor; tablets/folds free)
- Branded launcher icons + Play 512 icon + feature graphic `1024×500`
- `google-services.json` installed locally (gitignored)
- Upload keystore created; signed **AAB** built (rebuild after each Play-hygiene change):
  - Latest: **1.0.1** (`versionCode` 2) with R8 minify/shrink — re-upload for Internal testing
  - `~/Downloads/AnytimeWorkforce-1.0.1.aab`
  - `~/Anytime-Workforce-Credentials/play-upload/AnytimeWorkforce-1.0.1.aab`
- Release hardening: `minifyEnabled` + `shrinkResources`, Capacitor ProGuard keep rules, AGP **8.9.2** (not AGP 9 — Capacitor 7-safe), arm-only ABIs
- Play hygiene: `allowBackup=false`, AD_ID removed, no background location, FileProvider paths narrowed
- Offline Capacitor shell page improved (`mobile/www/index.html`)
- Listing copy: `mobile/store/PLAY_LISTING_COPY.md`
- Inputs list: `mobile/store/WAITING_ON_YOU.md`
- Release guide: `docs/MOBILE_STORE_RELEASE.md`

### Responsive / multi-device
- Phone portrait lock by viewport (`min-width: 600px` unlocks landscape for tablet / unfolded fold / split-screen)
- Dashboard grids use `min-[…]` / `md` / `lg` / `xl` tiers
- Short-viewport login hides/shrinks crew mascot so the form stays usable
- Device matrix: `docs/DEVICE_COMPATIBILITY.md`, `docs/RESPONSIVE_UI_AUDIT.md`

### Laptop backup (private)
Folder: `~/Anytime-Workforce-Credentials`  
Contains keystore, password text file, Firebase JSON, AAB. Not in Git.

## Waiting (outside repo / you)

| Item | Status |
| ---- | ------ |
| Google Play Console account verification | **Done** — create app + upload AAB next |
| FCM service account JSON on production `.env` | Optional for first ship; enables native Android push |
| Phone screenshots in Play listing | Needed at upload time |
| Internal testing track + reviewer employee login | After app listing exists |

## Play rejection risk — mitigated

| Risk | Mitigation |
| ---- | ---------- |
| Thin WebView wrapper | Native GPS, camera, push hooks, splash, orientation, App Links; screenshots must show attendance/face |
| Missing privacy / deletion | Live public URLs |
| Background location | Not requested; copy says while-in-use |
| Ads / AD_ID | Declared none; permission removed |
| Backup of HR data | Disabled |
| App Links verify | `/.well-known/assetlinks.json` with upload-key SHA-256 |
| targetSdk outdated | **36** in `android/variables.gradle` |
| Tablet/fold portrait lock | Manifest not hard-locking; viewport-based phone lock + resize re-eval |
| Deceptive / incomplete Data Safety | Draft answers in `MOBILE_STORE_RELEASE.md` — fill Console to match |
| Cleartext / insecure traffic | `usesCleartextTraffic=false` + network security config |

## Full-stack audit snapshot (12 Aug 2026)

| Layer | Verdict | Notes |
| ----- | ------- | ----- |
| Frontend | Ready for store shell | Legal routes, permission UX, responsive shell, native bridges |
| Backend | Ready; push optional | HTTP v1 FCM code present; needs service-account env to send |
| Database | Ready | `push_subscriptions.channel` migrated on prod |
| Android AAB | Ready to upload | Blocked only on Play Console verification |
| iOS | Shell present | Ship later with Apple Developer + APNs |

Open product gaps (not Play blockers): profile edit-request 501, live biometric connector, email digests — see `docs/APPLICATION_AUDIT.md`.

## Build commands (this laptop)

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
cd "/home/sameer-reddy/AnyTime- Diesel/Atd-Hrms"
npm run mobile:android:bundle
```

## Production deploy (rsync)

```bash
# From laptop repo root after commit/push:
rsync -az --exclude node_modules --exclude .env --exclude .git \
  --exclude dist --exclude dist-server --exclude android/.gradle \
  --exclude android/app/build --exclude '*.jks' --exclude google-services.json \
  -e "ssh -i ~/Downloads/InsidesalesHRMS.pem" \
  ./ ubuntu@13.204.5.57:/opt/anytime-crew-hub/

ssh -i ~/Downloads/InsidesalesHRMS.pem ubuntu@13.204.5.57 '
  cd /opt/anytime-crew-hub &&
  NODE_ENV=development npm ci &&
  npx prisma generate && npm run db:deploy &&
  NODE_ENV=production npm run build &&
  NODE_ENV=production npm run build:backend &&
  pm2 restart atd-backend atd-frontend --update-env
'
```

## Next human step

When Play Console verification completes: create the app listing → Internal testing → upload
`AnytimeWorkforce-1.0.0.aab` → paste listing copy + legal URLs → Data Safety → submit.
