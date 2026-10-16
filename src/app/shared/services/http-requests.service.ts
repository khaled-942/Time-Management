import { Injectable } from '@angular/core';
import { periodContaining, periodKeyOfDay } from '../utils/work-schedule';
import { DayRecord } from '../models';
import { UserService } from './user.service';
import { maybe, must, SupabaseService, withoutNulls, withTimestamps } from './supabase.service';
import { profileFromRow } from '../../auth/auth.service';

export const PERIOD_LOCKED = 'PERIOD_LOCKED';

/** A days row as the app uses it: without the key columns, missing fields undefined. */
function dayFromRow(row: any): DayRecord {
  const { userId, dayId, ...day } = row;
  return withoutNulls<DayRecord>(day);
}

@Injectable({
  providedIn: 'root',
})
export class HttpRequestsService {
  constructor(private supabase: SupabaseService, private userService: UserService) { }

  private get db() {
    return this.supabase.client;
  }

  async getAllUsers(): Promise<any> {
    return must(await this.db.from('users').select('*')).map(profileFromRow);
  }

  async getHolidays(): Promise<any> {
    return must(await this.db.from('holidays').select('*')).map((h) => withTimestamps(h, ['date']));
  }

  // add a holiday
  async addHoliday(holiday: any): Promise<any> {
    return must(await this.db.from('holidays').insert(holiday).select('id').single());
  }

  // Delete a holiday by its ID
  async deleteHoliday(id: string): Promise<any> {
    try {
      must(await this.db.from('holidays').delete().eq('id', id));
      return { messege: `Holiday with ID ${id} has been deleted.`, id: id };
    } catch (error) {
      console.error('Error deleting holiday:', error);
    }
  }

  // Saves a day (merging with what's there) and records the change in the audit log.
  // Days in a locked payroll period can only be changed by admins (also enforced by the database).
  async saveDayEvent(userId: string, day: string, data: Partial<DayRecord>): Promise<void> {
    const actor = this.userService.current;
    if (!actor?.isAdmin && (await this.isPeriodLocked(periodKeyOfDay(day)))) {
      throw new Error(PERIOD_LOCKED);
    }

    try {
      const before = await this.getDay(userId, day);
      // Merge with what's saved (check-out only sends `out`, but the row needs `start`)
      must(await this.db.from('days').upsert({ ...before, ...data, userId, dayId: day }, { onConflict: 'userId,dayId' }));

      must(
        await this.db.from('auditLog').insert({
          ownerId: userId,
          dayId: day,
          changedBy: this.supabase.uid,
          changedByName: actor?.name ?? '',
          before,
          after: data,
        })
      );
    } catch (error) {
      console.error(`Error saving data for ${day}:`, error);
      throw error;
    }
  }

  async getDay(userId: string, day: string): Promise<DayRecord | null> {
    const row = maybe(await this.db.from('days').select('*').eq('userId', userId).eq('dayId', day).maybeSingle());
    return row ? dayFromRow(row) : null;
  }

  async isPeriodLocked(key: string): Promise<boolean> {
    const row = maybe(await this.db.from('lockedPeriods').select('key').eq('key', key).maybeSingle());
    return !!row;
  }

  /** Holiday dates as "YYYY-MM-DD" strings. */
  async getHolidayDates(): Promise<string[]> {
    const holidays = await this.getHolidays();
    return holidays.map((h: any) => {
      const d: Date = h.date.toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }

  // Get all days for a specific user
  async getUserDays(userId: string): Promise<any> {
    return must(await this.db.from('days').select('*').eq('userId', userId)).map(dayFromRow);
  }

  // Get the days of the 11th → 10th reporting period that contains `date`
  async getUserMonthDays(userId: string, date: Date): Promise<any> {
    const period = periodContaining(date);
    return this.getUserDaysBetween(userId, period.startStr, period.endStr);
  }

  // Get days whose `start` ("YYYY-MM-DD") is within [startStr, endStr], both inclusive
  async getUserDaysBetween(userId: string, startStr: string, endStr: string): Promise<any> {
    const rows = must(
      await this.db.from('days').select('*').eq('userId', userId).gte('start', startStr).lte('start', endStr).order('start')
    );
    return rows.map(dayFromRow);
  }

  async getUserDaysOffDays(userId: string): Promise<any> {
    const rows = must(await this.db.from('days').select('*').eq('userId', userId).eq('dayOffType', 0).eq('isDayOff', true));
    return rows.map(dayFromRow);
  }

  async getUserProfile(userId: string): Promise<any> {
    const row = maybe(await this.db.from('users').select('*').eq('userId', userId).maybeSingle());
    if (!row) throw new Error('User not found');
    return profileFromRow(row);
  }

  // The monthly salary is private to its owner (user_private, which admins can't read)
  async getSalary(userId: string): Promise<number | null> {
    const row = maybe(await this.db.from('user_private').select('salary').eq('userId', userId).maybeSingle());
    return row?.salary === null || row?.salary === undefined ? null : Number(row.salary);
  }

  async setSalary(userId: string, salary: number): Promise<void> {
    must(
      await this.db
        .from('user_private')
        .upsert({ userId, salary, updatedAt: new Date().toISOString() }, { onConflict: 'userId' })
    );
  }
}
