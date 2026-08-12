# Waiting on you — Play launch inputs

Play Console can stay in verification. Below is what **only you** still need to finish vs what is already done on this laptop.

## Already done (no action)

- Capacitor Android/iOS projects (`com.anytimediesel.workforce`)
- Production site live with Privacy, Terms, Account deletion
- Branded launcher icons + Play 512 icon + feature graphic
- Listing copy draft in `mobile/store/PLAY_LISTING_COPY.md`
- Backup disabled, no ads ID, no background location
- Permission disclosure + account deletion UX
- Upload keystore generated + passwords saved under `~/Anytime-Workforce-Credentials` (not in Git)
- `google-services.json` placed locally (gitignored) + Firebase project `atd-workforce`
- JDK 21 + Android SDK on this machine; signed AAB built (`targetSdk` 36)
- Digital Asset Links file for App Links
- Backend supports FCM HTTP v1 (`FCM_SERVICE_ACCOUNT_JSON`) + legacy key fallback

## Still needed from you

### 1) Play Console verification

**What:** Finish Google Play developer account verification.  
**Why:** Blocks creating the listing and uploading the AAB.  
**When ready:** Upload `~/Anytime-Workforce-Credentials/play-upload/AnytimeWorkforce-1.0.0.aab` to Internal testing.

### 2) FCM service account JSON (optional for first ship)

**What:** Firebase Console → Project settings → Service accounts → Generate new private key (JSON).  
**Why:** Production backend sends native Android pushes via FCM HTTP v1.  
**How:** We place the stringified JSON in server `.env` as `FCM_SERVICE_ACCOUNT_JSON` (and `FCM_PROJECT_ID=atd-workforce`) on `13.204.5.57`, then restart `atd-backend`. Never commit to Git.  
**Note:** Legacy `FCM_SERVER_KEY` is fallback only; Cloud Console often hides the old key.

### 3) Support / contact email for Play listing

**What:** Public email for the listing and account-deletion mailto.  
**Confirm:** Is `hrms@anytimediesel.com` correct?

### 4) Phone screenshots (5 images)

**What:** PNG/JPG ~1080×1920: login, dashboard, My Attendance, leave apply, profile.  
**Why:** Play rejects listings without screenshots.  
**How:** Drop into `mobile/assets/screenshots/` or send here.

### 5) Reviewer test employee login (after Console is live)

**What:** Email + password for a normal employee (not Developer Admin).  
**Why:** Google review often needs to sign in. Pause Face Security for that user if the gate would block them.

## Not needed until Console is verified

- Creating the Play app listing
- Uploading AAB
- Data Safety form click-through (answers drafted in `docs/MOBILE_STORE_RELEASE.md`)

## Reply template

```text
1) Play Console: still verifying / verified — ready to upload
2) FCM service account JSON: will upload / skip for first ship
3) Support email: ___
4) Screenshots: will add to mobile/assets/screenshots/
5) Reviewer test login: later / email=___ password=___
```
