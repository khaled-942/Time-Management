import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export const loggedInFormGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return router.createUrlTree(['/login']);
  }

  // Require a real Firebase session, plus the local session the app reads the user id from
  const user = await authService.currentUser();
  let sessionUserId: string | undefined;
  try {
    sessionUserId = JSON.parse(localStorage.getItem('user') ?? 'null')?.id;
  } catch {
    sessionUserId = undefined;
  }
  const isLoggedIn = !!user && sessionUserId === user.uid;

  if (!isLoggedIn) {
    // If not logged in, redirect to the login page
    authService.clearSession();
    return router.createUrlTree(['/login']);
  }
  return true; // Allow access
};
