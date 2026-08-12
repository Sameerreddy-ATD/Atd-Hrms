# Waiting on you — Play launch inputs

Play Console can stay in verification. Below is everything **only you** can provide, why we need it, and what is already done.

## Already done (no action)

- Capacitor Android/iOS projects (`com.anytimediesel.workforce`)
- Production site live with Privacy, Terms, Account deletion
- Branded launcher icons + Play 512 icon + feature graphic
- Listing copy draft in `mobile/store/PLAY_LISTING_COPY.md`
- Backup disabled, no ads ID, no background location
- Permission disclosure + account deletion UX
- Native push plumbing (needs Firebase keys to actually send)

## Provide these next

### 1) Keystore passwords (or say “generate for me”)

**What:** Two passwords (store + key), or one shared password is fine for first upload.  
**Why:** Signs the `.aab` Play will accept. Without this we cannot build a release bundle.  
**How:** Reply with passwords you want, OR say “generate and tell me where the file is” and we create `android/anytime-workforce-upload.jks` + `android/keystore.properties` (gitignored).  
**Keep forever:** Losing the upload key makes Play updates painful.

### 2) Firebase `google-services.json`

**What:** File from Firebase Console → Android app package `com.anytimediesel.workforce`.  
**Why:** Required for Android push (FCM). Play listing can ship without push, but alerts will not work in the store app.  
**How:** Download and place at `android/app/google-services.json` (or send the file and we place it). Do **not** commit to GitHub.

### 3) FCM server key (for production API)

**What:** Firebase Cloud Messaging server key (Cloud Messaging API legacy key, or we document HTTP v1 later).  
**Why:** Backend must send pushes to phones that registered a native token.  
**How:** Paste the key; we add it to server `.env` as `FCM_SERVER_KEY` on `13.204.5.57` and restart `atd-backend`. Never put it in Git.

### 4) Support / contact email for Play listing

**What:** Public email users/Google can contact (e.g. `hrms@anytimediesel.com`).  
**Why:** Required on the store listing and used in account-deletion mailto.  
**Confirm:** Is `hrms@anytimediesel.com` correct? If not, send the right one.

### 5) Phone screenshots (5 images)

**What:** PNG/JPG from a real phone (or Chrome device mode at ~1080×1920): login, dashboard, My Attendance, leave apply, profile.  
**Why:** Play rejects listings without screenshots.  
**How:** Drop files into `mobile/assets/screenshots/` or send them here.

### 6) Reviewer test employee login (can wait until Console is live)

**What:** Email + password for a normal employee account (not Developer Admin).  
**Why:** Google review often needs to sign in. Pause Face Security for that user if face gate would block them.  
**When:** After Play Console verification finishes.

### 7) JDK + Android SDK on this machine (or build on another PC)

**What:** Confirm whether you can install Android Studio on this Linux machine, or you have another Windows/Mac with Android Studio.  
**Why:** This environment currently has **no Java / Android SDK**, so we cannot produce the `.aab` here until that is installed.  
**Options:**  
- A) Install Android Studio here (you run installer / sudo)  
- B) You build on another PC after we prepare keystore + `google-services.json`  
- C) You give sudo and ask us to install OpenJDK + command-line SDK (heavier)

## Not needed until Console is verified

- Creating the Play app listing (blocked on verification)
- Uploading AAB
- Data Safety form click-through (answers already drafted in `docs/MOBILE_STORE_RELEASE.md`)

## Reply template (copy/paste)

```text
1) Keystore: generate for me / OR passwords: store=___ key=___
2) google-services.json: will upload / path=___
3) FCM_SERVER_KEY: ___
4) Support email: ___
5) Screenshots: will add to mobile/assets/screenshots/
6) Build machine: this Linux with Android Studio / other PC / install OpenJDK here
7) Reviewer test login: later / email=___ password=___
```
