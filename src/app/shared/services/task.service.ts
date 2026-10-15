import { Injectable, NgZone } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  Firestore,
  onSnapshot,
  query,
  Query,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Task, TASK_STATUSES, TaskStatus, UserProfile } from '../models';
import { managesAll } from '../utils/task-access';
import { NotificationService } from './notification.service';
import { UserService } from './user.service';

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'subtasks'>;

const statusLabel = (status: TaskStatus) => TASK_STATUSES.find((s) => s.value === status)?.label ?? status;

/** Board link that opens the task's dialog. */
export const taskLink = (id: string) => `/board?task=${id}`;

// Team tasks (tasks/{id}), kept live with Firestore listeners. Every write goes through here so
// the side effects stay in one place: sub-task progress on the parent, the parent moving to
// Need review when all its sub-tasks are done, and bell notifications.
@Injectable({
  providedIn: 'root',
})
export class TaskService {
  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private zone: NgZone,
    private notifications: NotificationService,
    private userService: UserService
  ) { }

  private get tasks() {
    return collection(this.firestore, 'tasks');
  }

  private get uid(): string {
    return this.auth.currentUser?.uid ?? '';
  }

  private get myName(): string {
    return this.userService.current?.name ?? 'Someone';
  }

  /**
   * Live list of the tasks `me` may see. PMs and admins read everything; others read their
   * team's tasks plus anything they're assigned to or created. Each query matches a branch of
   * the read rule in firestore.rules, so Firestore can authorise it.
   */
  watch(me: UserProfile, onChange: (tasks: Task[]) => void, onError: (error: unknown) => void): Unsubscribe {
    const queries: Query[] = managesAll(me)
      ? [this.tasks]
      : [
          ...(me.teamId ? [query(this.tasks, where('teamIds', 'array-contains', me.teamId))] : []),
          query(this.tasks, where('assigneeIds', 'array-contains', me.userId)),
          query(this.tasks, where('createdBy', '==', me.userId)),
        ];

    const results: Task[][] = queries.map(() => []);
    const listeners = queries.map((q, i) =>
      onSnapshot(
        q,
        (snapshot) => {
          results[i] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Task) }));
          // The same task can match several queries
          const merged = new Map(results.flat().map((t) => [t.id!, t]));
          this.zone.run(() => onChange([...merged.values()]));
        },
        (error) => this.zone.run(() => onError(error))
      )
    );
    return () => listeners.forEach((unsubscribe) => unsubscribe());
  }

  /* ---------- Writes ---------- */

  async create(task: NewTask): Promise<string> {
    const ref = await addDoc(this.tasks, { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const created: Task = { ...task, id: ref.id };
    await Promise.all([
      task.parentId ? this.syncParent(task.parentId, ref.id, task.status === 'done') : null,
      this.notifyAssigned(created, task.assigneeIds),
    ]);
    return ref.id;
  }

  /** Save `changes` to `before` (the task as it was) and run the side effects of what changed. */
  async update(before: Task, changes: Partial<NewTask>) {
    await updateDoc(doc(this.tasks, before.id!), { ...changes, updatedAt: serverTimestamp() });
    const after: Task = { ...before, ...changes };

    const effects: Promise<unknown>[] = [];
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

  async remove(task: Task) {
    await deleteDoc(doc(this.tasks, task.id!));
    if (task.parentId) {
      await this.syncParent(task.parentId, task.id!, null).catch((error) =>
        console.error('Could not update the parent task:', error)
      );
    }
  }

  /* ---------- Sub-tasks ---------- */

  /**
   * Record a sub-task's state on its parent (`done` null = removed). When every sub-task is
   * done, the parent moves to Need review and its reviewer is told.
   */
  private async syncParent(parentId: string, subtaskId: string, done: boolean | null) {
    const parentRef = doc(this.tasks, parentId);
    const movedToReview = await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(parentRef);
      if (!snapshot.exists()) return null;
      const parent = { id: snapshot.id, ...(snapshot.data() as Task) };

      const subtasks = { ...(parent.subtasks ?? {}) };
      if (done === null) delete subtasks[subtaskId];
      else subtasks[subtaskId] = done;

      const states = Object.values(subtasks);
      const allDone = states.length > 0 && states.every(Boolean);
      const shouldReview = allDone && !['review', 'done'].includes(parent.status);

      tx.update(parentRef, {
        [`subtasks.${subtaskId}`]: done === null ? deleteField() : done,
        // Date.now() sorts after the board's usual values, so the parent lands at the end of Need review
        ...(shouldReview ? { status: 'review', order: Date.now() } : {}),
        updatedAt: serverTimestamp(),
      });
      return shouldReview ? parent : null;
    });

    if (movedToReview) {
      await this.notify(
        movedToReview.createdBy,
        'Ready for your review',
        `All sub-tasks of "${movedToReview.title}" are done, so it moved to Need review.`,
        movedToReview.id!,
        'pi pi-check-circle'
      );
    }
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
