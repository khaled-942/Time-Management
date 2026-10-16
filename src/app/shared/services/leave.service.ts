import { Injectable } from '@angular/core';
import { DayOffType, DayRecord, LeaveRequest } from '../models';
import { parseLocalDate, scheduledEnd, workingDaysBetween } from '../utils/work-schedule';
import { HttpRequestsService } from './http-requests.service';
import { NotificationService } from './notification.service';
import { must, SupabaseService, withoutNulls, withTimestamps } from './supabase.service';
import { UserService } from './user.service';

/** Paid days off per calendar year. */
export const ANNUAL_LEAVE_DAYS = 21;

function requestFromRow(row: any): LeaveRequest {
  return withTimestamps<LeaveRequest>(withoutNulls(row), ['createdAt', 'decidedAt']);
}

@Injectable({
  providedIn: 'root',
})
export class LeaveService {
  constructor(
    private supabase: SupabaseService,
    private http: HttpRequestsService,
    private userService: UserService,
    private notifications: NotificationService
  ) { }

  private get requests() {
    return this.supabase.client.from('leaveRequests');
  }

  async getMyRequests(userId: string): Promise<LeaveRequest[]> {
    const rows = must(await this.requests.select('*').eq('userId', userId).order('createdAt', { ascending: false }));
    return rows.map(requestFromRow);
  }

  async getAllRequests(): Promise<LeaveRequest[]> {
    const rows = must(await this.requests.select('*').order('createdAt', { ascending: false }));
    return rows.map(requestFromRow);
  }

  /** Paid days off taken in the given calendar year (from saved days). */
  async daysTakenInYear(userId: string, year: number): Promise<number> {
    const days = await this.http.getUserDaysOffDays(userId);
    return days.filter((d: DayRecord) => parseLocalDate(d.start).getFullYear() === year).length;
  }

  async request(start: string, end: string, reason: string): Promise<LeaveRequest> {
    const user = this.userService.current;
    const uid = this.supabase.uid;
    if (!user || !uid) throw new Error('Not signed in');

    const holidays = await this.http.getHolidayDates();
    const days = workingDaysBetween(start, end, holidays).length;
    if (days === 0) throw new Error('NO_WORKING_DAYS');

    const row = must(
      await this.requests
        .insert({ userId: uid, userName: user.name, start, end, days, reason, status: 'pending' })
        .select('*')
        .single()
    );
    await this.notifications.notifyAdmins(
      'New leave request',
      `${user.name} requested ${days} day${days === 1 ? '' : 's'} off (${start} → ${end}).`,
      '/admin',
      'pi pi-calendar-plus'
    );
    return requestFromRow(row);
  }

  async cancel(request: LeaveRequest) {
    must(await this.requests.update({ status: 'cancelled' }).eq('id', request.id!));
  }

  /** Admin: approve, marking every working day in the range as a paid day off. */
  async approve(request: LeaveRequest, note = '') {
    const holidays = await this.http.getHolidayDates();
    for (const day of workingDaysBetween(request.start, request.end, holidays)) {
      const end = scheduledEnd(parseLocalDate(day));
      const out = `${String(end.hours).padStart(2, '0')}:${String(end.minutes).padStart(2, '0')}`;
      await this.http.saveDayEvent(request.userId, day, {
        id: `leave-${request.id}-${day}`,
        title: 'Day Event',
        start: day,
        in: `${day}T09:00`,
        out: `${day}T${out}`,
        isDayOff: true,
        dayOffType: DayOffType.Paid,
        isLate: false,
        isEarlyLeave: false,
        lateExcuse: false,
        earlyLeaveExcuse: false,
        leaveRequestId: request.id,
      });
    }
    await this.decide(request, 'approved', note);
  }

  /** Admin: reject. */
  async reject(request: LeaveRequest, note = '') {
    await this.decide(request, 'rejected', note);
  }

  private async decide(request: LeaveRequest, status: 'approved' | 'rejected', note: string) {
    must(
      await this.requests
        .update({
          status,
          decisionNote: note,
          decidedBy: this.supabase.uid,
          decidedByName: this.userService.current?.name ?? '',
          decidedAt: new Date().toISOString(),
        })
        .eq('id', request.id!)
    );
    await this.notifications.notifyUser(
      request.userId,
      status === 'approved' ? 'Leave approved' : 'Leave rejected',
      `Your request for ${request.start} → ${request.end} was ${status}${note ? `: ${note}` : '.'}`,
      '/leave',
      status === 'approved' ? 'pi pi-check-circle' : 'pi pi-times-circle'
    );
  }
}
