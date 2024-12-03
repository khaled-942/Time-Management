import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'logIn', pathMatch: 'full' },
  {
    path: 'Home',
    loadComponent: () =>
      import('./layout/home-page/home-page.component').then(
        (c) => c.HomePageComponent
      ),
  },
  {
    path: 'logIn',
    loadComponent: () =>
      import('./auth/log-in/log-in.component').then((c) => c.LogInComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(
        (c) => c.NotFoundComponent
      ),
  },
];
