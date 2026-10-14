import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return router.createUrlTree(['/home']);
  }

  const user = await authService.currentUser();
  if (!user) {
    authService.clearSession();
    return router.createUrlTree(['/login']);
  }

  try {
    if (await authService.isAdmin(user.uid)) {
      return true; // Allow access if the user is an admin
    }
  } catch (error) {
    console.error('Error checking admin access:', error);
  }

  return router.createUrlTree(['/home']);
};
