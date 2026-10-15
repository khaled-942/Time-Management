import { Routes } from '@angular/router';
import { loggedInFormGuard } from './shared/guards/logged-in-form.guard';
import { allowedGuard } from './shared/guards/allowed.guard';
import { adminGuard } from './shared/guards/admin.guard';
import { FEATURES } from './shared/features';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./layout/layout.component').then((c) => c.LayoutComponent),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./layout/profile/profile.component').then(
        (c) => c.ProfileComponent
      ),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'nation-days',
    loadComponent: () =>
      import('./layout/nation-days/nation-days.component').then(
        (c) => c.NationDaysComponent
      ),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import(
        './layout/time-management-dashboard/time-management-dashboard.component'
      ).then((c) => c.TimeManagementDashboardComponent),
    canActivate: [loggedInFormGuard],
  },
  ...(FEATURES.leaveRequests
    ? [
        {
          path: 'leave',
          loadComponent: () =>
            import('./layout/leave/leave.component').then((c) => c.LeaveComponent),
          canActivate: [loggedInFormGuard],
        },
      ]
    : []),
  {
    path: 'my-tasks',
    loadComponent: () =>
      import('./layout/my-tasks/my-tasks.component').then((c) => c.MyTasksComponent),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./layout/projects/projects.component').then((c) => c.ProjectsComponent),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./layout/admin/admin.component').then((c) => c.AdminComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/log-in/log-in.component').then((c) => c.LogInComponent),
    canActivate: [allowedGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then(
        (c) => c.RegisterComponent
      ),
    canActivate: [allowedGuard],
  },
  // Salary module removed — salary calculation is now shown inside the dashboard
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(
        (c) => c.NotFoundComponent
      ),
  },
];
