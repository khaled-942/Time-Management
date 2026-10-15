import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { AuditEntry, PeriodLock, UserProfile } from '../models';
import { periodFromKey, periodLabel } from '../utils/work-schedule';
import { NotificationService } from './notification.service';
import { UserService } from './user.service';

// Payroll period locking and the day-change audit log (admin features).
@Injectable({
  providedIn: 'root',
})
export class PayrollService {
  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private userService: UserService,
    private notifications: NotificationService
  ) { }

  async getLocks(): Promise<Map<string, PeriodLock>> {
    const snapshot = await getDocs(collection(this.firestore, 'lockedPeriods'));
    return new Map(snapshot.docs.map((d) => [d.id, { key: d.id, ...(d.data() as Omit<PeriodLock, 'key'>) }]));
  }

  /** Lock a period so employees can no longer change its days, and tell everyone their payslip is ready. */
  async lock(key: string, users: UserProfile[]) {
    await setDoc(doc(this.firestore, 'lockedPeriods', key), {
      lockedBy: this.auth.currentUser?.uid ?? '',
      lockedByName: this.userService.current?.name ?? '',
      lockedAt: serverTimestamp(),
    });
    const label = periodLabel(periodFromKey(key));
    await Promise.all(
      users
        .filter((u) => u.active !== false)
        .map((u) =>
          this.notifications.notifyUser(
            u.userId,
            'Payslip ready',
            `The payroll period ${label} is closed. Your payslip is ready to download.`,
            '/dashboard',
            'pi pi-file-pdf'
          )
        )
    );
  }

  async unlock(key: string) {
    await deleteDoc(doc(this.firestore, 'lockedPeriods', key));
  }

  async getAuditLog(max = 300): Promise<AuditEntry[]> {
    const snapshot = await getDocs(query(collection(this.firestore, 'auditLog'), orderBy('at', 'desc'), limit(max)));
    return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as AuditEntry) }));
  }
}
