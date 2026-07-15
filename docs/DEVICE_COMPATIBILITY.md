# Device Compatibility Guide

The application uses responsive web and Progressive Web App behavior. The supported target is the current and previous major browser version on common phones, tablets, and laptops.

## Supported Device Families

| Device                | Browser / installed mode      | Required checks                                                                                    |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| iPhone and iPad       | Safari and Add to Home Screen | HTTPS, cookies enabled, Precise Location enabled, location set to While Using                      |
| Google Pixel          | Chrome and installed PWA      | Location permission allowed, device Location enabled, Chrome updated                               |
| Samsung               | Chrome or Samsung Internet    | Location permission allowed, battery restrictions disabled when permission prompts are delayed     |
| Vivo and Oppo         | Chrome                        | Location permission allowed, browser auto-start/background restrictions reviewed for notifications |
| Windows laptop/tablet | Chrome or Edge                | Cookies enabled, responsive navigation, export and print checks                                    |
| macOS                 | Safari or Chrome              | Cookies enabled, HTTPS, notification permission when required                                      |

## Location Requirements

- Production must use HTTPS. Browser geolocation is not reliably available over plain HTTP except on localhost.
- The user must interact with the attendance control before the browser can display a permission prompt.
- The application cannot force an Allow/Block system dialog. When permission was previously denied, the user must change it in browser or operating-system site settings.
- iPhone users should enable Precise Location for accurate branch-radius checks.
- Android users should enable device Location and grant the browser precise location while using the app.
- A branch needs valid latitude, longitude, and radius in the Branches screen.

## Installed App Behavior

- Add the application through Safari's Add to Home Screen on iOS or Chrome's Install/Add to Home Screen on Android.
- Installed mode removes the normal browser address bar when the manifest and HTTPS requirements are satisfied.
- Authentication uses secure cookies; no production token is stored in local storage.
- Closing and reopening the installed app should restore the session through the refresh cookie.

## Responsive Acceptance Matrix

Test at minimum:

- 320 x 568 small phone
- 360 x 800 Android phone
- 390 x 844 modern iPhone
- 412 x 915 large Android phone
- 768 x 1024 tablet portrait
- 1024 x 768 tablet landscape
- 1366 x 768 laptop
- 1920 x 1080 desktop

For every size verify no overlapping text, horizontal page overflow, clipped dialogs, inaccessible actions, undersized touch targets, or tables without horizontal scrolling. Test login, navigation, attendance permission, leave submission, task details, employee/user lists, holidays, and assets.

## Important Limitation

No web application can guarantee identical behavior on every OS build or vendor-customized browser. Production readiness requires testing on representative real devices after each major browser, iOS, or Android update. The responsive layout and standards-based APIs provide broad compatibility, while the matrix above is the release gate.
