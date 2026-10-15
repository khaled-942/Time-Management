import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserProfile } from '../models';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<any>(null); // Initial value is null
  user$: Observable<any> = this.userSubject.asObservable(); // Expose as an observable

  /** The signed-in user's profile, or null before it has loaded. */
  get current(): UserProfile | null {
    const user = this.userSubject.value;
    return user?.userId ? user : null;
  }

  setUser(user: any): void {
    this.userSubject.next(user); // Emit the user data
  }

  clearUser(): void {
    this.userSubject.next({
      id: '',
      name: '',
      email: '',
      currentAvatar: '',
    }); // Emit null to clear user
  }
}
