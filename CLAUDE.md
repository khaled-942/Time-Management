# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — dev server (`ng serve`) at http://localhost:4200
- `npm run build` — production build into `dist/time-management/` (browser + server bundles; `prerender: true` in `angular.json`)
- `npm run serve:ssr:Time-Management` — run the built SSR Express server (`dist/time-management/server/server.mjs`)
- `npm test` — Karma/Jasmine unit tests
- Single spec: `npx ng test --include src/app/app.component.spec.ts` (add `--watch=false` for one run)

No linter is configured. The only existing spec is `src/app/app.component.spec.ts`.

## Architecture

Angular 18 app with standalone components, SSR (Express + `CommonEngine` in `server.ts`, `src/main.server.ts`, `src/app/app.config.server.ts`), and Firebase (Auth + Firestore via `@angular/fire`) as the only backend. Config for Firebase lives in `src/environments/environment.ts`. UI uses PrimeNG 17 + PrimeFlex, FullCalendar, and Chart.js.

- **Routing** (`src/app/app.routes.ts`): every page is lazy-loaded with `loadComponent`. Guards in `src/app/shared/guards/` wait for Firebase Auth (`AuthService.currentUser()`): `loggedInFormGuard` also requires the localStorage `user` session to match, `allowedGuard` keeps logged-in users off login/register, `adminGuard` reads `isAdmin` from Firestore (`users/{uid}`). Access is actually enforced by `firestore.rules` (deployed separately with `firebase deploy --only firestore:rules`). The salary route was removed — salary is now rendered inside the dashboard, but `src/app/salary/` (module, `SalaryService`, models) is still used by `TimeManagementDashboardComponent`.
- **Data access**: all Firestore reads/writes go through `HttpRequestsService` (`src/app/shared/services/http-requests.service.ts`) and `AuthService` (`src/app/auth/auth.service.ts`). Collections: `users`, `holidays`, and per-user `users/{userId}/days/{dayId}`. Partial day updates use `setDoc(..., { merge: true })`.
- **Session state**: login stores `user` (JSON with `id`, `token`, `date`) and `isAdmin` in localStorage; `AuthService.loginStatusChanged` (EventEmitter) notifies layout components. Components read the current user id from `localStorage.getItem('user')` rather than from Firebase Auth state.
- **Theming**: CSS variables defined on `:root` in `src/styles.scss`; reusable SCSS mixins (`themed-card`, `themed-input`, …) in `src/styles/_theme.scss` (`ThemeService` is currently an empty file). Use the variables/mixins instead of hard-coded colors.

## Business rules to preserve

- **Work-schedule rules live in `src/app/shared/utils/work-schedule.ts`** — use its helpers instead of re-deriving dates. `new Date("YYYY-MM-DD")` parses as UTC; use `parseLocalDate`.
- **Reporting period is the 11th → 10th (both inclusive)**, not a calendar month, named after the month it ends in (`periodContaining`, `latestPeriodForMonth`). Dashboard, calendar, and salary calculations all assume this window — don't change it casually.
- **Day documents** (`users/{id}/days/*`): `start` (date string used for range queries/ordering), `in`/`out` (ISO check-in/out), `isDayOff`, `dayOffType` (0 = paid day off, -1 = absent, 1 = task), `isLate`, `isEarlyLeave`, `lateExcuse`, `earlyLeaveExcuse`.
- **Schedule**: work starts 09:00 and ends 17:00; the short day ends 13:30 (Thursday before 1 April 2025, Saturday from then on). Friday is the only weekend.
- **Salary** (`SalaryService.calculateSalaryForPeriod`): the full monthly `salary` from the user profile (set by an admin, read-only for users) minus deductions; daily rate = salary / 30. Each absence (`dayOffType` -1) deducts one day; paid leave, task days, Fridays and days without records cost nothing. Lateness tiers are cumulative (0–30 min: 1st warning, 2nd ¼, 3rd ½ more, 4th+ one day each; 31–60 min: 1st ½, then one day each; >60 min: one day each). Any late *or* early-leave excuse exempts the day. Missing salary throws `Error('NO_SALARY_DEFINED')`, which the dashboard shows as a "salary missing" state. Excuse hours are capped at 4h per period.

## SSR gotchas

Only `/login` and `/register` are server-rendered (prerendered via `prerender-routes.txt`); `server.ts` sends every other path the client-only `index.csr.html`, because those pages depend on the browser-stored session. Add new public pages to both lists. `ng serve` still server-renders every route, so a login flash in dev is expected.

Code runs on the server during SSR/prerender, so never touch `localStorage`, `window`, or `document` unguarded (especially in constructors/`ngOnInit`). The codebase uses either `isPlatformBrowser(this.platformId)` or `typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'` — follow the same pattern.
