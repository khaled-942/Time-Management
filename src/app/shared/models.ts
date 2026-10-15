// Shapes of the Firestore documents the app reads and writes.

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
