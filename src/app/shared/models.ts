// Shapes of the database rows the app reads and writes (supabase/migrations).

/** users/{uid}/days/{YYYY-MM-DD} */
export interface DayRecord {
  id?: string;
  title?: string;
  start: string; // YYYY-MM-DD
  in?: string; // YYYY-MM-DDTHH:mm (local)
  out?: string; // missing while checked in
  isDayOff: boolean;
  dayOffType?: DayOffType;
  isLate?: boolean;
  isEarlyLeave?: boolean;
  lateExcuse?: boolean;
  earlyLeaveExcuse?: boolean;
  leaveRequestId?: string;
}

export enum DayOffType {
  Paid = 0,
  Absent = -1,
  Task = 1,
}

/** users/{uid} */
export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  currentAvatar?: string;
  isAdmin?: boolean;
  active?: boolean; // missing means active
  role?: Role; // missing means member; set by an admin
  teamId?: string; // teams/{id}; set by an admin
  salary?: number; // legacy: now in users/{uid}/private/salary
  position?: string;
  phone?: string;
  verified?: boolean;
  [key: string]: any;
}

/** One role per person; admins (isAdmin) are separate and can hold any role. */
export type Role = 'pm' | 'leader' | 'member';

export const ROLE_LABELS: Record<Role, string> = {
  pm: 'Project Manager',
  leader: 'Team Leader',
  member: 'Member',
};

export function roleOf(user: Partial<UserProfile> | null | undefined): Role {
  return user?.role ?? 'member';
}

/**
 * directory/{uid}: the public part of a profile, readable by every signed-in person (users/{uid}
 * itself stays private). Kept in sync by DirectoryService; role/teamId/active must match users/{uid}.
 */
export interface DirectoryEntry {
  userId: string;
  name: string;
  avatar: string;
  role: Role;
  teamId: string;
  active: boolean;
}

/** teams/{id}: one leader (users with role 'leader' and this teamId), members share the teamId */
export interface Team {
  id?: string;
  name: string;
  leaderId: string; // '' until a leader is chosen
  createdAt?: any;
}

/** projects/{id}: shared by the private tracker and team tasks */
export interface Project {
  id?: string;
  name: string;
  client: string;
  color: string; // hex, picked from PROJECT_COLORS
  active: boolean;
  createdBy: string;
  createdAt?: any;
}

/** users/{uid}/timeEntries/{id}: private task log, readable only by its owner (not even admins) */
export interface TimeEntry {
  id?: string;
  title: string;
  projectId: string; // '' for no project
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm, '' while the timer is running
  note: string;
  createdAt?: any;
  updatedAt?: any;
}

/** Suggestions for WorkLog.kind; any text is allowed. */
export const WORK_KINDS = ['creation', 'comments', 'review', 'revision', 'testing', 'meeting'];

/* ---------- Team tasks (tasks/{id}) ---------- */

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'changes' | 'done';
export type TaskType = 'feature' | 'bug' | 'review_fixes' | 'chore';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Board columns, in order. Assignees may move tasks between the first four; only the reviewer sets the last two. */
export const TASK_STATUSES: { value: TaskStatus; label: string; reviewerOnly?: boolean }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Need review' },
  { value: 'changes', label: 'Changes requested', reviewerOnly: true },
  { value: 'done', label: 'Done', reviewerOnly: true },
];

export const TASK_TYPES: Record<TaskType, { label: string; icon: string; tone: string }> = {
  feature: { label: 'Feature', icon: 'pi pi-sparkles', tone: 'info' },
  bug: { label: 'Bug', icon: 'pi pi-exclamation-circle', tone: 'danger' },
  review_fixes: { label: 'Review fixes', icon: 'pi pi-comments', tone: 'warning' },
  chore: { label: 'Chore', icon: 'pi pi-wrench', tone: '' },
};

export const TASK_PRIORITIES: Record<TaskPriority, { label: string; icon: string; tone: string }> = {
  low: { label: 'Low', icon: 'pi pi-arrow-down', tone: '' },
  medium: { label: 'Medium', icon: 'pi pi-equals', tone: 'info' },
  high: { label: 'High', icon: 'pi pi-arrow-up', tone: 'warning' },
  urgent: { label: 'Urgent', icon: 'pi pi-angle-double-up', tone: 'danger' },
};

export interface TaskLink {
  label: string; // e.g. "PR #42", "Figma"
  url: string;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

/**
 * tasks/{id}. Visible to admins and PMs, to everyone in `teamIds`, and to the assignees.
 * The creator is the reviewer: only they (or a PM/admin) can mark it Done or request changes.
 */
export interface Task {
  id?: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  order: number; // position inside its column, ascending
  projectId: string; // '' for no project
  assigneeIds: string[];
  teamIds: string[]; // teams of the assignees (or the leader's own team); drives who can see it
  parentId: string; // '' for top-level tasks; sub-tasks point at their parent
  createdBy: string;
  createdByName: string;
  dueDate: string; // YYYY-MM-DD or ''
  estimateHours: number | null;
  links: TaskLink[];
  checklist: ChecklistItem[];
  reviewNote: string; // set by the reviewer when requesting changes
  /**
   * On a parent: one entry per sub-task, true once it's Done. Lets everyone see progress even
   * when they can't see every sub-task (sub-tasks of other teams). Kept by TaskService.
   */
  subtasks?: Record<string, boolean>;
  /** Archived tasks leave the board (a toggle shows them); only the reviewer, PMs and admins archive. */
  archived?: boolean;
  archivedByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * tasks/{taskId}/workLogs/{id}: time someone spent on a task. Feeds the monthly production
 * report, so the task's title and project are copied in (the report reads logs on their own).
 */
export interface WorkLog {
  id?: string;
  taskId: string;
  taskTitle: string; // the report's "Sub-Project"
  projectId: string; // '' for no project
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  hours: number; // > 0, up to 24
  country: string;
  kind: string; // kind of work, e.g. "creation", "comments"
  pages: string; // page numbers, one per line
  note: string;
  createdAt?: any;
}

/** tasks/{taskId}/activity/{id}: one line of a task's history; written by TaskService, never edited. */
export interface TaskActivity {
  id?: string;
  by: string;
  byName: string;
  icon: string; // PrimeIcons class
  text: string; // e.g. 'moved it from To do to In progress'
  at?: any;
}

/** Project colours: fixed swatches that read on both themes. */
export const PROJECT_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#64748b'];

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** leaveRequests/{id} */
export interface LeaveRequest {
  id?: string;
  userId: string;
  userName: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
  days: number; // working days in the range
  reason: string;
  status: LeaveStatus;
  createdAt: any;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: any;
  decisionNote?: string;
}

/** notifications/{id}: either for one user (userId) or for every admin (audience) */
export interface AppNotification {
  id?: string;
  userId: string; // '' for admin notifications
  audience: 'admins' | ''; // '' for personal notifications
  title: string;
  body: string;
  link?: string;
  icon?: string;
  createdAt: any;
  createdBy: string;
  readBy: string[];
}

/** auditLog/{id} */
export interface AuditEntry {
  id?: string;
  ownerId: string; // whose day changed
  dayId: string;
  changedBy: string;
  changedByName: string;
  at: any;
  before: Partial<DayRecord> | null;
  after: Partial<DayRecord>;
}

/** lockedPeriods/{periodKey} */
export interface PeriodLock {
  key: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: any;
}
