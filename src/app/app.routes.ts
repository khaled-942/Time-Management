import { Routes } from '@angular/router';
import { loggedInFormGuard } from './shared/guards/logged-in-form.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./layout/layout.component').then(
        (c) => c.LayoutComponent
      ),
    canActivate: [loggedInFormGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/log-in/log-in.component').then((c) => c.LogInComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then(
        (c) => c.RegisterComponent
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(
        (c) => c.NotFoundComponent
      ),
  },
];
