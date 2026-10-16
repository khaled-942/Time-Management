import { Inject, Injectable, isDevMode, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

/**
 * - unavailable: this browser can't do web push, or this is a dev build (no service worker)
 * - blocked: the person denied notifications in the browser/OS settings
 * - off / on: whether this device is registered for pushes
 */
export type PushState = 'unavailable' | 'blocked' | 'off' | 'on';

const ENDPOINT_KEY = 'pushEndpoint';

/** VAPID public key (base64url) → the bytes PushManager.subscribe expects. */
function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// OS notifications even when the app is closed (standard Web Push): this device subscribes with
// the browser's push service and the subscription is saved in push_subscriptions; the send-push
// Edge Function pushes every new notification to those subscriptions, and public/sw.js shows it.
@Injectable({
  providedIn: 'root',
})
export class PushService {
  private stateSubject = new BehaviorSubject<PushState>('unavailable');
  state$ = this.stateSubject.asObservable();
  private readonly browser: boolean;

  constructor(
    private supabase: SupabaseService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.browser = isPlatformBrowser(platformId);
  }

  get state(): PushState {
    return this.stateSubject.value;
  }

  private get savedEndpoint(): string | null {
    try {
      return localStorage.getItem(ENDPOINT_KEY);
    } catch {
      return null;
    }
  }

  private set savedEndpoint(endpoint: string | null) {
    try {
      if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint);
      else localStorage.removeItem(ENDPOINT_KEY);
    } catch {
      // Without storage the device is simply asked again next time
    }
  }

  private supported(): boolean {
    if (!this.browser || isDevMode() || !environment.vapidKey) return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /** Work out the state; when already on, re-save the subscription (browsers rotate them). Call after sign-in. */
  async init() {
    if (!this.supported()) return this.stateSubject.next('unavailable');
    if (Notification.permission === 'denied') return this.stateSubject.next('blocked');
    if (Notification.permission === 'granted' && this.savedEndpoint) {
      this.stateSubject.next('on');
      await this.register().catch((error) => console.error('Could not refresh the push subscription:', error));
      return;
    }
    this.stateSubject.next('off');
  }

  /** Ask for permission and register this device. Must run from a click (iOS requires it). */
  async enable(): Promise<PushState> {
    if (!this.supported()) {
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
    const endpoint = this.savedEndpoint;
    this.savedEndpoint = null;
    if (this.state === 'on') this.stateSubject.next('off');
    if (!endpoint) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch (error) {
      console.error('Could not unsubscribe from push:', error);
    }
    await this.supabase.client.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }

  private async register() {
    const uid = this.supabase.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    // Angular registers sw.js after the app settles; registering again just returns it sooner
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(environment.vapidKey) }));

    const previous = this.savedEndpoint;
    if (previous && previous !== subscription.endpoint) {
      await this.supabase.client.from('push_subscriptions').delete().eq('endpoint', previous);
    }
    const { error } = await this.supabase.client.from('push_subscriptions').upsert({
      endpoint: subscription.endpoint,
      userId: uid,
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent.slice(0, 300),
      updatedAt: new Date().toISOString(),
    });
    if (error) throw error;
    this.savedEndpoint = subscription.endpoint;
  }
}
