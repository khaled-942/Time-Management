// Shared working-time rules used by the calendar, dashboard and salary calculation.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// From 1 April 2025 the short working day moved from Thursday to Saturday.
const SATURDAY_SHORT_DAY_FROM = new Date(2025, 3, 1);

export const WORK_START = { hours: 9, minutes: 0 };
const NORMAL_END = { hours: 17, minutes: 0 };
const SHORT_END = { hours: 13, minutes: 30 };

const pad = (n: number) => String(n).padStart(2, '0');

// Parse a "YYYY-MM-DD" (optionally followed by "T...") string as a local date at midnight.
// `new Date("YYYY-MM-DD")` would parse it as UTC midnight, which shifts the day in some timezones.
export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [y, m, d] = value.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

export function isShortDay(date: Date): boolean {
  const day = parseLocalDate(date);
  return day >= SATURDAY_SHORT_DAY_FROM ? day.getDay() === 6 : day.getDay() === 4;
}

export function scheduledEnd(date: Date): { hours: number; minutes: number } {
  return isShortDay(date) ? SHORT_END : NORMAL_END;
}

// Length of the scheduled working day in milliseconds (8h, or 4.5h on the short day).
export function workingDayMs(date: Date): number {
  const end = scheduledEnd(date);
  return ((end.hours - WORK_START.hours) * 60 + (end.minutes - WORK_START.minutes)) * 60 * 1000;
}

export interface ReportingPeriod {
  /** Period is named after the month containing its end date (the 10th). */
  monthIndex: number;
  year: number;
  /** Inclusive bounds as "YYYY-MM-DD" strings, matching the `start` field of day documents. */
  startStr: string;
  endStr: string;
  /** Local midnight of the 11th, and the last millisecond of the 10th. */
  start: Date;
  end: Date;
}

// Reporting periods run from the 11th of one month to the 10th of the next.
export function periodEndingIn(year: number, monthIndex: number): ReportingPeriod {
  const start = new Date(year, monthIndex - 1, 11);
  const endDay = new Date(year, monthIndex, 10);
  const end = new Date(year, monthIndex, 10, 23, 59, 59, 999);
  return {
    monthIndex: endDay.getMonth(),
    year: endDay.getFullYear(),
    startStr: toDateString(start),
    endStr: toDateString(endDay),
    start,
    end,
  };
}

export function periodContaining(date: Date): ReportingPeriod {
  const monthOffset = date.getDate() > 10 ? 1 : 0;
  const end = new Date(date.getFullYear(), date.getMonth() + monthOffset, 10);
  return periodEndingIn(end.getFullYear(), end.getMonth());
}

/** Stable id of a period, e.g. "2026-11" for Oct 11 → Nov 10, 2026. */
export function periodKey(period: ReportingPeriod): string {
  return `${period.year}-${pad(period.monthIndex + 1)}`;
}

export function periodFromKey(key: string): ReportingPeriod {
  const [y, m] = key.split('-').map(Number);
  return periodEndingIn(y, m - 1);
}

export function periodKeyOfDay(day: string): string {
  return periodKey(periodContaining(parseLocalDate(day)));
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Nov 2026 · Oct 11 – Nov 10" */
export function periodLabel(period: ReportingPeriod): string {
  const start = period.start;
  return `${SHORT_MONTHS[period.monthIndex]} ${period.year} · ${SHORT_MONTHS[start.getMonth()]} 11 – ${SHORT_MONTHS[period.monthIndex]} 10`;
}

/** The current period and the `count - 1` before it, newest first. */
export function recentPeriods(count: number, today: Date = new Date()): ReportingPeriod[] {
  const current = periodContaining(today);
  const periods: ReportingPeriod[] = [];
  for (let i = 0; i < count; i++) {
    periods.push(periodEndingIn(current.year, current.monthIndex - i));
  }
  return periods;
}

/** Every date from start to end (inclusive) as "YYYY-MM-DD". */
export function daysBetween(startStr: string, endStr: string): string[] {
  const days: string[] = [];
  const end = parseLocalDate(endStr);
  for (let d = parseLocalDate(startStr); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toDateString(d));
  }
  return days;
}

/** Working days in the range: every day except Fridays and the given holidays. */
export function workingDaysBetween(startStr: string, endStr: string, holidays: string[] = []): string[] {
  const holidaySet = new Set(holidays);
  return daysBetween(startStr, endStr).filter((day) => !isFriday(parseLocalDate(day)) && !holidaySet.has(day));
}

export function nowTimeString(date: Date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The most recent period (current or past) whose end falls in the given month.
export function latestPeriodForMonth(monthIndex: number, today: Date = new Date()): ReportingPeriod {
  const current = periodContaining(today);
  const year = monthIndex <= current.monthIndex ? current.year : current.year - 1;
  return periodEndingIn(year, monthIndex);
}
