import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  Firestore,
  onSnapshot,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { AppNotification } from '../models';

// In-app notifications, kept live with Firestore listeners.
// A notification is either for one user (userId) or for all admins (audience: 'admins').
@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  private listeners: Unsubscribe[] = [];
  private byQuery: AppNotification[][] = [];
  private uid = '';

  constructor(private firestore: Firestore, private auth: Auth, private zone: NgZone) { }

  /** Start listening for the signed-in user's notifications (and admin ones when isAdmin). */
  start(uid: string, isAdmin: boolean) {
    this.stop();
    this.uid = uid;
    const colRef = collection(this.firestore, 'notifications');
    const queries = [query(colRef, where('userId', '==', uid))];
    if (isAdmin) queries.push(query(colRef, where('audience', '==', 'admins')));

    this.byQuery = queries.map(() => []);
    this.listeners = queries.map((q, i) =>
      onSnapshot(
        q,
        (snapshot) => {
          this.byQuery[i] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as AppNotification) }));
          this.zone.run(() => this.emit());
        },
        (error) => console.error('Error loading notifications:', error)
      )
    );
  }

  stop() {
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners = [];
    this.byQuery = [];
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
    await updateDoc(doc(this.firestore, 'notifications', notification.id), { readBy: arrayUnion(this.uid) });
  }

  async markAllRead() {
    const unread = this.notificationsSubject.value.filter((n) => !this.isRead(n));
    await Promise.all(unread.map((n) => this.markRead(n)));
  }

  // Both userId and audience are always written (one of them empty) so Firestore rules can match queries on either
  notifyUser(userId: string, title: string, body: string, link?: string, icon?: string) {
    return this.create({ userId, audience: '', title, body, link, icon });
  }

  notifyAdmins(title: string, body: string, link?: string, icon?: string) {
    return this.create({ userId: '', audience: 'admins', title, body, link, icon });
  }

  private create(data: Partial<AppNotification>) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return addDoc(collection(this.firestore, 'notifications'), {
      ...clean,
      createdAt: serverTimestamp(),
      createdBy: this.auth.currentUser?.uid ?? '',
      readBy: [],
    });
  }

  private emit() {
    const all = this.byQuery.flat();
    // Newest first; a just-created notification has no server timestamp yet, so treat it as newest
    const time = (n: AppNotification) => (n.createdAt?.toMillis ? n.createdAt.toMillis() : Date.now());
    all.sort((a, b) => time(b) - time(a));
    this.notificationsSubject.next(all.slice(0, 50));
  }
}
