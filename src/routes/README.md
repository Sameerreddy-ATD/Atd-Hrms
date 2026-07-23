# Frontend Routes

TanStack Start uses file-based routing in this directory. `src/routeTree.gen.ts` is generated and must not be edited manually.

## Project Conventions

- `__root.tsx` is the root document and application shell.
- `_app.tsx` is the authenticated layout.
- `_app.<name>.tsx` maps to an authenticated route such as `_app.users.tsx` -> `/users`.
- `$employeeId` is a dynamic path parameter.
- Route components call the central API client in `src/services/api/`.
- Backend authorization remains mandatory even when a route or button is hidden.
- Every API-backed page needs loading, error, empty, and responsive states.

Keep page-specific logic in the route and move reusable feature UI into `src/components/`. Do not create parallel `pages/` or Next.js-style route directories.
