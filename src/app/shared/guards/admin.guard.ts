import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  const isAdmin = localStorage.getItem('isAdmin');
  console.log(isAdmin);

  if (isAdmin == 'true') {
    return true; // Allow access if the user is an admin
  }

  router.navigate(['/home']);
  return false;
};
