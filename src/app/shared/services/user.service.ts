import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private userSubject = new BehaviorSubject<any>(null); // Initial value is null
  user$: Observable<any> = this.userSubject.asObservable(); // Expose as an observable

  setUser(user: any): void {
    this.userSubject.next(user); // Emit the user data
  }

  clearUser(): void {
    this.userSubject.next(null); // Emit null to clear user
  }
}
