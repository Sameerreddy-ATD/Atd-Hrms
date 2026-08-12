# Waiting on you — Play launch inputs

Play Console is **verified**. Upload can proceed. Below is what is already done vs what you still finish in Console.

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
- Play developer account verification

## Do this now (Play Console)

1. Create the app → **Anytime Workforce** / package `com.anytimediesel.workforce`
2. Fill listing from `mobile/store/PLAY_LISTING_COPY.md`
3. Upload graphics + **phone screenshots**
4. Paste legal URLs (privacy / terms / account deletion)
5. Complete Data Safety + content rating (drafts in `docs/MOBILE_STORE_RELEASE.md`)
6. Create **Internal testing** release → upload  
   `~/Anytime-Workforce-Credentials/play-upload/AnytimeWorkforce-1.0.3.aab`  
   (or `~/Downloads/AnytimeWorkforce-1.0.3.aab`)
7. Add your Google account as a tester, install from the testing link, smoke-test login + attendance
8. Store listing: set **App name** to Anytime Workforce, upload `mobile/assets/play-icon-512.png` + feature graphic
9. Prepare a **normal employee** reviewer login (not Developer Admin); pause Face Security for that user if needed

## Optional before / after first ship

### FCM service account JSON

Firebase Console → Project settings → Service accounts → Generate new private key.  
We put stringified JSON in production `.env` as `FCM_SERVICE_ACCOUNT_JSON` (+ `FCM_PROJECT_ID=atd-workforce`) and restart `atd-backend`. Skip for first ship if alerts can wait.

### Support / contact email

Confirm listing email (e.g. `hrms@anytimediesel.com`).

## Reply template

```text
1) Play Console: verified — creating app / uploading AAB
2) FCM service account JSON: will upload / skip for first ship
3) Support email: ___
4) Screenshots: ready / need help capturing
5) Reviewer test login: email=___ password=___
```
