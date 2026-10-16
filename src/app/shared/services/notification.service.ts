import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppNotification } from '../models';
import { must, SupabaseService, Unsubscribe, withTimestamps } from './supabase.service';

// In-app notifications, kept live with Supabase Realtime.
// A notification is either for one user (userId) or for all admins (audience: 'admins');
// row-level security returns exactly the ones the signed-in person may read.
@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  private unsubscribe?: Unsubscribe;
  private uid = '';

  constructor(private supabase: SupabaseService, private zone: NgZone) { }

  /** Start listening for the signed-in user's notifications (and admin ones when they're an admin). */
  start(uid: string, _isAdmin: boolean) {
    this.stop();
    this.uid = uid;
    this.unsubscribe = this.supabase.watch(
      'notifications',
      async () => {
        const rows = must(
          await this.supabase.client.from('notifications').select('*').order('createdAt', { ascending: false }).limit(50)
        );
        const all = rows.map((r) => withTimestamps<AppNotification>(r, ['createdAt']));
        this.zone.run(() => this.notificationsSubject.next(all));
      },
      (error) => console.error('Error loading notifications:', error)
    );
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.notificationsSubject.next([]);
  }

  ngOnDestroy() {
    this.stop();
  }

  isRead(notification: AppNotification): boolean {
    return (notification.readBy ?? []).includes(this.uid);
  }

  async markRead(notification: AppNotification) {
    if (!notification.id || this.isRead(notification)) return;
    must(await this.supabase.client.rpc('mark_notification_read', { notification_id: notification.id }));
  }

  async markAllRead() {
    const unread = this.notificationsSubject.value.filter((n) => !this.isRead(n));
    await Promise.all(unread.map((n) => this.markRead(n)));
  }

  // Both userId and audience are always written (one of them empty); the database requires it
  notifyUser(userId: string, title: string, body: string, link?: string, icon?: string) {
    return this.create({ userId, audience: '', title, body, link, icon });
  }

  notifyAdmins(title: string, body: string, link?: string, icon?: string) {
    return this.create({ userId: '', audience: 'admins', title, body, link, icon });
  }

  private async create(data: Partial<AppNotification>) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    must(await this.supabase.client.from('notifications').insert({ ...clean, createdBy: this.supabase.uid }));
  }
}
