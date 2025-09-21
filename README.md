# Time Management Application

A comprehensive time management and scheduling application built with Angular 18. This application helps users manage their time efficiently with features like calendar management, user authentication, and administrative controls.

## Features

- User Authentication (Login/Register)
- Interactive Calendar Management
- User Profile Management
- Administrative Dashboard
- National Days Overview
- Responsive Layout with Side Navigation
- Time Management Dashboard
- Salary Calculator Based on Working Hours

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Angular CLI (v18.2.6)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Run the development server:

```bash
npm start
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Project Structure

```
src/
├── app/
│   ├── auth/           # Authentication components and services
│   ├── layout/         # Layout components (nav-bar, side-bar, etc.)
│   └── shared/         # Shared components, services, and utilities
```

## Business logic (core rules and data shapes)

This section documents the important business rules and data shapes developers must preserve when changing code.

- Date window / reporting period

  - The app uses a non-standard month window for reporting: the 11th → 10th window. Many queries use this window (see `HttpRequestsService.getUserMonthDays`).
  - Example: when viewing a month, days from the 11th of the previous month through the 10th of the selected month are included.

- Firestore data model (important paths)

  - `users` collection: stores user profiles (each document typically has fields like `userId`, `name`, `birthDate`, etc.).
  - Nested days collection: `users/{userId}/days/{dayId}` — used to store per-day time data and events. Typical fields:
    - `start` (string/ISO date used for queries)
    - `in` / `out` (ISO timestamps for check-in / check-out)
    - `isDayOff` (boolean)
    - `dayOffType` (number: 0=paid day off, -1=absent, 1=task)
    - `isLate`, `isEarlyLeave`, `lateExcuse`, `earlyLeaveExcuse` (flags for attendance logic)

- Authentication and session

  - Uses Firebase Auth via `@angular/fire`. See `src/app/auth/auth.service.ts` for register/login/logout helpers.
  - Local storage keys used by the UI: `user` (JSON with `id`, `token`, `date`) and `isAdmin` (stringified boolean).
  - Login sets localStorage and emits `loginStatusChanged` (EventEmitter) so layout components can react.

- Salary & deductions rules (high level)

  - Salary calculation is performed per-period (uses `SalaryService`). The UI triggers salary calculations for a month-window and displays:
    - `regularPay`, `overtimePay`, `deductions` (late/absence), and `totalPay`.
  - Excuse hours are calculated with a hard cap/limit: 4 hours (4 _ 60 _ 60 \* 1000 ms). Thursdays have a shorter working window (4.5 hours) and are handled specially in the excuse calculation.
  - If no salary is defined for a user, services may return an error (`NO_SALARY_DEFINED`) which the UI uses to show a friendly state instead of crashing.

- Guards and SSR safety
  - The app supports SSR. Browser-only APIs (localStorage, window, document) must be guarded with `isPlatformBrowser()` or `typeof window !== 'undefined'` checks.
  - Many guards and components check for platform before accessing localStorage — preserve that pattern when adding initialization logic.

## Where to look for specific logic

- Route definitions & lazy-loading: `src/app/app.routes.ts`
- SSR bootstrap and server: `src/main.server.ts`, `server.ts`, `src/app/app.config.server.ts`
- Firestore helpers and queries: `src/app/shared/services/http-requests.service.ts`
- Authentication flows: `src/app/auth/auth.service.ts` and `src/app/auth/log-in/log-in.component.ts`
- Salary calculations: `src/app/salary/services/salary.service.ts` and `src/app/salary/components/salary-calculator/`
- Dashboard & reporting logic: `src/app/layout/time-management-dashboard/time-management-dashboard.component.ts`
- Route guards: `src/app/shared/guards/`

## Developer notes / gotchas

- Don't change the 11th→10th date window without discussing it: reports and the calendar UI assume this window.
- When writing Firestore queries, prefer `setDoc(doc(...), data, { merge: true })` for partial updates (used around day events).
- Avoid accessing `localStorage`/`document` in constructors or unguarded `ngOnInit` — use `isPlatformBrowser()` or `typeof window` checks and prefer running client-only initialization inside a guarded block.

If you'd like, I can expand this section with concrete examples, sample Firestore document shapes, or add unit tests that assert the 11th→10th behavior.

## Main Components

- **Authentication**: Handles user login and registration
- **Calendar**: Full calendar implementation for event management
- **Profile**: User profile management
- **Admin Dashboard**: Administrative controls and overview
- **Time Management Dashboard**: Main interface for time management features

## Testing

Run unit tests:

```bash
npm test
```

## Building for Production

Build the project:

```bash
npm run build
```

Build artifacts will be stored in the `dist/` directory.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License.
