## Quick orientation for AI coding agents

This repo is an Angular 18 single-page application with optional SSR. Below are concise, actionable notes that help you be productive immediately.

### Big picture

- Angular 18 app (standalone components) in `src/` with lazy-loaded routes declared in `src/app/app.routes.ts`.
- Server-side rendering is wired: `src/main.server.ts`, `server.ts` (Express + CommonEngine) and `src/app/app.config.server.ts`.
- Firebase (Auth + Firestore) is used as the primary backend via `@angular/fire` — see `src/app/auth/auth.service.ts` and `src/app/shared/services/http-requests.service.ts`.

### Useful files to open first

- `package.json` — scripts (dev, build, test, serve:ssr:Time-Management).
- `angular.json` — build/ssr configuration and output paths (`dist/time-management`).
- `server.ts` — Express SSR entry (serves `../browser` and renders via `CommonEngine`).
- `src/app/app.routes.ts` — routing conventions: uses `loadComponent` and `loadChildren` (lazy loading and standalone components).
- `src/app/auth/auth.service.ts` and `src/app/shared/services/http-requests.service.ts` — canonical patterns for Firestore queries and collection paths.

### Project-specific conventions and patterns

- Components are standalone and loaded lazily with `loadComponent` — prefer this pattern when adding new UI pages.
- Styles use SCSS. Component files follow the familiar `.component.ts`, `.component.html`, `.component.scss` layout in the same folder.
- Firestore collections used: `users`, `holidays`, and nested `users/{userId}/days`. Example save path: `users/${userId}/days/${day}` (see `HttpRequestsService.saveDayEvent`).
- Local storage keys: `'user'` and `'isAdmin'` are used by `AuthService.isLoggedIn()` / `logout()`.
- Date-range logic for month queries: `getUserMonthDays` uses an 11th-to-10th window (important when filtering months).

### Build / run / test (what actually works from repo)

- Dev server: `npm start` → runs `ng serve` (README also documents this).
- Unit tests: `npm test` → Karma/Jasmine (configured via `angular.json` + `tsconfig.spec.json`).
- SSR: after building, the project produces `dist/time-management`. The repo exposes `serve:ssr:Time-Management` which calls `node dist/time-management/server/server.mjs`. Typical flow:
  1. `npm run build` (or `ng build` + server build) to produce `dist`
  2. `npm run serve:ssr:Time-Management` to run the built server (the package.json script name is `serve:ssr:Time-Management`).

### How to modify routes or add pages

- Add a new standalone component under `src/app/...` with `[name].component.(ts|html|scss)`.
- Export the component as a standalone component and lazy-load it from `src/app/app.routes.ts` using `loadComponent: () => import('...').then(m => m.YourComponent)`.
- For larger feature areas, add a module under `src/app/` and lazy-load with `loadChildren` (see `salary/salary.module.ts`).

### Firestore and backend integration notes

- Follow the existing patterns in `HttpRequestsService` and `AuthService` for queries, ordering, and pathing. Use `collection`, `doc`, `query`, `where`, `orderBy`, `getDocs` consistently.
- When adding writes, prefer `setDoc(doc(this.firestore, path), data, { merge: true })` for partial updates (used in `saveDayEvent`).

### Testing & verification checklist for PRs

- Run `npm install` then `npm start` to smoke-test the app.
- Run `npm test` to ensure unit tests pass.
- If your change touches SSR, run a full build and the `serve:ssr:Time-Management` script and verify server output in `dist/time-management`.

### Where to be careful / gotchas

- Date window logic in `getUserMonthDays` is non-standard (11th → 10th). Changing it will affect many UI views and reports.
- Many services assume browser localStorage (AuthService checks platform with `isPlatformBrowser`). For SSR-safe changes, prefer DI tokens and server-aware guards in `app.config.server.ts`.
- Routing uses guards located in `src/app/shared/guards/` — update them when changing access rules.

### Example references (copy-paste paths)

- Route definitions: `src/app/app.routes.ts`
- SSR bootstrap: `src/main.server.ts`, `src/app/app.config.server.ts`, `server.ts`
- Auth: `src/app/auth/auth.service.ts` (uses `@angular/fire/auth` + localStorage)
- Firestore helpers: `src/app/shared/services/http-requests.service.ts`

If anything here is unclear or you'd like more examples (unit-test patterns, a typical PR checklist, or automatic lint/build steps), tell me which area to expand and I'll iterate.
