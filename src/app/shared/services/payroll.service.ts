import { Injectable } from '@angular/core';
import { AuditEntry, PeriodLock, UserProfile } from '../models';
import { periodFromKey, periodLabel } from '../utils/work-schedule';
import { NotificationService } from './notification.service';
import { must, SupabaseService, withTimestamps } from './supabase.service';
import { UserService } from './user.service';

// Payroll period locking and the day-change audit log (admin features).
@Injectable({
  providedIn: 'root',
})
export class PayrollService {
  constructor(
    private supabase: SupabaseService,
    private userService: UserService,
    private notifications: NotificationService
  ) { }

  async getLocks(): Promise<Map<string, PeriodLock>> {
    const rows = must(await this.supabase.client.from('lockedPeriods').select('*'));
    return new Map(rows.map((r) => [r.key, withTimestamps<PeriodLock>(r, ['lockedAt'])]));
  }

  /** Lock a period so employees can no longer change its days, and tell everyone their payslip is ready. */
  async lock(key: string, users: UserProfile[]) {
    must(
      await this.supabase.client.from('lockedPeriods').upsert({
        key,
        lockedBy: this.supabase.uid,
        lockedByName: this.userService.current?.name ?? '',
        lockedAt: new Date().toISOString(),
      })
    );
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
    must(await this.supabase.client.from('lockedPeriods').delete().eq('key', key));
  }

  async getAuditLog(max = 300): Promise<AuditEntry[]> {
    const rows = must(
      await this.supabase.client.from('auditLog').select('*').order('at', { ascending: false }).limit(max)
    );
    return rows.map((r) => withTimestamps<AuditEntry>(r, ['at']));
  }
}
