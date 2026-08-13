# Mobile Store Release — Anytime Workforce

Guide for shipping the Capacitor Android and iOS shells to Google Play and the Apple App Store.

## Product identity

| Field | Value |
| ----- | ----- |
| App name | Anytime Workforce |
| Bundle / application id | `com.anytimediesel.workforce` |
| Production web origin | `https://hrms.anytime-diesel.com` |
| Privacy policy (public) | `https://hrms.anytime-diesel.com/privacy` |
| Terms (public) | `https://hrms.anytime-diesel.com/terms` |
| Account deletion (public) | `https://hrms.anytime-diesel.com/account-deletion` |
| Short description | Workforce attendance, leave, and operations for Anytime Diesel |
| Category | Business / Productivity |
| Target audience | Internal employees (18+); not for children |

The store apps load the live production site inside Capacitor so HTTP-only session cookies continue to work. Native plugins provide splash, status bar, portrait lock (phones), geolocation, camera permission bridge, deep links, and FCM/APNs push — this is a workforce operations client, not a generic browser wrapper.

## Play Console — tonight checklist

### Before you upload

1. [ ] Create upload keystore (never commit). Copy `android/keystore.properties.example` → `android/keystore.properties`.
2. [ ] Add Firebase Android app for `com.anytimediesel.workforce` and place `android/app/google-services.json` (gitignored).
3. [ ] `npm run mobile:sync` then `npm run mobile:android:bundle` → upload the `.aab`. When the track is live, bump `androidVersionCode` / `androidVersionName` in `public/app-version.json` to match `android/app/build.gradle` so outdated phones are prompted to update on next open.
4. [ ] Store listing icons: use `mobile/assets/play-icon-512.png` (branded).
5. [ ] Feature graphic 1024×500 + phone screenshots: login, dashboard, My Attendance (GPS), face check-in (if enabled), leave apply, Profile → account deletion.
6. [ ] Privacy policy URL, Terms URL, Account deletion URL (all public, no login).
7. [ ] Content rating questionnaire (Business app; no user-generated social content).
8. [ ] Target API: **36** (`android/variables.gradle`). Declare **no ads** / advertising ID not used (manifest removes `AD_ID`).

### Account deletion (Play policy)

- Accounts are **employer-provisioned** (no in-app self-signup).
- In-app: Profile → **Request account deletion** + mailto HR.
- Web URL for Console: `https://hrms.anytime-diesel.com/account-deletion`
- Console answer: users request deletion via in-app Profile / web page; HR offboards within ~7 business days; login closed; face/push tokens removed per retention; attendance/leave may be retained for legal compliance.

### Data Safety form (draft answers)

| Data type | Collected | Shared | Purpose | Optional? | Notes |
| --------- | --------- | ------ | ------- | --------- | ----- |
| Name, email | Yes | No (except employer processors) | App functionality | Required for login | Company accounts |
| Precise location | Yes | No | App functionality | **Required** for attendance | **While in use only** — no background location. Approximate/coarse alone is **not** accepted. |
| Approximate location | No (not used for product features) | No | — | — | App may declare `ACCESS_COARSE` as an Android dependency of fine location, but check-in/out require **Precise** |
| Photos / videos | Yes when face mode on | No | App functionality | Required only if Face Security enabled | Encrypted evidence; retention in Face Security |
| Device / push IDs | Yes if alerts on | Yes — Google FCM | App functionality | Optional (user enables alerts) | FCM is a third-party processor for delivery |
| Other HR / employment data | Yes | No | App functionality | Required for role | Encrypted statutory fields where configured |

- **Sold:** No  
- **Advertising / ads ID:** No  
- **Encryption in transit:** Yes (HTTPS)  
- **Encryption at rest:** Yes for configured sensitive employee fields and face evidence  
- **Users can request deletion:** Yes (see account deletion URL)  
- **Children:** No  

### Permission declarations (Play)

| Permission | Declared use |
| ---------- | ------------ |
| Location (`ACCESS_FINE_LOCATION`; coarse may appear as dependency) | **Precise** foreground attendance check-in/out geofencing only. Reject Approximate-only. |
| Camera | Face registration / check-in when enabled by admin |
| Notifications | Optional workforce alerts |
| Background location | **Not requested** |

### Play Console — paste these answers

**Data safety → Location**

- Collect precise location: **Yes**
- Collect approximate location for a feature: **No** (not used; attendance requires precise)
- Shared: **No**
- Purpose: App functionality (branch attendance verification)
- Ephemeral / processed ephemerally if asked: No — stored with the attendance punch for HR audit
- Required or optional: **Required** for attendance features
- Users can request deletion: Yes (account deletion flow)

**App content → Sensitive permissions (Location)** if Google asks why fine location:

> Anytime Workforce is an internal employee attendance app. Precise (fine) location is required while the employee checks in or out so the punch can be matched to the assigned branch geofence. Approximate location is not accurate enough for this internal workforce control. Location is used only in the foreground during the punch; background location is not requested.

### Reviewer notes (paste into Console if asked)

Anytime Workforce is an internal Anytime Diesel employee app. Logins are created by HR/Developer Admin only. Native features: precise location for branch attendance, optional face verification camera, push alerts, portrait lock, and App Links to `hrms.anytime-diesel.com`. Test account: provide a temporary employee login to Google Play review if requested (do not use production admin).

## Prerequisites (outside this repo)

1. Google Play Console developer account and listing for `com.anytimediesel.workforce`.
2. Apple Developer Program (later) with the same bundle id.
3. Android upload keystore (out of Git).
4. Firebase `google-services.json` for FCM.
5. Apple Push Auth Key for APNs when shipping iOS.

## Local / CI build commands

```bash
npm install
python3 scripts/generate-android-icons.py   # refresh branded launcher icons
npx cap sync
npm run mobile:android:bundle
```

### Android App Bundle

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

Signing via `android/keystore.properties` or env:

- `ANDROID_KEYSTORE_FILE`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

### iOS (macOS + Xcode)

```bash
cd ios/App && pod install && open App.xcworkspace
```

## Backend env for native push

- Prefer `FCM_SERVICE_ACCOUNT_JSON` (stringified service-account JSON) + `FCM_PROJECT_ID` for FCM HTTP v1
- Optional fallback: `FCM_SERVER_KEY` (legacy)
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_P8`, `APNS_PRODUCTION`
- Existing VAPID keys for PWA Web Push

See also [Play Launch Status](PLAY_LAUNCH_STATUS.md) for packaging progress and deploy notes.

## Smoke test before upload

1. Cold start → splash hides → production login.
2. Session persists after backgrounding.
3. Permission setup shows **why** location/camera/notifications are needed before OS prompts.
4. My Attendance GPS check-in (foreground only).
5. Face check-in when Face Security enabled (camera fallback constraints OK).
6. Enable alerts → FCM token registers when `google-services.json` present.
7. Login footer + Profile open Privacy, Terms, Account deletion.
8. PWA install banner hidden in store build.
9. Android back minimizes when at root (does not force-kill).
10. `allowBackup=false` — confirm in merged manifest.

## Branch policy

- Ship from **`main`**.
- Do not merge `version-1` tip-to-tip.
