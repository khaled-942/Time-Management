import { DayOffType, DayRecord } from '../models';

export type DayStatusKey = 'worked' | 'late' | 'early' | 'excused' | 'absent' | 'leave' | 'task' | 'open';

export interface DayStatus {
  key: DayStatusKey;
  label: string;
  /** Pill variant from styles.scss */
  tone: 'success' | 'warning' | 'danger' | 'info' | '';
}

const STATUS: Record<DayStatusKey, DayStatus> = {
  worked: { key: 'worked', label: 'Worked', tone: 'success' },
  late: { key: 'late', label: 'Late', tone: 'warning' },
  early: { key: 'early', label: 'Early leave', tone: 'warning' },
  excused: { key: 'excused', label: 'Excused', tone: 'info' },
  absent: { key: 'absent', label: 'Absent', tone: 'danger' },
  leave: { key: 'leave', label: 'Paid leave', tone: 'success' },
  task: { key: 'task', label: 'Task', tone: 'info' },
  open: { key: 'open', label: 'Checked in', tone: '' },
};

/** Legend order used by the calendar and dashboard. */
export const STATUS_LEGEND: DayStatus[] = ['worked', 'late', 'early', 'excused', 'absent', 'leave', 'task', 'open'].map(
  (k) => STATUS[k as DayStatusKey]
);

export function dayStatus(day: Partial<DayRecord>): DayStatus {
  if (day.isDayOff) {
    if (day.dayOffType === DayOffType.Absent) return STATUS.absent;
    if (day.dayOffType === DayOffType.Task) return STATUS.task;
    return STATUS.leave;
  }
  if (day.in && !day.out) return STATUS.open;
  if (day.lateExcuse || day.earlyLeaveExcuse) return STATUS.excused;
  if (day.isLate) return STATUS.late;
  if (day.isEarlyLeave) return STATUS.early;
  return STATUS.worked;
}

/** "HH:mm" part of a stored "YYYY-MM-DDTHH:mm" value. */
export function timePart(value?: string): string {
  return value?.split('T')[1]?.slice(0, 5) ?? '';
}
