import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

export const allowedUserGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const isLoggedIn = !!localStorage.getItem('user');

  if (!isLoggedIn) {
    // If not logged in, redirect to the login page
    router.navigate(['/login']);
    return false; // Deny access
  }
  return true; // Allow access
};
