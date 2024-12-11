import { Injectable } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { inject } from '@angular/core';
import { addDoc, collection, DocumentData, DocumentReference, Firestore, WithFieldValue } from '@angular/fire/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);

  constructor(private firestore: Firestore ,private router: Router) {}

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
  logout() {
    console.log('Logging out...');
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }



  saveRegisterdUser<T extends object>(collectionName: string, data: WithFieldValue<T>): Promise<DocumentReference<DocumentData, DocumentData>> {
    try {
      const colRef = collection(this.firestore, collectionName);
      return addDoc(colRef, data);
    } catch (error) {
      throw error;
  }
  }


}
