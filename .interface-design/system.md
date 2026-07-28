# Anytime Workforce — Interface Design Memory

Product UI for an internal workforce and operations app (dashboards, tables,
forms, attendance, leave). Not a marketing site.

## Direction

- Brand: Anytime Diesel (company) / Anytime Workforce (product)
- Tone: operational, calm, trustworthy industrial SaaS
- Density: comfortable-compact for data screens; roomier for profile / empty states
- Accent: existing primary brand color from app tokens (do not invent purple)

## Layout

- Shell: sidebar + header already established — preserve
- Lists: mobile cards / desktop tables via `ResponsiveList` (`md` breakpoint)
- Page chrome: `PageHeader` title + short description; avoid hero marketing layouts inside `/_app`

## Spacing & radius

- Prefer Tailwind spacing on an 4/8 scale already used by sibling screens
- Cards: use shadcn `Card` only when it aids grouping or interaction; do not card-wrap everything
- Radius: follow existing shadcn component radii

## Typography

- Use fonts already loaded by the app
- Hierarchy: page title > section accordion/trigger > field label > helper text
- Avoid introducing Inter/Roboto/Arial as new defaults

## Depth

- Prefer borders + muted backgrounds over heavy shadows
- One elevation language; no stacked glow effects

## Motion

- Purpose-only; 150–300ms chrome transitions
- Always support `prefers-reduced-motion`
- Prefer CSS / existing Radix accordion animations over new animation libraries unless already in package.json

## Components to reuse

- `PageHeader`, `LoadingState`, `ResponsiveList`, `StatusBadge`, `TableToolbar`
- shadcn: Button, Card, Accordion, Dialog, Sheet, Select, Input, Badge

## Anti-patterns for this product

- Generic purple AI dashboards
- Decorative gradient blobs behind data tables
- Pill clusters / stat strips that fight the real task
- Revealing admin process language in employee-facing empty states
