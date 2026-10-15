import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { DirectoryService } from '../../shared/services/directory.service';
import { OrgService } from '../../shared/services/org.service';
import { HAS_WORK_LOGS, TaskService } from '../../shared/services/task.service';
import { UserService } from '../../shared/services/user.service';
import {
  DirectoryEntry,
  Project,
  Task,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  TaskStatus,
  TaskType,
  Team,
  UserProfile,
} from '../../shared/models';
import { canCreateTasks, canMoveTask, canWorkOnTask, managesAll, subtaskProgress } from '../../shared/utils/task-access';
import { toDateString } from '../../shared/utils/work-schedule';
import { TaskDialogComponent, TaskDialogResult } from './task-dialog/task-dialog.component';

interface Column {
  status: TaskStatus;
  label: string;
  reviewerOnly: boolean;
  tasks: Task[];
}

// Gap between neighbouring cards' `order`, so a card can be dropped between two others without renumbering
const ORDER_STEP = 1024;

// Team task board: Backlog → To do → In progress → Need review → Changes requested → Done.
@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    ButtonModule,
    DialogModule,
    DropdownModule,
    InputTextModule,
    InputTextareaModule,
    ToastModule,
    TooltipModule,
    LoaderComponent,
    TaskDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent implements OnInit, OnDestroy {
  readonly TASK_TYPES = TASK_TYPES;
  readonly TASK_PRIORITIES = TASK_PRIORITIES;

  loading = true;
  saving = false;
  me: UserProfile | null = null;
  today = toDateString(new Date());

  tasks: Task[] = [];
  columns: Column[] = TASK_STATUSES.map((s) => ({ status: s.value, label: s.label, reviewerOnly: !!s.reviewerOnly, tasks: [] }));

  people: DirectoryEntry[] = [];
  private peopleById = new Map<string, DirectoryEntry>();
  teams: Team[] = [];
  projects: Project[] = [];
  private projectsById = new Map<string, Project>();

  // Filters
  search = '';
  projectFilter = '';
  teamFilter = '';
  typeFilter: TaskType | '' = '';
  assigneeFilter = ''; // '' everyone, 'me', or a user id
  showArchived = false;

  // Task dialog: a copy taken when it opens, so live updates don't reset the form mid-edit
  dialogOpen = false;
  dialogTask: Task | null = null;
  dialogStatus: TaskStatus = 'todo';
  dialogParent: Task | null = null; // set when adding a sub-task
  private pendingOpenId = ''; // ?task=<id> from a notification, opened once tasks load

  // True while a card is being dragged, so the click that ends a drag doesn't open the card
  dragging = false;

  // "Changes requested" note asked for when a reviewer drops a card in that column
  pendingChanges: { task: Task; order: number } | null = null;
  changesNote = '';

  private unwatch?: () => void;
  private subscription?: Subscription;
  private watchingKey = '';

  constructor(
    private taskService: TaskService,
    private directory: DirectoryService,
    private org: OrgService,
    private userService: UserService,
    private messageService: MessageService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Notifications link to /board?task=<id>
    this.route.queryParamMap.subscribe((params) => {
      this.pendingOpenId = params.get('task') ?? '';
      this.openPending();
    });

    Promise.all([this.directory.getAll(), this.org.getTeams(), this.org.getProjects()])
      .then(([people, teams, projects]) => {
        this.people = people;
        this.peopleById = new Map(people.map((p) => [p.userId, p]));
        this.teams = teams;
        this.projects = projects;
        this.projectsById = new Map(projects.map((p) => [p.id!, p]));
      })
      .catch((error) => {
        console.error('Error loading board data', error);
        this.toast('error', 'Could not load people and projects', 'Please refresh the page.');
      });

    // (Re)start the live task listener once the profile is known, and if role or team change
    this.subscription = this.userService.user$.subscribe((user: UserProfile | null) => {
      if (!user?.userId) return;
      this.me = user;
      const key = `${user.userId}|${user.isAdmin}|${user.role}|${user.teamId}`;
      if (key === this.watchingKey) return;
      this.watchingKey = key;
      this.unwatch?.();
      this.unwatch = this.taskService.watch(
        user,
        (tasks) => {
          this.tasks = tasks;
          this.loading = false;
          this.rebuild();
          this.openPending();
        },
        (error) => {
          console.error('Error loading tasks', error);
          this.loading = false;
          this.toast('error', 'Could not load tasks', 'Please refresh the page.');
        }
      );
    });
  }

  ngOnDestroy() {
    this.unwatch?.();
    this.subscription?.unsubscribe();
  }

  /* ---------- Filters & columns ---------- */

  get canCreate(): boolean {
    return canCreateTasks(this.me);
  }

  get showTeamFilter(): boolean {
    return managesAll(this.me) && this.teams.length > 0;
  }

  get projectOptions() {
    return [{ label: 'All projects', value: '' }, ...this.projects.map((p) => ({ label: p.name, value: p.id! }))];
  }

  get teamOptions() {
    return [{ label: 'All teams', value: '' }, ...this.teams.map((t) => ({ label: t.name, value: t.id! }))];
  }

  readonly typeOptions = [
    { label: 'All types', value: '' },
    ...Object.entries(TASK_TYPES).map(([value, meta]) => ({ label: meta.label, value })),
  ];

  get assigneeOptions() {
    const assigned = new Set(this.tasks.flatMap((t) => t.assigneeIds));
    return [
      { label: 'Everyone', value: '' },
      { label: 'Assigned to me', value: 'me' },
      ...this.people.filter((p) => assigned.has(p.userId) && p.userId !== this.me?.userId).map((p) => ({ label: p.name, value: p.userId })),
    ];
  }

  get filtersActive(): boolean {
    return !!(this.search || this.projectFilter || this.teamFilter || this.typeFilter || this.assigneeFilter);
  }

  clearFilters() {
    this.search = this.projectFilter = this.teamFilter = this.typeFilter = this.assigneeFilter = '';
    this.rebuild();
  }

  get archivedCount(): number {
    return this.tasks.filter((t) => t.archived).length;
  }

  toggleArchived() {
    this.showArchived = !this.showArchived;
    this.rebuild();
  }

  private matches(task: Task): boolean {
    if (task.archived && !this.showArchived) return false;
    const q = this.search.trim().toLowerCase();
    if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) return false;
    if (this.projectFilter && task.projectId !== this.projectFilter) return false;
    if (this.teamFilter && !task.teamIds.includes(this.teamFilter)) return false;
    if (this.typeFilter && task.type !== this.typeFilter) return false;
    const assignee = this.assigneeFilter === 'me' ? this.me?.userId : this.assigneeFilter;
    if (assignee && !task.assigneeIds.includes(assignee)) return false;
    return true;
  }

  /** Sort tasks into their columns. Columns keep their array identity for the drop lists. */
  rebuild() {
    const visible = this.tasks.filter((t) => this.matches(t));
    for (const column of this.columns) {
      column.tasks = visible.filter((t) => t.status === column.status).sort((a, b) => a.order - b.order);
    }
  }

  get totalVisible(): number {
    return this.columns.reduce((sum, c) => sum + c.tasks.length, 0);
  }

  /* ---------- Card helpers ---------- */

  person(id: string): DirectoryEntry | undefined {
    return this.peopleById.get(id);
  }

  project(id: string): Project | undefined {
    return this.projectsById.get(id);
  }

  isOverdue(task: Task): boolean {
    return !!task.dueDate && task.status !== 'done' && task.dueDate < this.today;
  }

  checklistDone(task: Task): number {
    return task.checklist.filter((c) => c.done).length;
  }

  progress(task: Task) {
    return subtaskProgress(task);
  }

  parentTitle(task: Task): string {
    return task.parentId ? this.tasks.find((t) => t.id === task.parentId)?.title ?? 'Parent task' : '';
  }

  canDrag(task: Task): boolean {
    return canWorkOnTask(task, this.me);
  }

  /* ---------- Drag & drop ---------- */

  /** Order value for a card placed at `index` in `list` (which doesn't contain it). */
  private orderAt(list: Task[], index: number): number {
    const before = list[index - 1]?.order;
    const after = list[index]?.order;
    if (before === undefined && after === undefined) return ORDER_STEP;
    if (before === undefined) return after! - ORDER_STEP;
    if (after === undefined) return before + ORDER_STEP;
    return (before + after) / 2;
  }

  // Only allow dropping where the person may move the card, so it snaps back otherwise
  enterPredicate = (drag: CdkDrag<Task>, drop: CdkDropList<Column>) =>
    drag.data.status === drop.data.status || canMoveTask(drag.data, drop.data.status, this.me);

  async drop(event: CdkDragDrop<Column, Column, Task>) {
    const task = event.item.data;
    const target = event.container.data;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) return;

    const others = target.tasks.filter((t) => t.id !== task.id);
    const order = this.orderAt(others, event.currentIndex);

    // Requesting changes needs a note for the assignee
    if (target.status === 'changes' && task.status !== 'changes') {
      this.pendingChanges = { task, order };
      this.changesNote = task.reviewNote ?? '';
      return;
    }
    await this.moveTask(task, target.status, order, target.status === 'done' ? '' : undefined);
  }

  async confirmChanges() {
    const pending = this.pendingChanges;
    if (!pending || !this.changesNote.trim()) return;
    this.pendingChanges = null;
    await this.moveTask(pending.task, 'changes', pending.order, this.changesNote.trim());
  }

  private async moveTask(task: Task, status: TaskStatus, order: number, reviewNote?: string) {
    if (!canMoveTask(task, status, this.me)) {
      this.toast('warn', 'Only the reviewer can do that', `${task.createdByName} decides when this is done.`);
      return;
    }
    // Move it on screen straight away; the live listener confirms (or the catch restores it)
    const before = structuredClone(task);
    const previous = { status: task.status, order: task.order, reviewNote: task.reviewNote };
    Object.assign(task, { status, order }, reviewNote !== undefined ? { reviewNote } : {});
    this.rebuild();
    try {
      // Assignees may not change the review note, so only the reviewer's moves send it
      await this.taskService.move(before, status, order, reviewNote);
    } catch (error) {
      console.error('Error moving task', error);
      Object.assign(task, previous);
      this.rebuild();
      this.toast('error', 'Could not move the task', 'Please try again.');
    }
  }

  /* ---------- Dialog ---------- */

  openNew(status: TaskStatus = 'todo') {
    this.dialogTask = null;
    this.dialogParent = null;
    this.dialogStatus = status;
    this.dialogOpen = true;
  }

  /** New sub-task under `parent`; the dialog pre-fills project and due date from it. */
  openNewSubtask(parent: Task) {
    this.dialogTask = null;
    this.dialogParent = structuredClone(parent);
    this.dialogStatus = 'todo';
    this.dialogOpen = true;
  }

  openTaskById(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) this.openTask(task);
  }

  private openPending() {
    if (!this.pendingOpenId || !this.tasks.length) return;
    const task = this.tasks.find((t) => t.id === this.pendingOpenId);
    this.pendingOpenId = '';
    if (task) this.openTask(task);
    else this.toast('info', 'Task not found', 'It may have been deleted, or you no longer have access.');
    // Drop ?task so closing the dialog and refreshing doesn't reopen it
    this.router.navigate([], { relativeTo: this.route, queryParams: { task: null }, replaceUrl: true });
  }

  endDrag() {
    setTimeout(() => (this.dragging = false));
  }

  openTask(task: Task) {
    if (this.dragging) return;
    this.dialogParent = null;
    this.dialogTask = structuredClone(task);
    this.dialogOpen = true;
  }

  closeDialog() {
    this.dialogOpen = false;
    this.dialogTask = null;
    this.dialogParent = null;
  }

  /** Teams a task belongs to: the assignees' teams, or a leader's own team. */
  private teamIdsFor(assigneeIds: string[]): string[] {
    if (!managesAll(this.me)) return this.me?.teamId ? [this.me.teamId] : [];
    return [...new Set(assigneeIds.map((id) => this.peopleById.get(id)?.teamId ?? '').filter(Boolean))];
  }

  private endOrder(status: TaskStatus): number {
    const column = this.tasks.filter((t) => t.status === status);
    return column.length ? Math.max(...column.map((t) => t.order)) + ORDER_STEP : ORDER_STEP;
  }

  async onDialogSubmit(result: TaskDialogResult) {
    this.saving = true;
    try {
      if (result.kind === 'create') {
        await this.taskService.create({
          ...result.task,
          order: this.endOrder(result.task.status),
          teamIds: this.teamIdsFor(result.task.assigneeIds),
          createdBy: this.me!.userId,
          createdByName: this.me!.name,
        });
        this.toast('success', 'Task created', result.task.title);
      } else if (result.kind === 'update') {
        const original = this.tasks.find((t) => t.id === result.id)!;
        const changes = { ...result.changes };
        if (changes.assigneeIds) changes.teamIds = this.teamIdsFor(changes.assigneeIds);
        if (changes.status && changes.status !== original.status) changes.order = this.endOrder(changes.status);
        await this.taskService.update(original, changes);
        this.toast('success', 'Task saved', original.title);
      } else if (result.kind === 'archive') {
        const task = this.tasks.find((t) => t.id === result.id)!;
        await this.taskService.setArchived(task, result.archived);
        this.toast('success', result.archived ? 'Task archived' : 'Task restored', task.title);
      } else {
        const task = this.tasks.find((t) => t.id === result.id)!;
        // Sub-tasks would be left pointing at nothing (and some may belong to other teams)
        if (this.progress(task).total) {
          this.toast('warn', 'This task has sub-tasks', 'Delete or finish its sub-tasks first.');
          return;
        }
        await this.taskService.remove(task);
        this.toast('success', 'Task deleted', task.title);
      }
      this.closeDialog();
    } catch (error: any) {
      if (error?.message === HAS_WORK_LOGS) {
        this.toast('warn', 'This task has logged time', 'Archive it instead, so the hours stay in reports.');
        return;
      }
      console.error('Error saving task', error);
      this.toast('error', 'Could not save the task', 'Please try again.');
    } finally {
      this.saving = false;
    }
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
