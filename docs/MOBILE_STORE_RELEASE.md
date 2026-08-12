# Mobile Store Release — Anytime Workforce

Guide for shipping the Capacitor Android and iOS shells to Google Play and the Apple App Store.

## Product identity

| Field | Value |
| ----- | ----- |
| App name | Anytime Workforce |
| Bundle / application id | `com.anytimediesel.workforce` |
| Production web origin | `https://hrms.anytime-diesel.com` |
| Short description | Workforce attendance, leave, and operations for Anytime Diesel |
| Category | Business / Productivity |

The store apps load the live production site inside Capacitor so HTTP-only session cookies continue to work. Native plugins provide splash, status bar, portrait lock, geolocation permissions, and FCM/APNs push.

## Prerequisites (outside this repo)

1. Google Play Console developer account and an app listing for `com.anytimediesel.workforce`.
2. Apple Developer Program membership and an App Store Connect app with the same bundle id.
3. Android upload keystore (keep out of Git; path via CI secrets).
4. Firebase project with `google-services.json` for FCM (place under `android/app/`; gitignored).
5. Apple Push Auth Key (`.p8`) + Key ID + Team ID for APNs.
6. Privacy Policy and Terms URLs (in-app routes):  
   `https://hrms.anytime-diesel.com/privacy` and `https://hrms.anytime-diesel.com/terms`.

## Local / CI build commands

```bash
npm install
npx cap sync
```

### Android App Bundle

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

Configure signing in `android/keystore.properties` (not committed) or Gradle env:

- `ANDROID_KEYSTORE_FILE`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Helper script from repo root:

```bash
npm run mobile:android:bundle
```

### iOS (macOS + Xcode required)

```bash
cd ios/App
pod install
open App.xcworkspace
```

Archive with the Anytime Workforce signing team, then upload via Organizer or `xcodebuild`.

```bash
npm run mobile:ios:open
```

## Backend env for native push

Set on the API host (see `.env.example`):

- `FCM_SERVER_KEY` — Android FCM legacy server key
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_P8`, `APNS_PRODUCTION`

Web Push VAPID keys remain required for installed PWAs.

After env changes, run Prisma migrate so `push_subscriptions.channel` exists:

```bash
npx prisma migrate deploy
```

## Store listing checklist

- [ ] Feature graphic and phone screenshots (login, dashboard, My Attendance, leave apply)
- [ ] Privacy policy URL and terms URL
- [ ] Data safety / App Privacy answers (see below)
- [ ] Content rating questionnaire
- [ ] Target audience: workforce / internal employees (no children)
- [ ] Contact email for store support

## Data Safety / App Privacy questionnaire (draft answers)

| Data type | Collected | Purpose | Linked to identity | Notes |
| --------- | --------- | ------- | ------------------ | ----- |
| Name, email | Yes | App functionality / account | Yes | Company login |
| Location | Yes (precise, while using) | Attendance geofence | Yes | Check-in/out only |
| Photos / camera | Yes when face mode on | Face registration & check-in | Yes | Encrypted evidence; retention controlled in Face Security |
| Device IDs / push tokens | Yes if alerts enabled | Notifications | Yes | Web push or FCM/APNs |
| Employment / HR data | Yes | Workforce operations | Yes | Encrypted statutory fields where configured |

**Not sold.** Not used for advertising. Face templates are excluded from Employee API v1.

## Smoke test before upload

1. Cold start → splash hides → login at production origin.
2. Session persists after backgrounding the app.
3. My Attendance check-in with GPS permission prompt.
4. Face check-in when Face Security is enabled (camera permission).
5. Enable alerts → native token registers (`channel` fcm/apns in DB).
6. Portrait lock on phone; landscape prompt still works if OS ignores lock.
7. Privacy and Terms open from login footer and Profile.
8. PWA install banner does **not** show inside the store app.

## Branch policy

- Ship store tooling and product changes from **`main`**.
- Do not merge `version-1` tip-to-tip; cherry-pick only missing fixes if needed.
- Keep `version-1` aligned with `main` when ops wants a single line of history.
