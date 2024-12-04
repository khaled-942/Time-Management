import { Injectable } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);

  constructor() {}

  // Register a new user with email and password
  async register(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential;
    } catch (error) {
      return error;
    }
  }

  // Sign in an existing user with email and password
  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential;
    } catch (error) {
      return error;
    }
  }

  // Sign out the current user
  async logout() {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}
