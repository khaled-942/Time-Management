import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { DayOffType, DayRecord, LeaveRequest } from '../models';
import { parseLocalDate, scheduledEnd, workingDaysBetween } from '../utils/work-schedule';
import { HttpRequestsService } from './http-requests.service';
import { NotificationService } from './notification.service';
import { UserService } from './user.service';

/** Paid days off per calendar year. */
export const ANNUAL_LEAVE_DAYS = 21;

@Injectable({
  providedIn: 'root',
})
export class LeaveService {
  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private http: HttpRequestsService,
    private userService: UserService,
    private notifications: NotificationService
  ) { }

  private sortNewestFirst(requests: LeaveRequest[]) {
    const time = (r: LeaveRequest) => (r.createdAt?.toMillis ? r.createdAt.toMillis() : Date.now());
    return requests.sort((a, b) => time(b) - time(a));
  }

  async getMyRequests(userId: string): Promise<LeaveRequest[]> {
    const snapshot = await getDocs(query(collection(this.firestore, 'leaveRequests'), where('userId', '==', userId)));
    return this.sortNewestFirst(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as LeaveRequest) })));
  }

  async getAllRequests(): Promise<LeaveRequest[]> {
    const snapshot = await getDocs(collection(this.firestore, 'leaveRequests'));
    return this.sortNewestFirst(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as LeaveRequest) })));
  }

  /** Paid days off taken in the given calendar year (from saved days). */
  async daysTakenInYear(userId: string, year: number): Promise<number> {
    const days = await this.http.getUserDaysOffDays(userId);
    return days.filter((d: DayRecord) => parseLocalDate(d.start).getFullYear() === year).length;
  }

  async request(start: string, end: string, reason: string): Promise<LeaveRequest> {
    const user = this.userService.current;
    const uid = this.auth.currentUser?.uid;
    if (!user || !uid) throw new Error('Not signed in');

    const holidays = await this.http.getHolidayDates();
    const days = workingDaysBetween(start, end, holidays).length;
    if (days === 0) throw new Error('NO_WORKING_DAYS');

    const request: LeaveRequest = {
      userId: uid,
      userName: user.name,
      start,
      end,
      days,
      reason,
      status: 'pending',
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(this.firestore, 'leaveRequests'), request);
    await this.notifications.notifyAdmins(
      'New leave request',
      `${user.name} requested ${days} day${days === 1 ? '' : 's'} off (${start} → ${end}).`,
      '/admin',
      'pi pi-calendar-plus'
    );
    return { ...request, id: ref.id };
  }

  async cancel(request: LeaveRequest) {
    await updateDoc(doc(this.firestore, 'leaveRequests', request.id!), { status: 'cancelled' });
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
    await updateDoc(doc(this.firestore, 'leaveRequests', request.id!), {
      status,
      decisionNote: note,
      decidedBy: this.auth.currentUser?.uid ?? '',
      decidedByName: this.userService.current?.name ?? '',
      decidedAt: serverTimestamp(),
    });
    await this.notifications.notifyUser(
      request.userId,
      status === 'approved' ? 'Leave approved' : 'Leave rejected',
      `Your request for ${request.start} → ${request.end} was ${status}${note ? `: ${note}` : '.'}`,
      '/leave',
      status === 'approved' ? 'pi pi-check-circle' : 'pi pi-times-circle'
    );
  }
}
