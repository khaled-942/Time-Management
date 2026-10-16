import { Injectable, NgZone } from '@angular/core';
import { Task, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TaskActivity, TaskStatus, UserProfile, WorkLog } from '../models';
import { DirectoryService } from './directory.service';
import { NotificationService } from './notification.service';
import { must, SupabaseService, Unsubscribe, withTimestamps } from './supabase.service';
import { UserService } from './user.service';

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'subtasks'>;
export type NewWorkLog = Omit<WorkLog, 'id' | 'createdAt' | 'taskId' | 'taskTitle' | 'projectId' | 'userId' | 'userName'>;

/** Thrown by remove() for a task with logged time: archive it instead, so reports keep the hours. */
export const HAS_WORK_LOGS = 'HAS_WORK_LOGS';

const statusLabel = (status: TaskStatus) => TASK_STATUSES.find((s) => s.value === status)?.label ?? status;

/** Board link that opens the task's dialog. */
export const taskLink = (id: string) => `/board?task=${id}`;

const taskFromRow = (row: any): Task => withTimestamps<Task>(row, ['createdAt', 'updatedAt']);
const logFromRow = (row: any): WorkLog => withTimestamps<WorkLog>(row, ['createdAt']);

// Team tasks (tasks), kept live with Supabase Realtime. Every write goes through here so the side
// effects stay in one place: sub-task progress on the parent, the parent moving to Need review
// when all its sub-tasks are done, bell notifications, and the task's activity log
// (task_activity). Time spent on tasks lives in work_logs.
@Injectable({
  providedIn: 'root',
})
export class TaskService {
  constructor(
    private supabase: SupabaseService,
    private zone: NgZone,
    private notifications: NotificationService,
    private userService: UserService,
    private directory: DirectoryService
  ) { }

  // Names for activity lines ("assigned Aya"), loaded once
  private names?: Promise<Map<string, string>>;

  private nameOf(ids: string[]): Promise<string> {
    this.names ??= this.directory
      .getAll()
      .then((people) => new Map(people.map((p) => [p.userId, p.name])))
      .catch(() => new Map<string, string>());
    return this.names.then((names) => ids.map((id) => names.get(id) ?? 'someone').join(', '));
  }

  private get db() {
    return this.supabase.client;
  }

  private get uid(): string {
    return this.supabase.uid;
  }

  private get myName(): string {
    return this.userService.current?.name ?? 'Someone';
  }

  /**
   * Live list of the tasks `me` may see. PMs and admins read everything; others read their
   * team's tasks plus anything they're assigned to or created. Row-level security (mirroring
   * task-access.ts) does the filtering, so one query covers every case.
   */
  watch(_me: UserProfile, onChange: (tasks: Task[]) => void, onError: (error: unknown) => void): Unsubscribe {
    return this.supabase.watch(
      'tasks',
      async () => {
        const rows = must(await this.db.from('tasks').select('*'));
        this.zone.run(() => onChange(rows.map(taskFromRow)));
      },
      onError
    );
  }

  /* ---------- Writes ---------- */

  async create(task: NewTask): Promise<string> {
    const id: string = must(await this.db.from('tasks').insert(task).select('id').single()).id;
    const created: Task = { ...task, id };
    await Promise.all([
      task.parentId ? this.syncParent(task.parentId, id, task.status === 'done') : null,
      this.notifyAssigned(created, task.assigneeIds),
      this.record(id, 'pi pi-plus-circle', `created the task in ${statusLabel(task.status)}`),
      task.assigneeIds.length
        ? this.nameOf(task.assigneeIds).then((names) => this.record(id, 'pi pi-user-plus', `assigned ${names}`))
        : null,
      task.parentId ? this.record(task.parentId, 'pi pi-sitemap', `added the sub-task "${task.title}"`) : null,
    ]);
    return id;
  }

  /** Save `changes` to `before` (the task as it was) and run the side effects of what changed. */
  async update(before: Task, changes: Partial<NewTask>) {
    must(await this.db.from('tasks').update({ ...changes, updatedAt: new Date().toISOString() }).eq('id', before.id!));
    const after: Task = { ...before, ...changes };

    const effects: Promise<unknown>[] = [this.recordChanges(before, changes)];
    if (changes.assigneeIds) {
      const added = changes.assigneeIds.filter((id) => !before.assigneeIds.includes(id));
      effects.push(this.notifyAssigned(after, added));
    }
    if (changes.status && changes.status !== before.status) {
      effects.push(this.notifyStatus(after, before.status));
      const wasDone = before.status === 'done';
      const isDone = changes.status === 'done';
      if (after.parentId && wasDone !== isDone) effects.push(this.syncParent(after.parentId, after.id!, isDone));
    }
    // Side effects are best-effort: the task itself is saved
    await Promise.all(effects.map((p) => p.catch((error) => console.error('Task side effect failed:', error))));
  }

  /** Move a card on the board. Requesting changes also records the reviewer's note. */
  async move(before: Task, status: TaskStatus, order: number, reviewNote?: string) {
    await this.update(before, { status, order, ...(reviewNote !== undefined ? { reviewNote } : {}) });
  }

  /** Archive (or restore) a task; archived tasks leave the board but keep their history and time. */
  async setArchived(before: Task, archived: boolean) {
    await this.update(before, { archived, archivedByName: archived ? this.myName : '' });
  }

  async remove(task: Task) {
    const logs = must(await this.db.from('work_logs').select('id').eq('taskId', task.id!).limit(1));
    if (logs.length) throw new Error(HAS_WORK_LOGS);
    // History goes with the task (on delete cascade)
    must(await this.db.from('tasks').delete().eq('id', task.id!));
    if (task.parentId) {
      await this.syncParent(task.parentId, task.id!, null).catch((error) =>
        console.error('Could not update the parent task:', error)
      );
    }
  }

  /* ---------- Sub-tasks ---------- */

  /**
   * Record a sub-task's state on its parent (`done` null = removed), atomically in the database
   * (sync_parent). When every sub-task is done, the parent moves to Need review and its reviewer is told.
   */
  private async syncParent(parentId: string, subtaskId: string, done: boolean | null) {
    const rows: any[] = must(await this.db.rpc('sync_parent', { parent_id: parentId, subtask_id: subtaskId, done }));
    const movedToReview = rows?.[0] ? taskFromRow(rows[0]) : null;

    if (movedToReview) {
      await this.record(parentId, 'pi pi-check-circle', 'finished the last sub-task, so it moved to Need review');
      await this.notify(
        movedToReview.createdBy,
        'Ready for your review',
        `All sub-tasks of "${movedToReview.title}" are done, so it moved to Need review.`,
        movedToReview.id!,
        'pi pi-check-circle'
      );
    }
  }

  /* ---------- Work logs ---------- */

  /** Live list of the time logged on a task, newest first. */
  watchWorkLogs(taskId: string, onChange: (logs: WorkLog[]) => void, onError: (error: unknown) => void): Unsubscribe {
    return this.supabase.watch(
      'work_logs',
      async () => {
        const rows = must(await this.db.from('work_logs').select('*').eq('taskId', taskId).order('date', { ascending: false }));
        this.zone.run(() => onChange(rows.map(logFromRow)));
      },
      (error) => this.zone.run(() => onError(error))
    );
  }

  /** Log time on `task` as the signed-in person. */
  async logTime(task: Task, log: NewWorkLog) {
    must(
      await this.db.from('work_logs').insert({
        ...log,
        taskId: task.id!,
        taskTitle: task.title,
        projectId: task.projectId,
        userId: this.uid,
        userName: this.myName,
      })
    );
    await this.record(task.id!, 'pi pi-clock', `logged ${log.hours}h on ${log.date}${log.kind ? ` (${log.kind})` : ''}`);
  }

  async deleteTimeLog(task: Task, log: WorkLog) {
    must(await this.db.from('work_logs').delete().eq('id', log.id!));
    const whose = log.userId === this.uid ? 'their' : `${log.userName}'s`;
    await this.record(task.id!, 'pi pi-trash', `removed ${whose} ${log.hours}h on ${log.date}`);
  }

  /** The signed-in person's logs from `from` to `to` (YYYY-MM-DD, inclusive) across all tasks. */
  async myWorkLogs(from: string, to: string): Promise<WorkLog[]> {
    const rows = must(
      await this.db.from('work_logs').select('*').eq('userId', this.uid).gte('date', from).lte('date', to)
    );
    return rows.map(logFromRow);
  }

  /* ---------- Activity ---------- */

  /** Live history of a task, newest first. */
  watchActivity(taskId: string, onChange: (entries: TaskActivity[]) => void, onError: (error: unknown) => void): Unsubscribe {
    return this.supabase.watch(
      'task_activity',
      async () => {
        const rows = must(
          await this.db.from('task_activity').select('*').eq('taskId', taskId).order('at', { ascending: false }).limit(200)
        );
        this.zone.run(() => onChange(rows.map((r) => withTimestamps<TaskActivity>(r, ['at']))));
      },
      (error) => this.zone.run(() => onError(error))
    );
  }

  /** Add a line to a task's history. Best-effort: the change itself is already saved. */
  private record(taskId: string, icon: string, text: string): Promise<void> {
    return Promise.resolve(
      this.db.from('task_activity').insert({ taskId, by: this.uid, byName: this.myName, icon, text: text.slice(0, 500) })
    )
      .then(must)
      .then(() => undefined)
      .catch((error) => console.error('Could not record task activity:', error));
  }

  /** One history line per kind of change. */
  private async recordChanges(before: Task, changes: Partial<NewTask>) {
    const id = before.id!;
    const lines: [string, string][] = [];
    const changed = (key: keyof NewTask) => key in changes && JSON.stringify(changes[key]) !== JSON.stringify(before[key]);

    if (changed('archived')) {
      lines.push(changes.archived ? ['pi pi-inbox', 'archived the task'] : ['pi pi-replay', 'restored the task from the archive']);
    }
    if (changed('status')) {
      const to = changes.status!;
      if (to === 'changes') lines.push(['pi pi-comments', `requested changes: ${changes.reviewNote ?? before.reviewNote}`]);
      else if (to === 'done') lines.push(['pi pi-check-circle', 'approved it and marked it Done']);
      else lines.push(['pi pi-arrow-right', `moved it from ${statusLabel(before.status)} to ${statusLabel(to)}`]);
    }
    if (changed('assigneeIds')) {
      const added = changes.assigneeIds!.filter((a) => !before.assigneeIds.includes(a));
      const removed = before.assigneeIds.filter((a) => !changes.assigneeIds!.includes(a));
      if (added.length) lines.push(['pi pi-user-plus', `assigned ${await this.nameOf(added)}`]);
      if (removed.length) lines.push(['pi pi-user-minus', `unassigned ${await this.nameOf(removed)}`]);
    }
    if (changed('title')) lines.push(['pi pi-pencil', `renamed it from "${before.title}" to "${changes.title}"`]);
    if (changed('description')) lines.push(['pi pi-align-left', 'edited the description']);
    if (changed('type')) lines.push(['pi pi-tag', `changed the type to ${TASK_TYPES[changes.type!].label}`]);
    if (changed('priority')) lines.push(['pi pi-flag', `changed the priority to ${TASK_PRIORITIES[changes.priority!].label}`]);
    if (changed('projectId')) lines.push(['pi pi-briefcase', changes.projectId ? 'moved it to another project' : 'removed the project']);
    if (changed('dueDate')) lines.push(['pi pi-calendar', changes.dueDate ? `set the due date to ${changes.dueDate}` : 'removed the due date']);
    if (changed('estimateHours')) {
      lines.push(['pi pi-stopwatch', changes.estimateHours != null ? `set the estimate to ${changes.estimateHours}h` : 'removed the estimate']);
    }
    if (changed('links')) lines.push(['pi pi-link', 'updated the links']);
    if (changed('checklist')) {
      const after = changes.checklist!;
      const wasDone = (text: string) => before.checklist.some((b) => b.text === text && b.done);
      after.filter((c) => c.done && !wasDone(c.text)).forEach((c) => lines.push(['pi pi-check-square', `ticked "${c.text}"`]));
      after.filter((c) => !c.done && wasDone(c.text)).forEach((c) => lines.push(['pi pi-stop', `unticked "${c.text}"`]));
      const sameItems =
        after.length === before.checklist.length && after.every((c) => before.checklist.some((b) => b.text === c.text));
      if (!sameItems) lines.push(['pi pi-list', 'edited the checklist']);
    }
    if (changed('reviewNote') && changes.reviewNote && !changed('status')) {
      lines.push(['pi pi-comments', `updated the review note: ${changes.reviewNote}`]);
    }
    await Promise.all(lines.map(([icon, text]) => this.record(id, icon, text)));
  }

  /* ---------- Notifications ---------- */

  private notify(userId: string, title: string, body: string, taskId: string, icon: string) {
    if (!userId || userId === this.uid) return Promise.resolve();
    return this.notifications.notifyUser(userId, title, body, taskLink(taskId), icon);
  }

  private notifyAssigned(task: Task, userIds: string[]) {
    return Promise.all(
      userIds.map((id) =>
        this.notify(id, 'New task for you', `${this.myName} assigned you "${task.title}".`, task.id!, 'pi pi-objects-column')
      )
    );
  }

  private notifyStatus(task: Task, from: TaskStatus) {
    switch (task.status) {
      case 'review':
        return this.notify(task.createdBy, 'Needs your review', `${this.myName} moved "${task.title}" to Need review.`, task.id!, 'pi pi-eye');
      case 'changes':
        return Promise.all(
          task.assigneeIds.map((id) =>
            this.notify(id, 'Changes requested', `"${task.title}": ${task.reviewNote || 'see the task for details.'}`, task.id!, 'pi pi-comments')
          )
        );
      case 'done':
        return Promise.all(
          task.assigneeIds.map((id) =>
            this.notify(id, 'Task approved', `${this.myName} marked "${task.title}" as done.`, task.id!, 'pi pi-check-circle')
          )
        );
      default:
        // Reopening a finished task is worth knowing about; ordinary moves aren't
        return from === 'done'
          ? Promise.all(
              task.assigneeIds.map((id) =>
                this.notify(id, 'Task reopened', `"${task.title}" moved back to ${statusLabel(task.status)}.`, task.id!, 'pi pi-replay')
              )
            )
          : Promise.resolve();
    }
  }
}
