import { EventEmitter, Inject, Injectable, PLATFORM_ID } from '@angular/core';
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
  doc,
  updateDoc,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { UserService } from '../shared/services/user.service';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  loginStatusChanged = new EventEmitter<boolean>(); // EventEmitter for status changes
  constructor(
    private firestore: Firestore,
    private router: Router,
    private userService: UserService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

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

  isLoggedIn() {
    if (isPlatformBrowser(this.platformId)) {
      let user = localStorage.getItem('user');
      return !!user;
    }
    return false; // Return false if not in browser context
  }

  // Sign out the current user
  logout() {
    console.log('Logging out...');
    this.userService.clearUser();
    localStorage.removeItem('user');
    this.loginStatusChanged.emit(false);
    this.router.navigate(['/login']);
    signOut(this.auth);
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
    const q = query(colRef, where('userId', '==', userId));
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  async updateUserById(
    userId: string,
    updatedData: Partial<any>
  ): Promise<any> {
    try {
      // Reference to the 'users' collection
      const usersCollectionRef = collection(this.firestore, 'users');

      // Query the collection to find the document with matching userId
      const userQuery = query(
        usersCollectionRef,
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(userQuery);

      if (querySnapshot.empty) {
        throw new Error('User not found');
      }

      // Assuming userId is unique, take the first matched document
      const userDoc = querySnapshot.docs[0];
      const userDocRef = doc(this.firestore, `users/${userDoc.id}`);

      // Update the document
      await updateDoc(userDocRef, updatedData);
      return {
        val: 1,
        msg: 'User updated successfully',
      };
    } catch (error) {
      return {
        val: 0,
        msg: error,
      };
    }
  }
}
