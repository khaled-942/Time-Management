import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { ANNUAL_LEAVE_DAYS, LeaveService } from '../../shared/services/leave.service';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { LeaveRequest, LeaveStatus } from '../../shared/models';
import { toDateString, workingDaysBetween } from '../../shared/utils/work-schedule';

@Component({
  selector: 'app-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CalendarModule, InputTextareaModule, TableModule, ToastModule, LoaderComponent],
  providers: [MessageService],
  templateUrl: './leave.component.html',
  styleUrl: './leave.component.scss',
})
export class LeaveComponent implements OnInit {
  readonly annual = ANNUAL_LEAVE_DAYS;
  isLoading = false;
  isSubmitting = false;
  userId = '';

  requests: LeaveRequest[] = [];
  takenThisYear = 0;
  private holidays: string[] = [];

  range: Date[] | null = null;
  reason = '';
  minDate = new Date();

  constructor(
    private leaveService: LeaveService,
    private http: HttpRequestsService,
    private messageService: MessageService
  ) { }

  async ngOnInit() {
    const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!userData) return;
    this.userId = JSON.parse(userData).id;
    this.isLoading = true;
    try {
      this.holidays = await this.http.getHolidayDates().catch(() => []);
      await this.load();
    } finally {
      this.isLoading = false;
    }
  }

  private async load() {
    try {
      const [requests, taken] = await Promise.all([
        this.leaveService.getMyRequests(this.userId),
        this.leaveService.daysTakenInYear(this.userId, new Date().getFullYear()),
      ]);
      this.requests = requests;
      this.takenThisYear = taken;
    } catch (error) {
      console.error('Error loading leave:', error);
      this.toast('error', 'Could not load your leave', 'Please refresh the page.');
    }
  }

  get pendingDays(): number {
    return this.requests.filter((r) => r.status === 'pending').reduce((sum, r) => sum + r.days, 0);
  }

  get remaining(): number {
    return this.annual - this.takenThisYear;
  }

  get rangeStart(): string | null {
    return this.range?.[0] ? toDateString(this.range[0]) : null;
  }

  get rangeEnd(): string | null {
    const end = this.range?.[1] ?? this.range?.[0];
    return end ? toDateString(end) : null;
  }

  /** Working days in the selected range (Fridays and holidays don't count). */
  get requestedDays(): number {
    if (!this.rangeStart || !this.rangeEnd) return 0;
    return workingDaysBetween(this.rangeStart, this.rangeEnd, this.holidays).length;
  }

  get overBalance(): boolean {
    return this.requestedDays > this.remaining - this.pendingDays;
  }

  async submit() {
    if (!this.rangeStart || !this.rangeEnd || !this.requestedDays) return;
    this.isSubmitting = true;
    try {
      await this.leaveService.request(this.rangeStart, this.rangeEnd, this.reason.trim());
      this.toast('success', 'Request sent', 'An admin will review it. You will get a notification.');
      this.range = null;
      this.reason = '';
      await this.load();
    } catch (error: any) {
      this.toast(
        'error',
        'Request not sent',
        error?.message === 'NO_WORKING_DAYS' ? 'The dates you picked contain no working days.' : 'Please try again.'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  async cancel(request: LeaveRequest) {
    try {
      await this.leaveService.cancel(request);
      this.toast('info', 'Request cancelled', `${request.start} → ${request.end}`);
      await this.load();
    } catch {
      this.toast('error', 'Could not cancel', 'Please try again.');
    }
  }

  statusTone(status: LeaveStatus): string {
    return { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: '' }[status];
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
