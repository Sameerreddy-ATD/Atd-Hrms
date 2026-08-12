# Responsive UI Audit

## Objective

The application must remain clear and operable from a 320 px phone through tablet, laptop, desktop,
and installed-PWA viewports. Responsive behavior is a shared design-system responsibility rather
than a separate mobile application.

## Audited Surfaces

The July 2026 audits reviewed the application shell, header/sidebar navigation, page headers,
toolbars, tables, cards, dialogs, forms, face enrollment, face attendance, Developer Admin face
security, employee/user management, attendance, leave, tasks, assets, announcements, profile, ID
card, reports, settings, departments, audit logs, and device settings.

The code audit confirmed:

- the application shell constrains page width and prevents page-level horizontal overflow;
- a shared `ResponsiveList` pattern (`MobileList` / `DesktopTable`) presents key operational lists
  as readable cards below `md` and as tables from `md` upward;
- shared tables own touch-friendly horizontal scrolling instead of widening the full page;
- mobile navigation uses the existing sidebar sheet with a keyboard-accessible skip link to main
  content;
- forms use single-column mobile layouts before introducing additional columns;
- shared dialogs use viewport-relative maximum height, internal scrolling, large touch close
  controls, and accessible Radix focus management;
- buttons, inputs, selects, and textareas use at least 44 px height on phones and a visible
  `ring-2` focus indicator with offset;
- toolbars and page actions stack full-width controls on phones and wrap into compact rows at
  larger breakpoints;
- Work Planner filters and timeline views provide a stacked phone layout instead of forcing a wide
  Gantt scroll as the only option;
- reduced-motion preferences disable decorative animation;
- login and first-password screens respect safe-area insets and dynamic viewport height;
- the Anytime Diesel crew avatar sits above the sign-in / first-password forms; he closes his eyes
  while a hidden password is focused or typed, opens them when the password is revealed, and falls
  back to the logo if the image fails so the form never crashes;
- laptop/desktop browsers are not auto-prompted to install or add the app to the home screen;
- camera and evidence media cannot exceed their containers.

## Face Evidence Resolution

The previous evidence gallery could render captures as narrow cropped strips with many ambiguous
placeholders. The evidence history now:

- displays one complete record at a time;
- reserves a stable media region so loading cannot collapse the layout;
- uses `object-contain` so the complete encrypted capture remains visible;
- shows an explicit expired/load-failed state instead of an empty strip;
- presents face, liveness, anti-spoof, match, GPS, time, outcome, and failure reason together;
- uses one internal scroll container and a fixed dialog header;
- adapts from a stacked phone card to a side-by-side tablet/desktop record;
- lazy-loads history images to reduce initial work.

The Face Security page also includes employee/email/ID/role search, action filters, counts, and a
clear empty-result state.

## Shared List Pattern

Use [`src/components/common/ResponsiveList.tsx`](../src/components/common/ResponsiveList.tsx) for
new list screens:

| Component            | Role                                              |
| -------------------- | ------------------------------------------------- |
| `ResponsiveListShell`| Bordered container for cards + table              |
| `MobileList`         | Card stack shown below the `md` breakpoint        |
| `MobileListItem`     | One record card with optional actions             |
| `DesktopTable`       | Table wrapper shown from `md` upward              |

Canonical examples: attendance overview/branch/field/corrections, audit logs, device settings,
employees, leave history/approvals/reports, holidays, users, and assets.

## Accessibility Baseline

- Skip link: "Skip to main content" focuses `#main-content` in the app shell.
- Icon-only controls expose `aria-label` (header, board settings, organization chart actions).
- Labels or `aria-label` accompany date filters and search fields.
- Focus rings use `ring-2` with offset on interactive primitives.
- Touch targets for primary controls are `h-11` on phones (`sm:h-9` on larger screens).
- Page-level horizontal overflow is blocked; dense desktop tables may scroll inside their section.

## Responsive Standards

- Phone-first breakpoint: one column and full-width primary controls.
- Minimum interactive target: 44 px for critical mobile actions.
- Never hide required actions solely because of viewport width.
- Use `min-w-0` on flex/grid children that contain user data.
- Long identifiers and error messages must wrap or truncate with an accessible full context.
- Dense operational tables may scroll inside their table container; the page itself must not.
- Prefer card↔table dual layouts for primary lists instead of scroll-only tables on phones.
- Dialogs must use `100dvh`-based limits and keep headers/actions available.
- Respect safe areas, browser text scaling, keyboard navigation, focus indicators, reduced motion,
  and touch scrolling.
- Do not crop identity evidence in a way that removes face context.
- Typography uses **Plus Jakarta Sans** via the shared theme (`--font-sans`) for a clear workplace
  UI on phones and desktops.
- Loading states use the shared logo/truck loaders with a progress bar and dots; honor
  `prefers-reduced-motion`.
- Installed-app UX: phone users may optionally install from **Notifications**; do not auto-prompt
  laptop/desktop browsers. Clear app badges when notifications are viewed.

## August 2026 — fold / tablet / short viewport

- Portrait orientation lock applies only when the **layout** shortest side is under 600 px
  (`src/lib/screen-orientation.ts`). Unfolded foldables, tablets, and wide split-screen stay free
  to rotate; phones re-lock after resize/orientation change.
- Android Manifest no longer hard-sets `screenOrientation=portrait` for every device.
- Dashboard stat and action grids use intermediate breakpoints (`min-[360px]`, `min-[480px]`,
  `md`, `lg`, `xl`) so fold cover, tablet, and laptop densify smoothly.
- Login / first-password: short viewports shrink or hide the crew mascot so the form and CTAs stay
  above the fold (`src/styles.css`).

## Release Verification

Run the normal typecheck, lint, unit tests, frontend/backend builds, and repository audit. Run
Playwright at desktop and Pixel-class mobile sizes. For an authenticated full-role test, supply
`E2E_USERS_JSON` only through the test environment and verify representative employee, HR, CEO,
and Developer Admin navigation.

Manual release coverage remains:

- 320 × 568
- 360 × 800
- 390 × 844
- 412 × 915
- Fold cover / unfolded widths (≈ 280–700+ CSS px depending on device)
- 768 × 1024
- 1024 × 768
- 1366 × 768
- 1920 × 1080

At each size confirm there is no page-level horizontal overflow, clipped dialog, overlapping text,
unreachable action, unstable media height, or control smaller than the expected touch target.
Confirm keyboard users can skip to main content, open the mobile menu, and complete login, leave
apply, attendance punch (or denial messaging), and task open/close flows.
