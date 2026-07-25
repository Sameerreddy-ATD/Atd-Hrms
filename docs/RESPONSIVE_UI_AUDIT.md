# Responsive UI Audit

## Objective

The application must remain clear and operable from a 320 px phone through tablet, laptop, desktop,
and installed-PWA viewports. Responsive behavior is a shared design-system responsibility rather
than a separate mobile application.

## Audited Surfaces

The July 2026 audit reviewed the application shell, header/sidebar navigation, page headers,
toolbars, tables, cards, dialogs, forms, face enrollment, face attendance, Developer Admin face
security, employee/user management, attendance, leave, tasks, assets, announcements, profile, ID
card, reports, and settings source layouts.

The code audit confirmed:

- the application shell constrains page width and prevents page-level horizontal overflow;
- shared tables own touch-friendly horizontal scrolling instead of widening the full page;
- mobile navigation uses the existing sidebar sheet;
- forms use single-column mobile layouts before introducing additional columns;
- shared dialogs use viewport-relative maximum height, internal scrolling, large touch close
  controls, and accessible Radix focus management;
- toolbars stack full-width controls on phones and wrap into compact rows at larger breakpoints;
- reduced-motion preferences disable decorative animation;
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

## Responsive Standards

- Phone-first breakpoint: one column and full-width primary controls.
- Minimum interactive target: 44 px for critical mobile actions.
- Never hide required actions solely because of viewport width.
- Use `min-w-0` on flex/grid children that contain user data.
- Long identifiers and error messages must wrap or truncate with an accessible full context.
- Dense operational tables may scroll inside their table container; the page itself must not.
- Dialogs must use `100dvh`-based limits and keep headers/actions available.
- Respect safe areas, browser text scaling, keyboard navigation, focus indicators, reduced motion,
  and touch scrolling.
- Do not crop identity evidence in a way that removes face context.

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
- 768 × 1024
- 1024 × 768
- 1366 × 768
- 1920 × 1080

At each size confirm there is no page-level horizontal overflow, clipped dialog, overlapping text,
unreachable action, unstable media height, or control smaller than the expected touch target.
