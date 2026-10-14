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

// The most recent period (current or past) whose end falls in the given month.
export function latestPeriodForMonth(monthIndex: number, today: Date = new Date()): ReportingPeriod {
  const current = periodContaining(today);
  const year = monthIndex <= current.monthIndex ? current.year : current.year - 1;
  return periodEndingIn(year, monthIndex);
}
