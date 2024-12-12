import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const allowedGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const isBrowser = typeof window !== 'undefined';
  const isLoggedIn = isBrowser && !!localStorage.getItem('user');

  if (isLoggedIn) {
    // If logged in, redirect to the home page
    router.navigate(['/home']);
    return false; // Deny access
  }
  return true; // Allow access
};
