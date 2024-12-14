import { EventEmitter, Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import { inject } from '@angular/core';
import {
  addDoc,
  collection,
  DocumentData,
  DocumentReference,
  Firestore,
  getDocs,
  QuerySnapshot,
  query,
  where,
  WithFieldValue,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { UserService } from '../shared/services/user.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  loginStatusChanged = new EventEmitter<boolean>(); // EventEmitter for status changes
  constructor(private firestore: Firestore, private router: Router, private userService: UserService) {}

  // Register a new user with email and password
  async register(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      return userCredential;
    } catch (error) {
      return error;
    }
  }

  // Sign in an existing user with email and password
  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );
      return userCredential;
    } catch (error) {
      return error;
    }
  }

  // Sign out the current user
  logout() {
    console.log('Logging out...');
    this.userService.clearUser();
    localStorage.removeItem('user');
    this.loginStatusChanged.emit(false);
    this.router.navigate(['/login']);
  }

  saveRegisterdUser<T extends object>(
    collectionName: string,
    data: WithFieldValue<T>
  ): Promise<DocumentReference<DocumentData, DocumentData>> {
    try {
      const colRef = collection(this.firestore, collectionName);
      return addDoc(colRef, data);
    } catch (error) {
      throw error;
    }
  }

  async getUserById(userId: string): Promise<any> {

    const colRef = collection(this.firestore, 'users');
    const q = query(colRef, where('userId', '==', userId))
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  isLoggedIn() {
    // Check for user information in local storage.  Adapt as needed for your auth
    let user = localStorage.getItem('user');
    return !!user; // Returns true if user exists, false otherwise
  }
}
