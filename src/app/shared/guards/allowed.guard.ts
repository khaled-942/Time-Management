import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export const allowedGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return true;
  }

  const user = await authService.currentUser();
  const isLoggedIn = !!user && !!localStorage.getItem('user');

  if (isLoggedIn) {
    // If logged in, go straight to the dashboard
    return router.createUrlTree(['/dashboard']);
  }
  return true; // Allow access
};
