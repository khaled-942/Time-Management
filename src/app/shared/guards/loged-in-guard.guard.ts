import { CanActivateFn } from '@angular/router';

export const logedInGuardGuard: CanActivateFn = (route, state) => {
  return true;
};
