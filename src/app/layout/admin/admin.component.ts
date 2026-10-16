import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { LeaveService } from '../../shared/services/leave.service';
import { PayrollService } from '../../shared/services/payroll.service';
import { OrgService } from '../../shared/services/org.service';
import { FEATURES } from '../../shared/features';
import { LoaderComponent } from '../../shared/loader/loader.component';
import {
  AuditEntry,
  DayOffType,
  DayRecord,
  LeaveRequest,
  LeaveStatus,
  PeriodLock,
  Role,
  ROLE_LABELS,
  roleOf,
  Team,
  UserProfile,
} from '../../shared/models';
import {
  periodContaining,
  periodFromKey,
  periodKey,
  periodLabel,
  recentPeriods,
  ReportingPeriod,
  toDateString,
} from '../../shared/utils/work-schedule';
import { dayStatus, DayStatus, timePart } from '../../shared/utils/day-status';
import { downloadCsv, formatTime12, slug } from '../../shared/utils/format';

interface TeamRow {
  user: UserProfile;
  today: { label: string; tone: string };
  workDays: number;
  late: number;
  absences: number;
  leave: number;
}

interface EditableUser {
  user: UserProfile;
  isAdmin: boolean;
  active: boolean;
  role: Role;
  teamId: string;
  saving: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    InputTextareaModule,
    InputSwitchModule,
    ButtonModule,
    CalendarModule,
    DialogModule,
    DropdownModule,
    MultiSelectModule,
    TabViewModule,
    ToastModule,
    TooltipModule,
    LoaderComponent,
  ],
  providers: [MessageService],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  isLoading = false;
  myUid = '';
  readonly leaveEnabled = FEATURES.leaveRequests;

  users: UserProfile[] = [];
  private usersById = new Map<string, UserProfile>();

  // Team overview
  periodOptions = recentPeriods(12).map((p) => ({ label: periodLabel(p), value: periodKey(p) }));
  teamPeriodKey = periodKey(periodContaining(new Date()));
  team: TeamRow[] = [];
  teamLoading = false;
  private teamDays = new Map<string, DayRecord[]>();

  // Users
  editableUsers: EditableUser[] = [];
  roleOptions = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({ label: ROLE_LABELS[value], value }));

  // Teams
  teams: Team[] = [];
  newTeamName = '';
  teamSaving = false;

  // Leave
  leaveRequests: LeaveRequest[] = [];
  leaveFilter: LeaveStatus | 'all' = 'pending';
  leaveFilterOptions = [
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'All', value: 'all' },
  ];
  decision: { request: LeaveRequest; action: 'approve' | 'reject' } | null = null;
  decisionNote = '';
  deciding = false;

  // Payroll
  payrollPeriods = recentPeriods(12);
  locks = new Map<string, PeriodLock>();
  lockTarget: ReportingPeriod | null = null;
  locking = false;

  // Audit
  audit: AuditEntry[] = [];
  auditUserFilter: string | null = null;
  auditLoaded = false;

  // Holidays
  holidays: any = [];
  newHoliday: any = {
    date: new Date(),
    name: '',
    tags: [],
  };

  holidayTags = [
    { name: 'National', value: 'NATIONAL' },
    { name: 'Religious', value: 'RELIGIOUS' },
    { name: 'Cultural', value: 'CULTURAL' },
    { name: 'International', value: 'INTERNATIONAL' },
  ];

  selectedTags: string[] = [];

  constructor(
    private httpRequestsService: HttpRequestsService,
    private leaveService: LeaveService,
    private payroll: PayrollService,
    private org: OrgService,
    private messageService: MessageService
  ) { }

  async ngOnInit() {
    const session = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    this.myUid = session ? JSON.parse(session).id : '';

    this.isLoading = true;
    try {
      await Promise.all([
        this.loadUsers(),
        this.loadTeams(),
        this.loadHolidays(),
        this.leaveEnabled ? this.loadLeave() : Promise.resolve(),
        this.loadLocks(),
      ]);
      await this.loadTeam();
    } finally {
      this.isLoading = false;
    }
  }

  onTabChange(index: number) {
    // The audit log is loaded on first visit to its tab
    // (tabs: overview, users, teams, [leave], payroll, audit)
    const auditTab = this.leaveEnabled ? 5 : 4;
    if (index === auditTab && !this.auditLoaded) this.loadAudit();
  }

  /* ---------- Users ---------- */

  private async loadUsers() {
    try {
      const users: UserProfile[] = await this.httpRequestsService.getAllUsers();
      this.users = users.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      this.usersById = new Map(this.users.map((u) => [u.userId, u]));
      this.editableUsers = this.users.map((user) => ({
        user,
        isAdmin: !!user.isAdmin,
        active: user.active !== false,
        role: roleOf(user),
        teamId: user.teamId ?? '',
        saving: false,
      }));
    } catch (error) {
      console.error('Error fetching users', error);
      this.toast('error', 'Could not load users', 'Please refresh the page.');
    }
  }

  userName(uid: string): string {
    return this.usersById.get(uid)?.name ?? 'Unknown user';
  }

  isDirty(row: EditableUser): boolean {
    const u = row.user;
    return (
      row.isAdmin !== !!u.isAdmin ||
      row.active !== (u.active !== false) ||
      row.role !== roleOf(u) ||
      row.teamId !== (u.teamId ?? '')
    );
  }

  async saveUser(row: EditableUser) {
    if (row.user.userId === this.myUid && (!row.isAdmin || !row.active)) {
      this.toast('warn', 'Not allowed', "You can't remove your own admin access or deactivate yourself.");
      return;
    }
    if (row.role === 'leader' && !row.teamId) {
      this.toast('warn', 'Pick a team', 'A Team Leader needs a team to lead.');
      return;
    }
    const replacing = row.role === 'leader' ? this.teamById(row.teamId)?.leaderId : '';
    row.saving = true;
    try {
      await this.org.saveMembership(
        row.user,
        { isAdmin: row.isAdmin, active: row.active, role: row.role, teamId: row.teamId },
        this.teams
      );
      this.toast(
        'success',
        'User updated',
        replacing && replacing !== row.user.userId
          ? `${row.user.name} now leads ${this.teamName(row.teamId)}; ${this.userName(replacing)} is a member again.`
          : row.user.name
      );
      await Promise.all([this.loadUsers(), this.loadTeams()]);
      this.loadTeam();
    } catch (error) {
      console.error('Error updating user', error);
      this.toast('error', 'Update failed', 'Please try again.');
    } finally {
      row.saving = false;
    }
  }

  /* ---------- Teams ---------- */

  private async loadTeams() {
    try {
      this.teams = await this.org.getTeams();
    } catch (error) {
      console.error('Error fetching teams', error);
      this.toast('error', 'Could not load teams', 'Please refresh the page.');
    }
  }

  get teamOptions() {
    return [{ label: 'No team', value: '' }, ...this.teams.map((t) => ({ label: t.name, value: t.id! }))];
  }

  teamById(id: string): Team | undefined {
    return this.teams.find((t) => t.id === id);
  }

  teamName(id?: string): string {
    return (id && this.teamById(id)?.name) || '—';
  }

  teamMembers(team: Team): UserProfile[] {
    return this.users.filter((u) => u.teamId === team.id && u.userId !== team.leaderId && u.active !== false);
  }

  // Anyone except project managers can lead; picking someone from another team moves them here
  leaderOptions(team: Team) {
    return this.users
      .filter((u) => u.active !== false && roleOf(u) !== 'pm')
      .map((u) => ({
        label: u.teamId && u.teamId !== team.id ? `${u.name} (from ${this.teamName(u.teamId)})` : u.name,
        value: u.userId,
      }));
  }

  async addTeam() {
    const name = this.newTeamName.trim();
    if (!name) return;
    if (this.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      this.toast('warn', 'Team exists', `There is already a team called ${name}.`);
      return;
    }
    this.teamSaving = true;
    try {
      await this.org.createTeam(name);
      this.newTeamName = '';
      await this.loadTeams();
      this.toast('success', 'Team added', name);
    } catch (error) {
      console.error('Error adding team', error);
      this.toast('error', 'Could not add team', 'Please try again.');
    } finally {
      this.teamSaving = false;
    }
  }

  async changeLeader(team: Team, leaderId: string | null) {
    this.teamSaving = true;
    try {
      if (!leaderId) {
        await this.org.clearLeader(team);
      } else {
        const leader = this.usersById.get(leaderId)!;
        await this.org.saveMembership(leader, { role: 'leader', teamId: team.id! }, this.teams);
      }
      await Promise.all([this.loadUsers(), this.loadTeams()]);
      this.toast('success', 'Leader updated', team.name);
    } catch (error) {
      console.error('Error changing leader', error);
      this.toast('error', 'Could not change the leader', 'Please try again.');
      await this.loadTeams();
    } finally {
      this.teamSaving = false;
    }
  }

  async deleteTeam(team: Team) {
    this.teamSaving = true;
    try {
      await this.org.deleteTeam(team, this.users);
      await Promise.all([this.loadUsers(), this.loadTeams()]);
      this.toast('success', 'Team deleted', `${team.name}'s people are now without a team.`);
    } catch (error) {
      console.error('Error deleting team', error);
      this.toast('error', 'Could not delete team', 'Please try again.');
    } finally {
      this.teamSaving = false;
    }
  }

  async downloadUserData(user: any) {
    let days: any[];
    try {
      days = await this.httpRequestsService.getUserDays(user.userId);
    } catch (error) {
      console.error('Error fetching user days', error);
      this.toast('error', 'Export failed', 'Could not load this user’s days.');
      return;
    }
    days.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    const yesNo = (value: any) => (value ? 'Yes' : 'No');
    downloadCsv(`${slug(user.name)}_timetracking.csv`, [
      ['Date', 'Check In', 'Check Out', 'Status', 'Late', 'Early Leave', 'Late Excuse', 'Early Leave Excuse'],
      ...days.map((day) => [
        day.start,
        day.isDayOff ? '' : timePart(day.in),
        day.isDayOff ? '' : timePart(day.out),
        dayStatus(day).label,
        yesNo(day.isLate),
        yesNo(day.isEarlyLeave),
        yesNo(day.lateExcuse),
        yesNo(day.earlyLeaveExcuse),
      ]),
    ]);
  }

  /* ---------- Team overview ---------- */

  get teamPeriod(): ReportingPeriod {
    return periodFromKey(this.teamPeriodKey);
  }

  get isCurrentTeamPeriod(): boolean {
    return this.teamPeriodKey === periodKey(periodContaining(new Date()));
  }

  get teamSummary() {
    const today = this.team.map((r) => r.today.label);
    return {
      active: this.team.length,
      in: today.filter((t) => t.startsWith('In since')).length,
      done: today.filter((t) => t.startsWith('Done')).length,
      notIn: today.filter((t) => t === 'Not in yet').length,
      off: today.filter((t) => ['Paid leave', 'Absent', 'Task'].includes(t)).length,
    };
  }

  async loadTeam() {
    this.teamLoading = true;
    const period = this.teamPeriod;
    const today = toDateString(new Date());
    const activeUsers = this.users.filter((u) => u.active !== false);
    try {
      this.team = await Promise.all(
        activeUsers.map(async (user) => {
          const days: DayRecord[] = await this.httpRequestsService.getUserMonthDays(user.userId, period.end).catch(() => []);
          this.teamDays.set(user.userId, days);
          return {
            user,
            today: this.todayStatus(days.find((d) => d.start === today)),
            workDays: days.filter((d) => !d.isDayOff).length,
            late: days.filter((d) => !d.isDayOff && d.isLate && !d.lateExcuse && !d.earlyLeaveExcuse).length,
            absences: days.filter((d) => d.isDayOff && d.dayOffType === DayOffType.Absent).length,
            leave: days.filter((d) => d.isDayOff && d.dayOffType === DayOffType.Paid).length,
          };
        })
      );
    } finally {
      this.teamLoading = false;
    }
  }

  private todayStatus(day?: DayRecord): { label: string; tone: string } {
    if (!this.isCurrentTeamPeriod) return { label: '—', tone: '' };
    if (!day) return { label: 'Not in yet', tone: '' };
    if (day.isDayOff) {
      const status: DayStatus = dayStatus(day);
      return { label: status.label, tone: status.tone };
    }
    if (!day.out) return { label: `In since ${formatTime12(timePart(day.in))}`, tone: day.isLate ? 'warning' : 'success' };
    return { label: `Done ${formatTime12(timePart(day.in))} – ${formatTime12(timePart(day.out))}`, tone: 'info' };
  }

  exportTeamCsv() {
    downloadCsv(`team_report_${this.teamPeriodKey}.csv`, [
      ['Name', 'Email', 'Work days', 'Unexcused late', 'Absences', 'Paid leave'],
      ...this.team.map((r) => [
        r.user.name,
        r.user.email,
        r.workDays,
        r.late,
        r.absences,
        r.leave,
      ]),
    ]);
  }

  /* ---------- Leave requests ---------- */

  private async loadLeave() {
    try {
      this.leaveRequests = await this.leaveService.getAllRequests();
    } catch (error) {
      console.error('Error loading leave requests', error);
    }
  }

  get pendingCount(): number {
    return this.leaveRequests.filter((r) => r.status === 'pending').length;
  }

  get filteredLeave(): LeaveRequest[] {
    return this.leaveFilter === 'all' ? this.leaveRequests : this.leaveRequests.filter((r) => r.status === this.leaveFilter);
  }

  leaveTone(status: LeaveStatus): string {
    return { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: '' }[status];
  }

  openDecision(request: LeaveRequest, action: 'approve' | 'reject') {
    this.decision = { request, action };
    this.decisionNote = '';
  }

  async confirmDecision() {
    if (!this.decision) return;
    const { request, action } = this.decision;
    this.deciding = true;
    try {
      if (action === 'approve') {
        await this.leaveService.approve(request, this.decisionNote.trim());
      } else {
        await this.leaveService.reject(request, this.decisionNote.trim());
      }
      this.toast('success', action === 'approve' ? 'Leave approved' : 'Leave rejected', `${request.userName} was notified.`);
      this.decision = null;
      await this.loadLeave();
      if (action === 'approve') this.loadTeam();
    } catch (error) {
      console.error('Error deciding leave', error);
      this.toast('error', 'Could not save the decision', 'Please try again.');
    } finally {
      this.deciding = false;
    }
  }

  /* ---------- Payroll locking ---------- */

  private async loadLocks() {
    try {
      this.locks = await this.payroll.getLocks();
    } catch (error) {
      console.error('Error loading locks', error);
    }
  }

  periodLabelOf(period: ReportingPeriod) {
    return periodLabel(period);
  }

  keyOf(period: ReportingPeriod) {
    return periodKey(period);
  }

  isPeriodOver(period: ReportingPeriod): boolean {
    return period.end < new Date();
  }

  async confirmLock() {
    if (!this.lockTarget) return;
    const key = periodKey(this.lockTarget);
    this.locking = true;
    try {
      await this.payroll.lock(key, this.users);
      await this.loadLocks();
      this.toast('success', 'Period closed', 'Employees were notified that their payslips are ready.');
      this.lockTarget = null;
    } catch (error) {
      console.error('Error locking period', error);
      this.toast('error', 'Could not close the period', 'Please try again.');
    } finally {
      this.locking = false;
    }
  }

  async unlock(period: ReportingPeriod) {
    try {
      await this.payroll.unlock(periodKey(period));
      await this.loadLocks();
      this.toast('info', 'Period reopened', periodLabel(period));
    } catch {
      this.toast('error', 'Could not reopen the period', 'Please try again.');
    }
  }

  /* ---------- Audit log ---------- */

  async loadAudit() {
    try {
      this.audit = await this.payroll.getAuditLog();
      this.auditLoaded = true;
    } catch (error) {
      console.error('Error loading audit log', error);
      this.toast('error', 'Could not load the audit log', 'Please try again.');
    }
  }

  get auditUserOptions() {
    return [{ label: 'All users', value: null }, ...this.users.map((u) => ({ label: u.name, value: u.userId }))];
  }

  get filteredAudit(): AuditEntry[] {
    return this.auditUserFilter ? this.audit.filter((a) => a.ownerId === this.auditUserFilter) : this.audit;
  }

  /** Short description of what changed in a day. */
  describeChange(entry: AuditEntry): string {
    const describe = (d: Partial<DayRecord> | null) => {
      if (!d) return 'nothing';
      const status = dayStatus(d).label;
      if (d.isDayOff) return status;
      const times = [timePart(d.in), timePart(d.out)].filter(Boolean).join('–');
      return `${status}${times ? ` ${times}` : ''}`;
    };
    const after = { ...(entry.before ?? {}), ...entry.after };
    return `${describe(entry.before)} → ${describe(after)}`;
  }

  /* ---------- Holidays ---------- */

  private async loadHolidays() {
    try {
      const holidays = await this.httpRequestsService.getHolidays();
      this.holidays = holidays
        .map((item: any) => ({ date: item.date.toDate(), name: item.name, tags: item.tags, id: item.id }))
        .sort((a: any, b: any) => b.date - a.date);
    } catch (error) {
      console.error('Error fetching holidays', error);
    }
  }

  addHoliday() {
    if (this.newHoliday.name && this.newHoliday.date) {
      const holiday = {
        date: this.newHoliday.date,
        name: this.newHoliday.name,
        tags: this.selectedTags,
      };

      this.httpRequestsService.addHoliday(holiday).then((res) => {
        if (res.id) {
          this.toast('success', 'Holiday added', holiday.name);
          this.loadHolidays();
        }
      }).catch((error) => {
        console.error('Error adding holiday', error);
        this.toast('error', 'Could not add the holiday', 'Please try again.');
      });

      // Reset form
      this.newHoliday = {
        date: new Date(),
        name: '',
        tags: [],
      };
      this.selectedTags = [];
    }
  }

  deleteHoliday(holiday: any) {
    this.httpRequestsService.deleteHoliday(holiday.id).then((res: any) => {
      if (res?.id) {
        this.holidays = this.holidays.filter((h: any) => h.id !== holiday.id);
        this.toast('info', 'Holiday removed', holiday.name);
      }
    }).catch((error) => {
      console.error('Error deleting holiday', error);
    });
  }

  tagList(tags: unknown): string[] {
    return Array.isArray(tags) ? tags : tags ? [String(tags)] : [];
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
