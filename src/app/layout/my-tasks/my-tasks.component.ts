import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { OrgService } from '../../shared/services/org.service';
import { entryMinutes, minutesOf, TimeEntryService } from '../../shared/services/time-entry.service';
import { Project, TimeEntry, WORK_KINDS } from '../../shared/models';
import { nowTimeString, parseLocalDate, toDateString } from '../../shared/utils/work-schedule';
import { formatMinutes, formatTime12 } from '../../shared/utils/format';

type EntryForm = Required<Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>>;

/** How far back the country / kind-of-work suggestions look. */
const SUGGESTION_DAYS = 120;

interface WeekDay {
  date: string;
  weekday: string;
  day: number;
  minutes: number;
}

// Private daily task log: what you worked on, for which project, from when to when.
// Stored under users/{uid}/timeEntries, which only the owner can read.
@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    DialogModule,
    DropdownModule,
    InputTextModule,
    InputTextareaModule,
    ToastModule,
    TooltipModule,
    LoaderComponent,
  ],
  providers: [MessageService],
  templateUrl: './my-tasks.component.html',
  styleUrl: './my-tasks.component.scss',
})
export class MyTasksComponent implements OnInit, OnDestroy {
  readonly formatMinutes = formatMinutes;
  readonly formatTime12 = formatTime12;

  loading = true;
  saving = false;
  today = toDateString(new Date());
  selectedDate = this.today;
  now = nowTimeString();

  week: WeekDay[] = [];
  private weekEntries: TimeEntry[] = [];
  running: TimeEntry | null = null;

  projects: Project[] = [];
  private projectsById = new Map<string, Project>();

  // Suggestions for the production report fields, from recent entries
  countries: string[] = [];
  kinds: string[] = WORK_KINDS;
  private recentEntries: TimeEntry[] = [];

  // Dialog: null when closed; editingId '' for a new entry
  form: EntryForm | null = null;
  editingId = '';
  startingTimer = false; // the dialog is the quick "start timer" form

  private clock?: ReturnType<typeof setInterval>;

  constructor(
    private entries: TimeEntryService,
    private org: OrgService,
    private messageService: MessageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    // Keeps the running timer and "today" current
    this.clock = setInterval(() => {
      this.now = nowTimeString();
      this.today = toDateString(new Date());
    }, 30_000);

    try {
      const [projects] = await Promise.all([
        this.org.getProjects(),
        this.loadWeek(),
        this.loadRunning(),
        this.loadSuggestions(),
      ]);
      this.projects = projects;
      this.projectsById = new Map(projects.map((p) => [p.id!, p]));
    } catch (error) {
      console.error('Error loading tasks', error);
      this.toast('error', 'Could not load your tasks', 'Please refresh the page.');
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    if (this.clock) clearInterval(this.clock);
  }

  /* ---------- Loading ---------- */

  // Weeks run Saturday → Friday, like the work week
  private weekStart(date: string): Date {
    const d = parseLocalDate(date);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    return d;
  }

  private async loadWeek() {
    const start = this.weekStart(this.selectedDate);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    this.weekEntries = await this.entries.getRange(toDateString(days[0]), toDateString(days[6]));
    this.week = days.map((d) => {
      const date = toDateString(d);
      return {
        date,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        day: d.getDate(),
        minutes: this.minutesOn(date),
      };
    });
  }

  private async loadRunning() {
    this.running = await this.entries.getRunning();
  }

  private async loadSuggestions() {
    const from = new Date();
    from.setDate(from.getDate() - SUGGESTION_DAYS);
    this.recentEntries = await this.entries.getRange(toDateString(from), this.today);
    const distinct = (values: (string | undefined)[]) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];
    this.countries = distinct(this.recentEntries.map((e) => e.country)).sort();
    this.kinds = distinct([...WORK_KINDS, ...this.recentEntries.map((e) => e.kind)]);
  }

  /** The country last used with this project, so it doesn't have to be typed every time. */
  private lastCountryFor(projectId: string): string {
    const all = [...this.recentEntries, ...this.weekEntries].filter((e) => e.country && e.projectId === projectId);
    all.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    return all.at(-1)?.country ?? '';
  }

  onProjectChange(projectId: string) {
    if (this.form && !this.form.country) this.form.country = this.lastCountryFor(projectId);
  }

  private async reload() {
    await Promise.all([this.loadWeek(), this.loadRunning()]);
  }

  /* ---------- Day navigation ---------- */

  async selectDate(date: string) {
    if (!date) return;
    const sameWeek = this.week.some((d) => d.date === date);
    this.selectedDate = date;
    if (!sameWeek) await this.loadWeek();
  }

  shiftDay(days: number) {
    const d = parseLocalDate(this.selectedDate);
    d.setDate(d.getDate() + days);
    this.selectDate(toDateString(d));
  }

  get selectedLabel(): string {
    if (this.selectedDate === this.today) return 'Today';
    return parseLocalDate(this.selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  get weekLabel(): string {
    if (!this.week.length) return '';
    const fmt = (date: string) => parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(this.week[0].date)} – ${fmt(this.week[6].date)}`;
  }

  /* ---------- Day data ---------- */

  get dayEntries(): TimeEntry[] {
    return this.weekEntries.filter((e) => e.date === this.selectedDate);
  }

  minutes(entry: TimeEntry): number {
    return entryMinutes(entry, entry.date === this.today ? this.now : '23:59');
  }

  private minutesOn(date: string): number {
    return this.weekEntries.filter((e) => e.date === date).reduce((sum, e) => sum + this.minutes(e), 0);
  }

  get dayMinutes(): number {
    return this.minutesOn(this.selectedDate);
  }

  get weekMinutes(): number {
    return this.weekEntries.reduce((sum, e) => sum + this.minutes(e), 0);
  }

  /** Time per project on the selected day, largest first. */
  get byProject(): { project: Project | null; minutes: number }[] {
    const totals = new Map<string, number>();
    for (const e of this.dayEntries) totals.set(e.projectId, (totals.get(e.projectId) ?? 0) + this.minutes(e));
    return [...totals.entries()]
      .map(([id, minutes]) => ({ project: this.projectsById.get(id) ?? null, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }

  /** "Oman · creation · p71_3, p72_1" for the entry list. */
  reportDetails(entry: TimeEntry): string {
    const pages = (entry.pages ?? '').split('\n').map((p) => p.trim()).filter(Boolean).join(', ');
    return [entry.country, entry.kind, pages].filter(Boolean).join(' · ');
  }

  project(id: string): Project | undefined {
    return this.projectsById.get(id);
  }

  /** Active projects, plus the entry's own project if it has since been archived. */
  get projectOptions() {
    const current = this.form?.projectId;
    return [
      { label: 'No project', value: '', color: '' },
      ...this.projects
        .filter((p) => p.active || p.id === current)
        .map((p) => ({ label: p.name, value: p.id!, color: p.color })),
    ];
  }

  /* ---------- Timer ---------- */

  openStartTimer() {
    this.startingTimer = true;
    this.editingId = '';
    this.form = this.emptyForm({ date: this.today, start: nowTimeString() });
  }

  async stopTimer() {
    const entry = this.running;
    if (!entry) return;
    // A timer left running past midnight ends at the end of its day
    let end = entry.date === this.today ? nowTimeString() : '23:59';
    if (minutesOf(end) <= minutesOf(entry.start)) {
      const m = minutesOf(entry.start) + 1;
      end = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }
    this.saving = true;
    try {
      await this.entries.update(entry.id!, { end });
      await this.reload();
      this.toast('success', 'Timer stopped', `${entry.title} · ${formatMinutes(minutesOf(end) - minutesOf(entry.start))}`);
    } catch (error) {
      console.error('Error stopping timer', error);
      this.toast('error', 'Could not stop the timer', 'Please try again.');
    } finally {
      this.saving = false;
    }
  }

  /* ---------- Add / edit ---------- */

  openNew() {
    this.startingTimer = false;
    this.editingId = '';
    // Start where the day's last entry ended, or at 09:00
    const last = this.dayEntries.filter((e) => e.end).at(-1);
    const start = last?.end ?? '09:00';
    const end = `${String(Math.min(23, Math.floor(minutesOf(start) / 60) + 1)).padStart(2, '0')}:${start.slice(3)}`;
    const projectId = last?.projectId ?? '';
    this.form = this.emptyForm({
      projectId,
      country: this.lastCountryFor(projectId),
      date: this.selectedDate,
      start,
      end: end > start ? end : '23:59',
    });
  }

  openEdit(entry: TimeEntry) {
    this.startingTimer = false;
    this.editingId = entry.id!;
    this.form = {
      title: entry.title,
      projectId: entry.projectId,
      date: entry.date,
      start: entry.start,
      end: entry.end,
      note: entry.note ?? '',
      country: entry.country ?? '',
      kind: entry.kind ?? '',
      pages: entry.pages ?? '',
    };
  }

  private emptyForm(values: Partial<EntryForm>): EntryForm {
    return { title: '', projectId: '', date: '', start: '', end: '', note: '', country: '', kind: '', pages: '', ...values };
  }

  get editingRunning(): boolean {
    return !!this.editingId && this.editingId === this.running?.id;
  }

  /** Why the form can't be saved, or '' when it can. */
  get formError(): string {
    const f = this.form;
    if (!f) return '';
    if (!f.title.trim()) return 'Add a title.';
    if (!f.date || !f.start) return 'Pick a date and start time.';
    if (this.startingTimer || (this.editingRunning && !f.end)) return '';
    if (!f.end) return 'Pick an end time.';
    if (f.end <= f.start) return 'The end time must be after the start.';
    return '';
  }

  /** Length of the form's time range, 0 when incomplete. */
  get formMinutes(): number {
    const f = this.form;
    return f?.start && f.end && f.end > f.start ? minutesOf(f.end) - minutesOf(f.start) : 0;
  }

  /** Other entries on the same day that overlap the form's time range. */
  get overlaps(): TimeEntry[] {
    const f = this.form;
    if (!f || !f.start || this.formError) return [];
    const end = f.end || nowTimeString();
    return this.weekEntries.filter(
      (e) => e.id !== this.editingId && e.date === f.date && e.start < end && (e.end || this.now) > f.start
    );
  }

  async save() {
    const f = this.form;
    if (!f || this.formError) return;
    if (this.startingTimer && this.running) {
      this.toast('warn', 'A timer is already running', 'Stop it before starting another.');
      return;
    }
    const entry: EntryForm = {
      ...f,
      title: f.title.trim(),
      note: f.note.trim(),
      country: f.country.trim(),
      kind: f.kind.trim(),
      pages: f.pages.trim(),
    };
    const moved = !this.editingId || entry.date !== this.selectedDate;

    this.saving = true;
    try {
      if (this.editingId) {
        await this.entries.update(this.editingId, entry);
      } else {
        await this.entries.add(entry);
      }
      this.form = null;
      if (entry.country && !this.countries.includes(entry.country)) this.countries = [...this.countries, entry.country].sort();
      if (entry.kind && !this.kinds.includes(entry.kind)) this.kinds = [...this.kinds, entry.kind];
      if (moved) this.selectedDate = entry.date;
      await this.reload();
      this.toast('success', this.startingTimer ? 'Timer started' : this.editingId ? 'Task updated' : 'Task added', entry.title);
    } catch (error) {
      console.error('Error saving task', error);
      this.toast('error', 'Could not save the task', 'Please try again.');
    } finally {
      this.saving = false;
    }
  }

  async remove() {
    if (!this.editingId) return;
    const title = this.form?.title;
    this.saving = true;
    try {
      await this.entries.remove(this.editingId);
      this.form = null;
      await this.reload();
      this.toast('success', 'Task deleted', title ?? '');
    } catch (error) {
      console.error('Error deleting task', error);
      this.toast('error', 'Could not delete the task', 'Please try again.');
    } finally {
      this.saving = false;
    }
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
