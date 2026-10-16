import { EventEmitter, Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { UserService } from '../shared/services/user.service';
import { PushService } from '../shared/services/push.service';
import { maybe, must, SupabaseService, Timestamp, withoutNulls, withTimestamps } from '../shared/services/supabase.service';
import { UserProfile } from '../shared/models';

/** Result of login/register: the account on success, otherwise an error code. */
export interface AuthResult {
  uid?: string;
  token?: string;
  code?: 'auth/invalid-credential' | 'auth/email-already-in-use' | 'auth/weak-password' | 'auth/invalid-email' | 'auth/unknown';
}

function errorCode(error: any): AuthResult['code'] {
  switch (error?.code) {
    case 'invalid_credentials':
      return 'auth/invalid-credential';
    case 'user_already_exists':
    case 'email_exists':
      return 'auth/email-already-in-use';
    case 'weak_password':
      return 'auth/weak-password';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'auth/invalid-email';
    default:
      return 'auth/unknown';
  }
}

/** A users row as the app uses it (birthDate as a Timestamp, missing fields undefined). */
export function profileFromRow(row: any): UserProfile {
  return withTimestamps<UserProfile>(withoutNulls(row), ['birthDate', 'createdAt']);
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  loginStatusChanged = new EventEmitter<boolean>(); // EventEmitter for status changes
  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private userService: UserService,
    private push: PushService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  // Register a new account; the database creates its users row (the first account becomes admin)
  async register(email: string, password: string, name: string, currentAvatar: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: { name, currentAvatar } },
    });
    if (error || !data.user) return { code: errorCode(error) };
    // Sign-up signs in straight away; the app expects people to log in themselves
    if (data.session) await this.supabase.client.auth.signOut();
    return { uid: data.user.id };
  }

  // Sign in an existing user with email and password
  async login(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return { code: errorCode(error) };
    return { uid: data.user.id, token: data.session.access_token };
  }

  isLoggedIn() {
    if (isPlatformBrowser(this.platformId)) {
      let user = localStorage.getItem('user');
      return !!user;
    }
    return false; // Return false if not in browser context
  }

  // Resolves with the signed-in account once Supabase has restored its session (null when signed out)
  async currentUser(): Promise<{ uid: string; email: string } | null> {
    const session = await this.supabase.getSession();
    return session ? { uid: session.user.id, email: session.user.email ?? '' } : null;
  }

  // Admin status is read from the database (users.isAdmin), never from localStorage
  async isAdmin(uid: string): Promise<boolean> {
    const row = maybe(await this.supabase.client.from('users').select('isAdmin').eq('userId', uid).maybeSingle());
    return row?.isAdmin === true;
  }

  clearSession() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('user');
      localStorage.removeItem('isAdmin');
    }
  }

  // Sign out the current user
  logout() {
    this.userService.clearUser();
    this.clearSession();
    this.loginStatusChanged.emit(false);
    this.router.navigate(['/login']);
    // Unregister this device first (it needs the session), so the next person here doesn't get pushes
    this.push.disable().finally(() => this.supabase.client.auth.signOut());
  }

  async getUserById(userId: string): Promise<UserProfile[]> {
    const rows = must(await this.supabase.client.from('users').select('*').eq('userId', userId));
    return rows.map(profileFromRow);
  }

  async updateUserById(userId: string, updatedData: Partial<any>): Promise<{ val: number; msg: any }> {
    try {
      const changes = { ...updatedData };
      if (changes['birthDate'] instanceof Timestamp) changes['birthDate'] = changes['birthDate'].toDate();
      const rows = must(await this.supabase.client.from('users').update(changes).eq('userId', userId).select('userId'));
      if (!rows.length) throw new Error('User not found');
      return { val: 1, msg: 'User updated successfully' };
    } catch (error) {
      return { val: 0, msg: error };
    }
  }
}
