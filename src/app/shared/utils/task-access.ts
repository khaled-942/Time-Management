import { roleOf, Task, TASK_STATUSES, TaskStatus, UserProfile } from '../models';

// Who may do what with team tasks. firestore.rules enforces the same rules; keep them in step.

/** Admins and project managers manage every task. */
export function managesAll(me: UserProfile | null): boolean {
  return !!me && (!!me.isAdmin || roleOf(me) === 'pm');
}

/** PMs and admins create tasks for anyone; team leaders for their own team. Members can't create. */
export function canCreateTasks(me: UserProfile | null): boolean {
  return managesAll(me) || (roleOf(me) === 'leader' && !!me?.teamId);
}

/** The reviewer is the task's creator; PMs and admins can act as reviewer on any task. */
export function isReviewer(task: Task, me: UserProfile | null): boolean {
  return !!me && (managesAll(me) || task.createdBy === me.userId);
}

/** Full edit (title, assignees, dates, delete…) belongs to the reviewer. */
export function canEditTask(task: Task, me: UserProfile | null): boolean {
  return isReviewer(task, me);
}

export function isAssignee(task: Task, me: UserProfile | null): boolean {
  return !!me && task.assigneeIds.includes(me.userId);
}

/**
 * Moving a card to `status`. Assignees move their own unfinished tasks between Backlog and
 * Need review; Done and Changes requested are the reviewer's call.
 */
export function canMoveTask(task: Task, status: TaskStatus, me: UserProfile | null): boolean {
  if (isReviewer(task, me)) return true;
  if (!isAssignee(task, me) || task.status === 'done') return false;
  return !TASK_STATUSES.find((s) => s.value === status)?.reviewerOnly;
}

/** Assignees can also tick checklist items on their unfinished tasks. */
export function canWorkOnTask(task: Task, me: UserProfile | null): boolean {
  return isReviewer(task, me) || (isAssignee(task, me) && task.status !== 'done');
}

/** Breaking a task into sub-tasks: whoever runs it (PM/admin, its creator or a leader assigned to it). */
export function canAddSubtask(parent: Task, me: UserProfile | null): boolean {
  return !parent.parentId && canCreateTasks(me) && (isReviewer(parent, me) || isAssignee(parent, me));
}

/** Sub-task progress recorded on a parent. */
export function subtaskProgress(task: Task): { done: number; total: number } {
  const states = Object.values(task.subtasks ?? {});
  return { done: states.filter(Boolean).length, total: states.length };
}
