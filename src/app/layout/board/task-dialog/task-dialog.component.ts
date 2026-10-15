import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
  TaskType,
  Team,
  UserProfile,
} from '../../../shared/models';
import { NewTask } from '../../../shared/services/task.service';
import { canEditTask, canMoveTask, canWorkOnTask, managesAll } from '../../../shared/utils/task-access';
import { toDateString } from '../../../shared/utils/work-schedule';

export type TaskDialogResult =
  | { kind: 'create'; task: NewTask }
  | { kind: 'update'; id: string; changes: Partial<NewTask> }
  | { kind: 'delete'; id: string };

type TaskForm = Omit<NewTask, 'createdBy' | 'createdByName' | 'order' | 'teamIds' | 'parentId'>;

const SAFE_URL = /^https?:\/\//i;

// Create, edit or view a team task. Editing is for the reviewer (creator, PMs, admins);
// assignees get a read-only view where they can still change the status and tick the checklist.
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
export class TaskDialogComponent implements OnChanges {
  /** The task to show, or null with `open` for a new one. */
  @Input() task: Task | null = null;
  @Input() open = false;
  /** Status for a new task (the column its "+" was pressed in). */
  @Input() initialStatus: TaskStatus = 'todo';
  @Input() me: UserProfile | null = null;
  @Input() people: DirectoryEntry[] = [];
  @Input() teams: Team[] = [];
  @Input() projects: Project[] = [];
  @Input() saving = false;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskDialogResult>();

  readonly types = Object.entries(TASK_TYPES).map(([value, meta]) => ({ value: value as TaskType, ...meta }));
  readonly priorities = Object.entries(TASK_PRIORITIES).map(([value, meta]) => ({ value: value as TaskPriority, ...meta }));
  readonly TASK_TYPES = TASK_TYPES;
  readonly TASK_PRIORITIES = TASK_PRIORITIES;

  form!: TaskForm;
  newLink: TaskLink = { label: '', url: '' };
  newChecklistItem = '';
  confirmDelete = false;

  ngOnChanges(changes: SimpleChanges) {
    // Reset the form when the dialog opens or switches task, not when `saving` flips
    if (!this.open || !(changes['open'] || changes['task'])) return;
    const t = this.task;
    this.form = {
      title: t?.title ?? '',
      description: t?.description ?? '',
      type: t?.type ?? 'feature',
      priority: t?.priority ?? 'medium',
      status: t?.status ?? this.initialStatus,
      projectId: t?.projectId ?? '',
      assigneeIds: [...(t?.assigneeIds ?? [])],
      dueDate: t?.dueDate ?? '',
      estimateHours: t?.estimateHours ?? null,
      links: (t?.links ?? []).map((l) => ({ ...l })),
      checklist: (t?.checklist ?? []).map((c) => ({ ...c })),
      reviewNote: t?.reviewNote ?? '',
    };
    this.newLink = { label: '', url: '' };
    this.newChecklistItem = '';
    this.confirmDelete = false;
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
    if (this.isNew) return 'New task';
    return this.canEdit ? 'Edit task' : 'Task';
  }

  get overdue(): boolean {
    return !!this.form?.dueDate && this.form.status !== 'done' && this.form.dueDate < toDateString(new Date());
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
          parentId: '',
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
}
