import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  const isAdmin = isBrowser ? localStorage.getItem('isAdmin') : null;
  // console.log(isAdmin);

  if (isAdmin == 'true') {
    return true; // Allow access if the user is an admin
  }

  router.navigate(['/home']);
  return false;
};
