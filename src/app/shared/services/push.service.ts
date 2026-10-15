import { Inject, Injectable, isDevMode, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FirebaseApp } from '@angular/fire/app';
import { Auth } from '@angular/fire/auth';
import { deleteDoc, doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * - unavailable: this browser can't do web push, or this is a dev build (no service worker)
 * - blocked: the person denied notifications in the browser/OS settings
 * - off / on: whether this device is registered for pushes
 */
export type PushState = 'unavailable' | 'blocked' | 'off' | 'on';

const TOKEN_KEY = 'pushToken';

// OS notifications even when the app is closed: this device registers with Firebase Cloud
// Messaging and its token is saved under users/{uid}/pushTokens/{token}; the sendPush Cloud
// Function pushes every new notification to those tokens, and public/sw.js shows it.
@Injectable({
  providedIn: 'root',
})
export class PushService {
  private stateSubject = new BehaviorSubject<PushState>('unavailable');
  state$ = this.stateSubject.asObservable();
  private readonly browser: boolean;

  constructor(
    private app: FirebaseApp,
    private auth: Auth,
    private firestore: Firestore,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.browser = isPlatformBrowser(platformId);
  }

  get state(): PushState {
    return this.stateSubject.value;
  }

  private get savedToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private set savedToken(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Without storage the device is simply asked again next time
    }
  }

  private async supported(): Promise<boolean> {
    if (!this.browser || isDevMode() || !environment.vapidKey) return false;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
    const { isSupported } = await import('firebase/messaging');
    return isSupported();
  }

  /** Work out the state; when already on, refresh the token (FCM rotates them). Call after sign-in. */
  async init() {
    if (!(await this.supported())) return this.stateSubject.next('unavailable');
    if (Notification.permission === 'denied') return this.stateSubject.next('blocked');
    if (Notification.permission === 'granted' && this.savedToken) {
      this.stateSubject.next('on');
      await this.register().catch((error) => console.error('Could not refresh the push token:', error));
      return;
    }
    this.stateSubject.next('off');
  }

  /** Ask for permission and register this device. Must run from a click (iOS requires it). */
  async enable(): Promise<PushState> {
    if (!(await this.supported())) {
      this.stateSubject.next('unavailable');
      return 'unavailable';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const state = permission === 'denied' ? 'blocked' : 'off';
      this.stateSubject.next(state);
      return state;
    }
    await this.register();
    this.stateSubject.next('on');
    return 'on';
  }

  /** Stop pushes to this device (also used on sign-out, so the next person doesn't get them). */
  async disable() {
    const token = this.savedToken;
    const uid = this.auth.currentUser?.uid;
    this.savedToken = null;
    if (this.state === 'on') this.stateSubject.next('off');
    if (!token) return;
    try {
      const { getMessaging, deleteToken } = await import('firebase/messaging');
      await deleteToken(getMessaging(this.app));
    } catch (error) {
      console.error('Could not delete the push token:', error);
    }
    if (uid) await deleteDoc(doc(this.firestore, `users/${uid}/pushTokens/${token}`)).catch(() => undefined);
  }

  private async register() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    // Angular registers sw.js after the app settles; registering again just returns it sooner
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;

    const { getMessaging, getToken } = await import('firebase/messaging');
    const token = await getToken(getMessaging(this.app), {
      vapidKey: environment.vapidKey,
      serviceWorkerRegistration: registration,
    });

    const previous = this.savedToken;
    if (previous && previous !== token) {
      await deleteDoc(doc(this.firestore, `users/${uid}/pushTokens/${previous}`)).catch(() => undefined);
    }
    await setDoc(doc(this.firestore, `users/${uid}/pushTokens/${token}`), {
      token,
      userAgent: navigator.userAgent.slice(0, 300),
      updatedAt: serverTimestamp(),
    });
    this.savedToken = token;
  }
}
