# Device Compatibility Guide

The application uses responsive web and Progressive Web App behavior. The supported target is the current and previous major browser version on common phones, tablets, and laptops.

## Supported Device Families

| Device                | Browser / installed mode      | Required checks                                                                                   |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| iPhone and iPad       | Safari and Add to Home Screen | HTTPS, camera, cookies, Precise Location, location While Using, current iOS                       |
| Google Pixel          | Chrome and installed PWA      | Camera/location allowed, precise device Location enabled, WebGL, Chrome updated                   |
| Samsung               | Chrome or Samsung Internet    | Camera/location allowed, WebGL, battery restrictions reviewed when permission prompts are delayed |
| Vivo and Oppo         | Chrome                        | Camera/location allowed, WebGL, browser auto-start/background restrictions reviewed               |
| Windows laptop/tablet | Chrome or Edge                | Camera, location, cookies, WebGL, responsive navigation, export and print checks                  |
| macOS                 | Safari or Chrome              | Camera, precise location, cookies, HTTPS, WebGL, notification permission when required            |

## Location Requirements

- Production must use HTTPS. Browser geolocation is not reliably available over plain HTTP except on localhost.
- The user must interact with the attendance control before the browser can display a permission prompt.
- The application cannot force an Allow/Block system dialog. When permission was previously denied, the user must change it in browser or operating-system site settings.
- iPhone users should enable Precise Location for accurate branch-radius checks.
- Android users should enable device Location and grant the browser precise location while using the app.
- A branch needs valid latitude, longitude, and radius in the Branches screen to classify nearby punches as `Mobile - Branch Name`. Outside punches remain `Mobile` and retain their coordinates.

## Installed App Behavior

- Add the application through Safari's **Add to Home Screen** on iOS, Chrome/Edge **Install app**
  on Android/Windows/macOS, or follow the in-app install banner after sign-in.
- The web app manifest uses standalone display, maskable icons, launch handling for existing
  windows, and shortcuts to Dashboard, My Attendance, Notifications, and Apply Leave.
- Installed mode removes the normal browser address bar when the manifest and HTTPS requirements
  are satisfied.
- Authentication uses secure cookies; no production token is stored in local storage.
- Closing and reopening the installed app should restore the session through the refresh cookie.
- Web Push requires HTTPS, a valid VAPID configuration, an installed service worker, and user
  permission. iOS Web Push requires the site to be added to the Home Screen on iOS 16.4+ and opened
  from that icon before alerts can be enabled.
- Open app sessions receive live attendance and announcement refresh through authenticated
  server-sent events.
- Notification clicks open the Notifications screen; Android/desktop badges clear when that screen
  is viewed. Offline navigation shows a branded reconnect message when the shell cache is empty.

## Install Checklist By Platform

| Platform | How employees install | Alerts |
| -------- | --------------------- | ------ |
| Android (Chrome / Samsung Internet) | Install app / Add to Home screen from browser or in-app banner | Enable Alerts after install for background push |
| iPhone / iPad (Safari) | Share → Add to Home Screen, then open from the icon | Enable Alerts inside the installed app (iOS 16.4+) |
| Windows (Chrome / Edge) | Install app from address bar or browser menu | Enable Alerts for desktop notifications |
| macOS (Chrome / Edge / Safari) | Install / Add to Dock where available | Enable Alerts after opening the installed app |

The in-app banner and Notifications page show platform-specific steps. Employees can dismiss the
banner for two weeks; it does not appear when the app is already running in standalone mode.

## Face Registration and Camera Requirements

- While employee face verification is enabled, every normal account is blocked after password
  setup until its registration is approved; Developer Admin is exempt. Paused mode removes the
  gate and check-in camera but still requires precise location.
- Camera and face-model APIs require HTTPS outside localhost. WebGL should remain enabled.
- Keep exactly one face in the frame, use even lighting, and remove masks or dark/tinted glasses.
  Clear spectacles are supported; reduce glare when it crosses the eyes.
- The optimized version-pinned model set is approximately 10.2 MB. It preloads from the dashboard
  and repeat use normally comes from browser cache.
- A registration or attendance capture cannot be completed offline.
- Camera denial must be reversed in site/OS settings. The application cannot override a denial.
- Verify the full-screen gate and check-in camera dialog in portrait and landscape without clipped
  controls. Check-out must request location without opening the camera.
- Verify the Developer Admin evidence history as one readable record per capture: the complete
  image must remain visible, metadata must wrap, and scrolling must stay inside the dialog.

## Low-Network Behavior

- Previously loaded app pages and static assets can reopen from the service-worker cache when the network is slow.
- API data, login, attendance submission, leave submission, and destructive actions still require a working server connection and are never treated as successful offline.
- The UI should retain stable loading states and allow retry after connectivity returns.
- Test network recovery by switching between Wi-Fi and mobile data while the installed app is open.

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

For every size verify no overlapping text, horizontal page overflow, clipped dialogs, inaccessible
actions, undersized touch targets, or primary list screens that require horizontal scrolling just
to read key fields. Prefer the card layout on phones and the table layout from tablet width.
Test login, mandatory face registration, camera/location denial, movement challenge,
pending/rejected approval, Developer Admin mismatch/evidence history, face-verified check-in,
location-only checkout, live timer/cross-device checkout, leave submission, task details (list,
Kanban, and timeline on phone), employee/user lists, holidays, assets, announcements, notification
permission, account-deactivation confirmation, expense attachment acknowledgement, and the
Developer Admin integration credential panel. Also confirm keyboard skip-to-content and visible
focus rings on primary controls.

## Important Limitation

No web application can guarantee identical behavior on every OS build or vendor-customized browser. Production readiness requires testing on representative real devices after each major browser, iOS, or Android update. The responsive layout and standards-based APIs provide broad compatibility, while the matrix above is the release gate.
