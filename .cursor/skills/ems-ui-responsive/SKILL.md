---
name: ems-ui-responsive
description: >-
  Build and polish responsive UI for Anytime Workforce.
  Use when designing, restyling, or fixing pages, components, forms,
  tables, empty states, dashboards, profile, attendance, leave, or mobile
  layouts in this repo — and when the user asks for better UI, UX, animations,
  responsiveness, or polish.
---

# EMS UI / UX / Motion

Apply this skill for every UI change in this repository. Prefer craft and
consistency over novelty.

## Always load companion skills first

Read these personal skills when relevant (paths under `~/.cursor/skills/`):

| Need | Skill |
| --- | --- |
| Product UI craft, hierarchy, tokens, consistency | `interface-design` |
| Component patterns (60+) | `ui-design-brain` |
| Taste, anti-AI-defaults, typography, layout, a11y | `design-engineering` |
| Whether/how to animate (principles) | `design-engineering` → motion MOC |
| Runnable motion recipes by scene | `motion-ref` and/or `fluke-motion` |

Do **not** invent a new visual system when existing EMS patterns already work.

## Preserve this product’s design system

1. Keep Anytime Workforce product naming, Anytime Diesel company branding, existing CSS variables, and shadcn/Tailwind
   patterns already in the app.
2. Do **not** default to purple gradients, Inter/Roboto, cream+terracotta
   broadsheet looks, emoji decoration, or multi-layer glow cards.
3. Match nearby screens: `PageHeader`, `LoadingState`, `ResponsiveList`,
   `StatusBadge`, existing Card/Button density.
4. Respect user frontend-design rules already in the session (hero budget,
   brand-first, one job per section) for marketing-like surfaces; for app
   chrome (dashboard/tables), optimize clarity and density instead.

## Responsive rules (hard)

1. Phone-first for lists: use `ResponsiveList` / mobile cards below `md`,
   desktop tables from `md` up — same pattern as Employees and leave screens.
2. No horizontal page scroll on 360px widths. Tables must stack or card-ify.
3. Touch targets ≥ 44px on primary actions; full-width primary CTAs on small
   screens when the desktop layout uses a compact toolbar.
4. Dialogs/sheets must fit short viewports (`max-h` + scroll inside).
5. Toolbars: wrap filters; avoid fixed multi-column filter rows that crush on
   mobile.

## Motion rules (hard)

1. Animate only with purpose: feedback, hierarchy, waiting, attention.
2. Prefer transform/opacity; 150–300ms for UI chrome; springs only when the
   stack already uses them.
3. Always honor `prefers-reduced-motion: reduce`.
4. Do not animate every card entrance on data-heavy admin tables.
5. Reuse existing loaders (`LoadingState`, diesel boot loader) instead of new
   spinners.

## Workflow

1. Inspect the target route + closest sibling screens.
2. Load `interface-design` + `ui-design-brain` (and motion skills if animating).
3. If `.interface-design/system.md` exists in the repo root, follow it.
4. Implement the smallest change that improves hierarchy, spacing, and mobile.
5. Verify mentally at ~360 / 768 / 1280 widths before finishing.

## Key files

- `src/components/common/ResponsiveList.tsx`
- `src/components/common/PageHeader.tsx`
- `src/components/layout/AppSidebar.tsx` / `AppHeader.tsx`
- `src/styles.css`
- `docs/RESPONSIVE_UI_AUDIT.md` (when auditing)
