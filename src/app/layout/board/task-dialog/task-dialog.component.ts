import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import {
  ChecklistItem,
  DirectoryEntry,
  Project,
  ROLE_LABELS,
  Task,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  TaskLink,
  TaskPriority,
  TaskStatus,
  TaskActivity,
  TaskType,
  Team,
  UserProfile,
  WORK_KINDS,
  WorkLog,
} from '../../../shared/models';
import { NewTask, NewWorkLog, TaskService } from '../../../shared/services/task.service';
import {
  canAddSubtask,
  canArchiveTask,
  canEditTask,
  canLogTime,
  canMoveTask,
  canWorkOnTask,
  managesAll,
  subtaskProgress,
} from '../../../shared/utils/task-access';
import { toDateString } from '../../../shared/utils/work-schedule';

export type TaskDialogResult =
  | { kind: 'create'; task: NewTask }
  | { kind: 'update'; id: string; changes: Partial<NewTask> }
  | { kind: 'delete'; id: string }
  | { kind: 'archive'; id: string; archived: boolean };

type LogForm = Required<NewWorkLog>;

const ACTIVITY_OPEN_KEY = 'taskActivityOpen';

type TaskForm = Omit<NewTask, 'createdBy' | 'createdByName' | 'order' | 'teamIds' | 'parentId'>;

const SAFE_URL = /^https?:\/\//i;

// Create, edit or view a team task. Editing is for the reviewer (creator, PMs, admins);
// assignees get a read-only view where they can still change the status and tick the checklist.
// Existing tasks also show the time logged on them (assignees and the reviewer log their own)
// and, on demand, the task's activity history.
@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    InputNumberModule,
    InputTextModule,
    InputTextareaModule,
    MultiSelectModule,
    TooltipModule,
  ],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss',
})
export class TaskDialogComponent implements OnChanges, OnDestroy {
  /** The task to show, or null with `open` for a new one. */
  @Input() task: Task | null = null;
  @Input() open = false;
  /** Status for a new task (the column its "+" was pressed in). */
  @Input() initialStatus: TaskStatus = 'todo';
  /** Parent of a new sub-task. */
  @Input() parent: Task | null = null;
  /** Every task the viewer can see, to list sub-tasks and name the parent. */
  @Input() allTasks: Task[] = [];
  @Input() me: UserProfile | null = null;
  @Input() people: DirectoryEntry[] = [];
  @Input() teams: Team[] = [];
  @Input() projects: Project[] = [];
  @Input() saving = false;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskDialogResult>();
  @Output() openTask = new EventEmitter<string>();
  @Output() addSubtask = new EventEmitter<Task>();

  readonly types = Object.entries(TASK_TYPES).map(([value, meta]) => ({ value: value as TaskType, ...meta }));
  readonly priorities = Object.entries(TASK_PRIORITIES).map(([value, meta]) => ({ value: value as TaskPriority, ...meta }));
  readonly TASK_TYPES = TASK_TYPES;
  readonly TASK_PRIORITIES = TASK_PRIORITIES;

  form!: TaskForm;
  newLink: TaskLink = { label: '', url: '' };
  newChecklistItem = '';
  confirmDelete = false;

  // Time logged on the task, and its history (both live while the dialog shows the task)
  workLogs: WorkLog[] = [];
  logForm: LogForm | null = null;
  loggingTime = false;
  logError = '';
  activity: TaskActivity[] = [];
  activityOpen = false;
  private watchedId = '';
  private unwatch: (() => void)[] = [];
  readonly kindSuggestions = WORK_KINDS;
  readonly today = toDateString(new Date());

  constructor(private host: ElementRef<HTMLElement>, private taskService: TaskService) {
    try {
      this.activityOpen = typeof window !== 'undefined' && window.localStorage.getItem(ACTIVITY_OPEN_KEY) === '1';
    } catch {
      // Storage blocked: activity starts hidden
    }
  }

  ngOnDestroy() {
    this.stopWatching();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] || changes['task']) this.watchTask(this.open ? this.task?.id ?? '' : '');
    // Reset the form when the dialog opens or switches task, not when `saving` flips
    if (!this.open || !(changes['open'] || changes['task'] || changes['parent'])) return;
    const t = this.task;
    const parent = this.parent;
    this.form = {
      title: t?.title ?? '',
      description: t?.description ?? '',
      type: t?.type ?? 'feature',
      priority: t?.priority ?? 'medium',
      status: t?.status ?? this.initialStatus,
      projectId: t?.projectId ?? parent?.projectId ?? '',
      assigneeIds: [...(t?.assigneeIds ?? [])],
      dueDate: t?.dueDate ?? parent?.dueDate ?? '',
      estimateHours: t?.estimateHours ?? null,
      links: (t?.links ?? []).map((l) => ({ ...l })),
      checklist: (t?.checklist ?? []).map((c) => ({ ...c })),
      reviewNote: t?.reviewNote ?? '',
    };
    this.newLink = { label: '', url: '' };
    this.newChecklistItem = '';
    this.confirmDelete = false;
    this.logForm = null;
    this.logError = '';
    // Start at the top when opening or jumping between parent and sub-task
    setTimeout(() => this.host.nativeElement.querySelector('.p-dialog-content')?.scrollTo(0, 0));
  }

  /* ---------- Live work logs & activity ---------- */

  private watchTask(id: string) {
    if (id === this.watchedId) return;
    this.stopWatching();
    this.watchedId = id;
    this.workLogs = [];
    this.activity = [];
    if (!id) return;
    const onError = (what: string) => (error: unknown) => console.error(`Could not load the task's ${what}:`, error);
    this.unwatch = [
      this.taskService.watchWorkLogs(id, (logs) => (this.workLogs = logs), onError('time')),
      this.taskService.watchActivity(id, (entries) => (this.activity = entries), onError('activity')),
    ];
  }

  private stopWatching() {
    this.unwatch.forEach((stop) => stop());
    this.unwatch = [];
    this.watchedId = '';
  }

  toggleActivity() {
    this.activityOpen = !this.activityOpen;
    try {
      window.localStorage.setItem(ACTIVITY_OPEN_KEY, this.activityOpen ? '1' : '0');
    } catch {
      // Not remembered; fine
    }
  }

  /* ---------- Time ---------- */

  get canLogTime(): boolean {
    return !!this.task && canLogTime(this.task, this.me);
  }

  get loggedHours(): number {
    return Math.round(this.workLogs.reduce((sum, l) => sum + l.hours, 0) * 100) / 100;
  }

  /** Hours per person, most first. */
  get hoursByPerson(): { name: string; hours: number }[] {
    const totals = new Map<string, number>();
    for (const log of this.workLogs) totals.set(log.userName, (totals.get(log.userName) ?? 0) + log.hours);
    return [...totals.entries()].map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 })).sort((a, b) => b.hours - a.hours);
  }

  get countrySuggestions(): string[] {
    return [...new Set(this.workLogs.map((l) => l.country).filter(Boolean))];
  }

  canDeleteLog(log: WorkLog): boolean {
    return managesAll(this.me) || log.userId === this.me?.userId;
  }

  logPages(log: WorkLog): string {
    return log.pages.split('\n').map((p) => p.trim()).filter(Boolean).join(', ');
  }

  openLogForm() {
    // Start from what this person logged last on the task
    const mine = this.workLogs.find((l) => l.userId === this.me?.userId);
    this.logForm = {
      date: toDateString(new Date()),
      hours: 1,
      country: mine?.country ?? this.workLogs[0]?.country ?? '',
      kind: mine?.kind ?? '',
      pages: '',
      note: '',
    };
    this.logError = '';
  }

  get logFormError(): string {
    const f = this.logForm;
    if (!f) return '';
    if (!f.date) return 'Pick a date.';
    if (f.date > toDateString(new Date())) return "You can't log time in the future.";
    if (!f.hours || f.hours <= 0 || f.hours > 24) return 'Hours must be between 0 and 24.';
    return '';
  }

  async saveLog() {
    const f = this.logForm;
    if (!f || !this.task || this.logFormError) return;
    this.loggingTime = true;
    this.logError = '';
    try {
      await this.taskService.logTime(this.task, {
        date: f.date,
        hours: Math.round(f.hours * 100) / 100,
        country: f.country.trim(),
        kind: f.kind.trim(),
        pages: f.pages.trim(),
        note: f.note.trim(),
      });
      this.logForm = null;
    } catch (error) {
      console.error('Error logging time', error);
      this.logError = 'Could not log the time. Please try again.';
    } finally {
      this.loggingTime = false;
    }
  }

  async deleteLog(log: WorkLog) {
    if (!this.task) return;
    try {
      await this.taskService.deleteTimeLog(this.task, log);
    } catch (error) {
      console.error('Error deleting time log', error);
      this.logError = 'Could not delete that entry. Please try again.';
    }
  }

  /* ---------- Access ---------- */

  get isNew(): boolean {
    return !this.task;
  }

  get canEdit(): boolean {
    return this.isNew || canEditTask(this.task!, this.me);
  }

  get canWork(): boolean {
    return this.isNew || canWorkOnTask(this.task!, this.me);
  }

  get canArchive(): boolean {
    return !this.isNew && canArchiveTask(this.task!, this.me);
  }

  get statusOptions() {
    return TASK_STATUSES.filter((s) => this.isNew || s.value === this.task!.status || canMoveTask(this.task!, s.value, this.me));
  }

  /* ---------- Options ---------- */

  private teamName(id: string): string {
    return this.teams.find((t) => t.id === id)?.name ?? '';
  }

  /** PMs/admins assign leaders and members of any team; leaders assign within their own team. */
  get assigneeOptions() {
    const me = this.me;
    const current = new Set(this.form?.assigneeIds ?? []);
    return this.people
      .filter((p) => current.has(p.userId) || (p.active && p.role !== 'pm'))
      .filter((p) => current.has(p.userId) || managesAll(me) || (!!me?.teamId && p.teamId === me.teamId))
      .map((p) => ({
        value: p.userId,
        label: p.name,
        avatar: p.avatar,
        detail: [p.role === 'leader' ? ROLE_LABELS.leader : '', this.teamName(p.teamId)].filter(Boolean).join(' · '),
      }));
  }

  get projectOptions() {
    const current = this.form?.projectId;
    return [
      { label: 'No project', value: '', color: '' },
      ...this.projects.filter((p) => p.active || p.id === current).map((p) => ({ label: p.name, value: p.id!, color: p.color })),
    ];
  }

  person(id: string): DirectoryEntry | undefined {
    return this.people.find((p) => p.userId === id);
  }

  project(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  get header(): string {
    if (this.isNew) return this.parent ? 'New sub-task' : 'New task';
    return this.canEdit ? 'Edit task' : 'Task';
  }

  get overdue(): boolean {
    return !!this.form?.dueDate && this.form.status !== 'done' && this.form.dueDate < toDateString(new Date());
  }

  /* ---------- Sub-tasks ---------- */

  /** The parent of the task being shown (or of the new sub-task). */
  get parentTask(): Task | null {
    if (this.parent) return this.parent;
    const id = this.task?.parentId;
    return id ? this.allTasks.find((t) => t.id === id) ?? null : null;
  }

  get subtasks(): Task[] {
    const id = this.task?.id;
    return id ? this.allTasks.filter((t) => t.parentId === id).sort((a, b) => a.order - b.order) : [];
  }

  get progress() {
    return this.task ? subtaskProgress(this.task) : { done: 0, total: 0 };
  }

  /** Sub-tasks recorded on the parent that this viewer can't see (other teams'). */
  get hiddenSubtasks(): number {
    return Math.max(0, this.progress.total - this.subtasks.length);
  }

  get canAddSubtask(): boolean {
    return !!this.task && canAddSubtask(this.task, this.me);
  }

  statusLabel(status: TaskStatus): string {
    return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
  }

  /* ---------- Links & checklist ---------- */

  addLink() {
    const url = this.newLink.url.trim();
    if (!SAFE_URL.test(url)) return;
    this.form.links.push({ label: this.newLink.label.trim() || url.replace(SAFE_URL, '').split('/')[0], url });
    this.newLink = { label: '', url: '' };
  }

  get newLinkValid(): boolean {
    return SAFE_URL.test(this.newLink.url.trim());
  }

  removeLink(index: number) {
    this.form.links.splice(index, 1);
  }

  /** Only http(s) links are ever rendered as links. */
  safeUrl(url: string): string | null {
    return SAFE_URL.test(url) ? url : null;
  }

  addChecklistItem() {
    const text = this.newChecklistItem.trim();
    if (!text) return;
    this.form.checklist.push({ text, done: false });
    this.newChecklistItem = '';
  }

  removeChecklistItem(index: number) {
    this.form.checklist.splice(index, 1);
  }

  get checklistDone(): number {
    return this.form?.checklist.filter((c: ChecklistItem) => c.done).length ?? 0;
  }

  /* ---------- Submit ---------- */

  get needsReviewNote(): boolean {
    return this.form?.status === 'changes' && this.task?.status !== 'changes';
  }

  get error(): string {
    if (!this.form) return '';
    if (this.canEdit && !this.form.title.trim()) return 'Add a title.';
    if (this.needsReviewNote && !this.form.reviewNote.trim()) return 'Say what needs to change.';
    return '';
  }

  submit() {
    if (this.error) return;
    const f = this.form;

    if (this.isNew) {
      this.submitted.emit({
        kind: 'create',
        task: {
          ...f,
          title: f.title.trim(),
          description: f.description.trim(),
          reviewNote: '',
          order: 0, // the board places it at the end of its column
          teamIds: [],
          parentId: this.parent?.id ?? '',
          createdBy: '',
          createdByName: '',
        },
      });
      return;
    }

    const t = this.task!;
    // Assignees may only send the fields the rules allow them to change
    const changes: Partial<NewTask> = this.canEdit
      ? {
          ...f,
          title: f.title.trim(),
          description: f.description.trim(),
          reviewNote: f.status === 'done' ? '' : f.reviewNote.trim(),
        }
      : { status: f.status, checklist: f.checklist };
    if (changes.status === t.status) delete changes.status;
    this.submitted.emit({ kind: 'update', id: t.id!, changes });
  }

  remove() {
    if (!this.task) return;
    if (!this.confirmDelete) {
      this.confirmDelete = true;
      return;
    }
    this.submitted.emit({ kind: 'delete', id: this.task.id! });
  }

  setArchived(archived: boolean) {
    if (this.task) this.submitted.emit({ kind: 'archive', id: this.task.id!, archived });
  }
}
