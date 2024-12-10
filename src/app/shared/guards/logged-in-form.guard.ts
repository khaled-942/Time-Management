import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

export const loggedInFormGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const isBrowser = typeof window !== 'undefined';
  const isLoggedIn = isBrowser && !!localStorage.getItem('user');

  if (!isLoggedIn) {
    // If not logged in, redirect to the login page
    router.navigate(['/login']);
    return false; // Deny access
  }
  return true; // Allow access
};
