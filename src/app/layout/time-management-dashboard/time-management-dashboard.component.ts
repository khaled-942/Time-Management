import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import 'chart.js/auto'; // registers every Chart.js controller used by p-chart
import { HttpRequestsService, PERIOD_LOCKED } from '../../shared/services/http-requests.service';
import { LoaderComponent } from "../../shared/loader/loader.component";
import { SalaryService } from '../../salary/services/salary.service';
import { PayslipService } from '../../salary/services/payslip.service';
import { SalaryCalculation } from '../../salary/models/salary.models';
import { UserService } from '../../shared/services/user.service';
import { ThemeService } from '../../shared/services/theme.service';
import { PayrollService } from '../../shared/services/payroll.service';
import { ANNUAL_LEAVE_DAYS } from '../../shared/services/leave.service';
import { DayOffType, DayRecord, Task, TASK_PRIORITIES, TASK_STATUSES, TaskStatus, UserProfile } from '../../shared/models';
import { TaskService, taskLink } from '../../shared/services/task.service';
import {
  formatHours,
  ProductionReport,
  ProductionReportService,
  reportDueDate,
  reportMonthFromKey,
  reportMonthKey,
  reportMonthLabel,
  reportMonthOf,
  ReportSettings,
} from '../../shared/services/production-report.service';
import {
  isFriday,
  MONTHS,
  nowTimeString,
  parseLocalDate,
  periodContaining,
  periodFromKey,
  periodKey,
  periodLabel,
  recentPeriods,
  ReportingPeriod,
  scheduledEnd,
  toDateString,
  WORK_START,
  workingDayMs,
} from '../../shared/utils/work-schedule';
import { dayStatus, DayStatus, STATUS_LEGEND, timePart } from '../../shared/utils/day-status';
import { downloadCsv, formatDays, formatDuration, formatMoney, formatTime12, slug } from '../../shared/utils/format';

/** Monthly allowance for excused late arrivals / early leaves. */
const EXCUSE_ALLOWANCE_MS = 4 * 60 * 60 * 1000;

interface PeriodStats {
  workDays: number;
  daysOff: number;
  lateArrivals: number;
  excusedDays: number;
  excuseMs: number;
}

interface StatCard {
  label: string;
  value: string;
  unit?: string;
  footer: string;
  trend?: { text: string; dir: 'up' | 'down' | 'flat' };
  danger?: boolean;
  meter?: number; // 0..1
}

interface RecordRow {
  day: DayRecord;
  date: Date;
  checkIn: string;
  checkOut: string;
  hours: string;
  status: DayStatus;
}

type TodayState = 'loading' | 'off' | 'holiday' | 'not-in' | 'in' | 'done' | 'day-off' | 'locked';

@Component({
  selector: 'app-time-management-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ChartModule,
    TableModule,
    ButtonModule,
    DropdownModule,
    ToastModule,
    TooltipModule,
    FormsModule,
    DialogModule,
    InputTextModule,
    LoaderComponent,
    RouterModule
  ],
  providers: [MessageService],
  templateUrl: './time-management-dashboard.component.html',
  styleUrls: ['./time-management-dashboard.component.scss'],
})
export class TimeManagementDashboardComponent implements OnInit, OnDestroy {
  isLoading = false;
  userId = '';
  firstName = '';
  todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // 11th → 10th reporting period currently shown
  period: ReportingPeriod = periodContaining(new Date());
  periodOptions = recentPeriods(24).map((p) => ({ label: periodLabel(p), value: periodKey(p) }));
  selectedPeriodKey = periodKey(this.period);
  isCurrentPeriod = true;
  isLocked = false;
  private locks = new Set<string>();

  records: RecordRow[] = [];
  stats: PeriodStats = { workDays: 0, daysOff: 0, lateArrivals: 0, excusedDays: 0, excuseMs: 0 };
  statCards: StatCard[] = [];
  statusCounts: { status: DayStatus; count: number }[] = [];
  remainingLeave = ANNUAL_LEAVE_DAYS;

  // Today / check in-out
  today = toDateString(new Date());
  todayRecord: DayRecord | null = null;
  todayState: TodayState = 'loading';
  checkInBusy = false;

  // Salary
  salary?: SalaryCalculation;
  salaryMissing = false;
  netPayVisible = false;
  salaryError = false;

  // Charts
  hoursChartData: any;
  hoursChartOptions: any;
  daysOffChartData: any;
  daysOffChartOptions: any;
  private allDaysOff: Date[] = [];
  private holidays: string[] = [];
  private subscriptions = new Subscription();

  // Production report (calendar month, from My Tasks)
  reportMonthOptions = Array.from({ length: 12 }, (_, i) => {
    const month = reportMonthOf(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1));
    return { label: reportMonthLabel(month), value: reportMonthKey(month) };
  });
  selectedReportMonth = this.reportMonthOptions[0].value;
  report?: ProductionReport;
  reportLoading = false;
  reportError = false;
  exporting: 'word' | 'excel' | null = null;
  settingsForm: ReportSettings | null = null;
  savingSettings = false;

  // Board: open tasks assigned to me, and tasks waiting for my review
  myTasks: Task[] = [];
  reviewTasks: Task[] = [];
  myTaskCounts: { status: TaskStatus; label: string; count: number }[] = [];
  boardLoaded = false;
  boardError = false;
  private stopWatchingTasks?: () => void;
  private user: UserProfile | null = null;

  readonly formatMoney = formatMoney;
  readonly formatDays = formatDays;
  readonly formatHours = formatHours;
  readonly taskLink = taskLink;
  readonly priorities = TASK_PRIORITIES;

  constructor(
    private httpService: HttpRequestsService,
    private salaryService: SalaryService,
    private payslipService: PayslipService,
    private userService: UserService,
    private payroll: PayrollService,
    private theme: ThemeService,
    private reports: ProductionReportService,
    private tasks: TaskService,
    private messageService: MessageService
  ) { }

  async ngOnInit(): Promise<void> {
    // Only run client-side initialization in the browser (skip during SSR/prerender)
    const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    if (!isBrowser) return;

    const userData = localStorage.getItem('user');
    if (!userData) return;
    this.userId = JSON.parse(userData).id;

    this.subscriptions.add(this.theme.mode$.subscribe(() => this.buildCharts()));
    this.subscriptions.add(
      this.userService.user$.subscribe((user) => {
        this.firstName = (user?.name ?? '').split(' ')[0];
        // The report and board need the profile (name, position, role, team)
        if (user?.userId && !this.user) {
          this.user = user;
          this.loadReport();
          this.watchTasks(user);
        }
      })
    );

    this.isLoading = true;
    try {
      const [locks, holidays] = await Promise.all([
        this.payroll.getLocks().catch(() => new Map()),
        this.httpService.getHolidayDates().catch(() => [] as string[]),
      ]);
      this.locks = new Set(locks.keys());
      this.holidays = holidays;
      await Promise.all([this.loadPeriod(), this.loadToday(), this.loadDaysOff()]);
    } finally {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.stopWatchingTasks?.();
  }

  async onPeriodChange() {
    this.period = periodFromKey(this.selectedPeriodKey);
    this.isLoading = true;
    try {
      await this.loadPeriod();
    } finally {
      this.isLoading = false;
    }
  }

  /* ---------- Period data ---------- */

  private async loadPeriod() {
    this.isCurrentPeriod = this.selectedPeriodKey === periodKey(periodContaining(new Date()));
    this.isLocked = this.locks.has(this.selectedPeriodKey);

    const previous = periodContaining(new Date(this.period.start.getTime() - 24 * 60 * 60 * 1000));
    const [days, previousDays] = await Promise.all([
      this.httpService.getUserMonthDays(this.userId, this.period.end).catch((err) => {
        console.error('Error loading days:', err);
        this.toast('error', 'Could not load your days', 'Please refresh the page.');
        return [];
      }),
      this.httpService.getUserMonthDays(this.userId, previous.end).catch(() => []),
    ]);

    this.records = (days as DayRecord[]).map((day) => this.toRow(day)).sort((a, b) => b.day.start.localeCompare(a.day.start));
    this.stats = this.computeStats(days);
    const previousStats = this.computeStats(previousDays);
    this.statusCounts = STATUS_LEGEND.map((status) => ({
      status,
      count: this.records.filter((r) => r.status.key === status.key).length,
    })).filter((s) => s.count > 0);

    this.buildStatCards(previousStats);
    this.buildCharts();
    await this.loadSalary();
  }

  private toRow(day: DayRecord): RecordRow {
    const checkIn = timePart(day.in);
    const checkOut = timePart(day.out);
    let hours = '—';
    if (!day.isDayOff && day.in && day.out) {
      hours = formatDuration(new Date(day.out).getTime() - new Date(day.in).getTime());
    }
    return {
      day,
      date: parseLocalDate(day.start),
      checkIn: day.isDayOff ? '—' : formatTime12(checkIn),
      checkOut: day.isDayOff ? '—' : formatTime12(checkOut),
      hours,
      status: dayStatus(day),
    };
  }

  private computeStats(days: DayRecord[]): PeriodStats {
    const excused = days.filter((d) => !d.isDayOff && (d.lateExcuse || d.earlyLeaveExcuse));
    return {
      workDays: days.filter((d) => !d.isDayOff).length,
      daysOff: days.filter((d) => d.isDayOff && d.dayOffType === DayOffType.Paid).length,
      lateArrivals: days.filter((d) => !d.isDayOff && d.isLate && !d.lateExcuse && !d.earlyLeaveExcuse).length,
      excusedDays: excused.length,
      excuseMs: excused.reduce((sum, d) => sum + this.excuseMs(d), 0),
    };
  }

  // Time covered by an excuse: late part (after 09:00) and/or early part (before the scheduled end)
  private excuseMs(day: DayRecord): number {
    const date = parseLocalDate(day.start);
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const start = WORK_START.hours * 60 + WORK_START.minutes;
    const end = scheduledEnd(date);
    const endMinutes = end.hours * 60 + end.minutes;
    let minutes = 0;
    if (day.lateExcuse && day.in) minutes += Math.max(0, toMinutes(timePart(day.in)) - start);
    if (day.earlyLeaveExcuse && day.out) minutes += Math.max(0, endMinutes - toMinutes(timePart(day.out)));
    return Math.min(minutes * 60000, workingDayMs(date));
  }

  private trend(current: number, previous: number, higherIsGood: boolean): StatCard['trend'] {
    if (!previous || current === previous) return { text: 'same as last period', dir: 'flat' };
    const pct = Math.round(((current - previous) / previous) * 100);
    const good = (pct > 0) === higherIsGood;
    return { text: `${pct > 0 ? '+' : ''}${pct}% vs last period`, dir: good ? 'up' : 'down' };
  }

  private previousStats?: PeriodStats;

  private buildStatCards(prev: PeriodStats = this.previousStats ?? this.stats) {
    this.previousStats = prev;
    const remainingExcuse = EXCUSE_ALLOWANCE_MS - this.stats.excuseMs;
    this.statCards = [
      {
        label: 'Work days',
        value: String(this.stats.workDays),
        unit: 'days',
        footer: `${this.stats.excusedDays} excused`,
        trend: this.trend(this.stats.workDays, prev.workDays, true),
      },
      {
        label: 'Days off',
        value: String(this.stats.daysOff),
        unit: 'paid',
        footer: `${this.remainingLeave} of ${ANNUAL_LEAVE_DAYS} left this year`,
        trend: this.trend(this.stats.daysOff, prev.daysOff, false),
      },
      {
        label: 'Late arrivals',
        value: String(this.stats.lateArrivals),
        unit: 'unexcused',
        footer: this.stats.lateArrivals === 0 ? 'Nothing deducted' : 'See salary breakdown',
        trend: this.trend(this.stats.lateArrivals, prev.lateArrivals, false),
        danger: this.stats.lateArrivals > 1,
      },
      {
        label: 'Excuse hours left',
        value: `${remainingExcuse < 0 ? '-' : ''}${formatDuration(remainingExcuse)}`,
        unit: 'of 4:00',
        footer: remainingExcuse < 0 ? 'Allowance exceeded' : `${formatDuration(this.stats.excuseMs)} used`,
        danger: remainingExcuse < 0,
        meter: Math.min(1, this.stats.excuseMs / EXCUSE_ALLOWANCE_MS),
      },
    ];
  }

  /* ---------- Salary ---------- */

  private async loadSalary() {
    this.salaryError = false;
    try {
      this.salary = await this.salaryService.calculateSalaryForPeriod(this.userId, this.period.start, this.period.end);
      this.salaryMissing = false;
    } catch (error: any) {
      this.salary = undefined;
      if (error?.message === 'NO_SALARY_DEFINED') {
        this.salaryMissing = true;
      } else {
        console.error('Error loading salary data:', error);
        this.salaryError = true;
      }
    }
  }

  get chargedLines() {
    return this.salary?.deductionLines.filter((line) => line.days > 0) ?? [];
  }

  get warningLines() {
    return this.salary?.deductionLines.filter((line) => line.days === 0) ?? [];
  }

  get nextPenaltyText(): string {
    if (!this.salary) return '';
    const days = this.salary.nextLatePenaltyDays;
    return days === 0
      ? 'Your first late arrival (up to 30 min) this period is a warning only.'
      : `Your next late arrival (up to 30 min) will cost ${formatDays(days)} (${formatMoney(days * this.salary.dailySalary)}).`;
  }

  get excuseExceeded(): boolean {
    return this.stats.excuseMs > EXCUSE_ALLOWANCE_MS;
  }

  async downloadPayslip() {
    const user = this.userService.current;
    if (!this.salary || !user) return;
    try {
      await this.payslipService.download(user, this.period, this.salary, this.isLocked);
    } catch (error) {
      console.error('Error creating payslip:', error);
      this.toast('error', 'Payslip not created', 'Please try again.');
    }
  }

  exportCsv() {
    const rows = [...this.records].reverse().map((r) => [r.day.start, r.checkIn, r.checkOut, r.hours, r.status.label]);
    downloadCsv(`attendance_${slug(this.firstName)}_${this.selectedPeriodKey}.csv`, [
      ['Date', 'Check in', 'Check out', 'Hours', 'Status'],
      ...rows,
    ]);
  }

  /* ---------- Production report ---------- */

  async loadReport() {
    if (!this.user) return;
    this.reportLoading = true;
    this.reportError = false;
    try {
      this.report = await this.reports.build(this.user, reportMonthFromKey(this.selectedReportMonth));
    } catch (error) {
      console.error('Error building the production report:', error);
      this.report = undefined;
      this.reportError = true;
    } finally {
      this.reportLoading = false;
    }
  }

  /** "Due Oct 30" style reminder from five days before the due date until the month ends. */
  get reportReminder(): string {
    const month = reportMonthOf(new Date());
    const due = reportDueDate(month);
    const daysLeft = Math.round((parseLocalDate(due).getTime() - parseLocalDate(this.today).getTime()) / 86_400_000);
    if (daysLeft > 5) return '';
    const label = reportMonthLabel(month);
    if (daysLeft > 1) return `Your ${label} production report is due in ${daysLeft} days (${due}).`;
    if (daysLeft === 1) return `Your ${label} production report is due tomorrow.`;
    if (daysLeft === 0) return `Your ${label} production report is due today.`;
    return `Your ${label} production report was due on ${due}.`;
  }

  get reportMaxHours(): number {
    return Math.max(1, ...(this.report?.byProject.map((p) => p.hours) ?? []));
  }

  async exportReport(format: 'word' | 'excel') {
    if (!this.report) return;
    this.exporting = format;
    try {
      // Rebuild so the file has the latest entries and settings
      await this.loadReport();
      if (!this.report) throw new Error('NO_REPORT');
      if (format === 'word') await this.reports.downloadWord(this.report);
      else await this.reports.downloadExcel(this.report);
    } catch (error) {
      console.error('Error exporting the production report:', error);
      this.toast('error', 'Report not exported', 'Please try again.');
    } finally {
      this.exporting = null;
    }
  }

  async openReportSettings() {
    if (!this.user) return;
    try {
      const settings = await this.reports.getSettings(this.user.userId);
      this.settingsForm = { ...settings, assignments: settings.assignments.map((a) => ({ ...a })) };
      if (!this.settingsForm.assignments.length) this.addAssignment();
    } catch (error) {
      console.error('Error loading report details:', error);
      this.toast('error', 'Could not load your report details', 'Please try again.');
    }
  }

  addAssignment() {
    const last = this.settingsForm?.assignments.at(-1);
    // A new assignment usually starts the day after the previous one ends
    let start = this.today;
    if (last?.end) {
      const next = parseLocalDate(last.end);
      next.setDate(next.getDate() + 1);
      start = toDateString(next);
    }
    this.settingsForm?.assignments.push({ label: '', start, end: '' });
  }

  removeAssignment(index: number) {
    this.settingsForm?.assignments.splice(index, 1);
  }

  /** Why the details can't be saved, or '' when they can. */
  get settingsError(): string {
    for (const a of this.settingsForm?.assignments ?? []) {
      if (!a.label.trim()) return 'Give every assignment a name, or remove it.';
      if (!a.start) return `Pick a start date for ${a.label.trim()}.`;
      if (a.end && a.end < a.start) return `${a.label.trim()} ends before it starts.`;
    }
    return '';
  }

  async saveReportSettings() {
    const form = this.settingsForm;
    if (!form || !this.user || this.settingsError) return;
    this.savingSettings = true;
    try {
      await this.reports.saveSettings(this.user.userId, {
        organization: form.organization.trim(),
        department: form.department.trim(),
        assignments: form.assignments
          .map((a) => ({ label: a.label.trim(), start: a.start, end: a.end }))
          .sort((a, b) => a.start.localeCompare(b.start)),
      });
      this.settingsForm = null;
      await this.loadReport();
    } catch (error) {
      console.error('Error saving report details:', error);
      this.toast('error', 'Could not save your report details', 'Please try again.');
    } finally {
      this.savingSettings = false;
    }
  }

  /* ---------- Board ---------- */

  private watchTasks(me: UserProfile) {
    this.stopWatchingTasks = this.tasks.watch(
      me,
      (tasks) => {
        const byDue = (a: Task, b: Task) =>
          (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
          Object.keys(TASK_PRIORITIES).indexOf(b.priority) - Object.keys(TASK_PRIORITIES).indexOf(a.priority);
        const mine = tasks.filter((t) => t.assigneeIds.includes(me.userId) && t.status !== 'done' && !t.archived);
        this.myTasks = mine.sort(byDue);
        this.reviewTasks = tasks.filter((t) => t.createdBy === me.userId && t.status === 'review' && !t.archived).sort(byDue);
        this.myTaskCounts = TASK_STATUSES.filter((s) => s.value !== 'done')
          .map((s) => ({ status: s.value, label: s.label, count: mine.filter((t) => t.status === s.value).length }))
          .filter((s) => s.count > 0);
        this.boardLoaded = true;
        this.boardError = false;
      },
      (error) => {
        console.error('Error loading board tasks:', error);
        this.boardLoaded = true;
        this.boardError = true;
      }
    );
  }

  isOverdue(task: Task): boolean {
    return !!task.dueDate && task.dueDate < this.today;
  }

  /* ---------- Today: one-tap check in / out ---------- */

  private async loadToday() {
    this.today = toDateString(new Date());
    const todayDate = parseLocalDate(this.today);
    if (isFriday(todayDate)) {
      this.todayState = 'off';
      return;
    }
    if (this.holidays.includes(this.today)) {
      this.todayState = 'holiday';
      return;
    }
    try {
      this.todayRecord = await this.httpService.getDay(this.userId, this.today);
    } catch {
      this.todayRecord = null;
    }
    const day = this.todayRecord;
    if (this.locks.has(periodKey(periodContaining(todayDate))) && !this.userService.current?.isAdmin) {
      this.todayState = 'locked';
    } else if (day?.isDayOff) {
      this.todayState = 'day-off';
    } else if (day?.in && day.out) {
      this.todayState = 'done';
    } else if (day?.in) {
      this.todayState = 'in';
    } else {
      this.todayState = 'not-in';
    }
  }

  get todayDayOffLabel(): string {
    return this.todayRecord ? dayStatus(this.todayRecord).label : '';
  }

  get scheduledEndLabel(): string {
    const end = scheduledEnd(parseLocalDate(this.today));
    return formatTime12(`${end.hours}:${String(end.minutes).padStart(2, '0')}`);
  }

  /** Minutes late if checking in right now (0 when on time). */
  get minutesLateNow(): number {
    const now = new Date();
    return Math.max(0, now.getHours() * 60 + now.getMinutes() - (WORK_START.hours * 60 + WORK_START.minutes));
  }

  get checkInTimeLabel(): string {
    return formatTime12(timePart(this.todayRecord?.in));
  }

  get checkOutTimeLabel(): string {
    return formatTime12(timePart(this.todayRecord?.out));
  }

  async checkIn() {
    const now = nowTimeString();
    const minutesLate = this.minutesLateNow;
    this.checkInBusy = true;
    try {
      await this.httpService.saveDayEvent(this.userId, this.today, {
        id: `day-${this.today}`,
        title: 'Day Event',
        start: this.today,
        in: `${this.today}T${now}`,
        isDayOff: false,
        isLate: minutesLate > 0,
        isEarlyLeave: false,
        lateExcuse: false,
        earlyLeaveExcuse: false,
      });
      this.toast('success', 'Checked in', `At ${formatTime12(now)}${minutesLate > 0 ? `, ${minutesLate} min late` : ''}.`);
      await this.refreshAfterCheck();
    } catch (error: any) {
      this.toast('error', 'Check-in failed', error?.message === PERIOD_LOCKED ? 'This payroll period is closed.' : 'Please try again.');
    } finally {
      this.checkInBusy = false;
    }
  }

  async checkOut() {
    const now = nowTimeString();
    const end = scheduledEnd(parseLocalDate(this.today));
    const nowDate = new Date();
    const early = nowDate.getHours() * 60 + nowDate.getMinutes() < end.hours * 60 + end.minutes;
    this.checkInBusy = true;
    try {
      await this.httpService.saveDayEvent(this.userId, this.today, {
        out: `${this.today}T${now}`,
        isEarlyLeave: early,
      });
      this.toast('success', 'Checked out', `At ${formatTime12(now)}${early ? ', before the scheduled end' : ''}.`);
      await this.refreshAfterCheck();
    } catch (error: any) {
      this.toast('error', 'Check-out failed', error?.message === PERIOD_LOCKED ? 'This payroll period is closed.' : 'Please try again.');
    } finally {
      this.checkInBusy = false;
    }
  }

  private async refreshAfterCheck() {
    await this.loadToday();
    if (this.isCurrentPeriod) await this.loadPeriod();
  }

  /* ---------- Days off this year ---------- */

  private async loadDaysOff() {
    try {
      const res: DayRecord[] = await this.httpService.getUserDaysOffDays(this.userId);
      this.allDaysOff = res.map((day) => parseLocalDate(day.start));
    } catch (err) {
      console.error('Error loading days off:', err);
    }
    // 21 paid days off per calendar year
    const currentYear = new Date().getFullYear();
    this.remainingLeave = ANNUAL_LEAVE_DAYS - this.allDaysOff.filter((d) => d.getFullYear() === currentYear).length;
    this.buildStatCards();
    this.buildCharts();
  }

  /* ---------- Charts ---------- */

  private buildCharts() {
    if (typeof document === 'undefined') return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const strong = color('--chart-strong');
    const soft = color('--chart-soft');
    const grid = color('--chart-grid');
    const muted = color('--muted-foreground');
    const warning = color('--warning');

    const baseOptions = {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { family: 'JetBrains Mono', size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, font: { family: 'JetBrains Mono', size: 10 }, precision: 0 },
        },
      },
    };

    // Hours worked per day of the period; unexcused late days in amber
    const byDate = new Map(this.records.map((r) => [r.day.start, r.day]));
    const days: string[] = [];
    for (let d = new Date(this.period.start); d <= this.period.end; d.setDate(d.getDate() + 1)) days.push(toDateString(d));
    const hours = days.map((day) => {
      const record = byDate.get(day);
      if (!record || record.isDayOff || !record.in || !record.out) return 0;
      return Math.round(((new Date(record.out).getTime() - new Date(record.in).getTime()) / 3_600_000) * 10) / 10;
    });
    this.hoursChartData = {
      labels: days.map((day) => String(parseLocalDate(day).getDate())),
      datasets: [
        {
          data: hours,
          backgroundColor: days.map((day) => {
            const record = byDate.get(day);
            return record?.isLate && !record.lateExcuse && !record.earlyLeaveExcuse ? warning : strong;
          }),
          hoverBackgroundColor: soft,
          borderRadius: 3,
          barPercentage: 0.6,
        },
      ],
    };
    this.hoursChartOptions = {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items: any[]) => parseLocalDate(days[items[0].dataIndex]).toDateString(),
            label: (item: any) => `${item.raw} h`,
          },
        },
      },
    };

    // Paid days off in each of the last 12 calendar months
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
    this.daysOffChartData = {
      labels: months.map((m) => MONTHS[m.getMonth()].slice(0, 3)),
      datasets: [
        {
          data: months.map(
            (m) => this.allDaysOff.filter((d) => d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()).length
          ),
          backgroundColor: months.map((_, i) => (i === 11 ? strong : soft)),
          borderRadius: 3,
          barPercentage: 0.55,
        },
      ],
    };
    this.daysOffChartOptions = baseOptions;
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
