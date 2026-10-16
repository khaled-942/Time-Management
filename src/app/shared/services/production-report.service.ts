import { Injectable } from '@angular/core';
import { DayOffType, DayRecord, Project, UserProfile, WorkLog } from '../models';
import { maybe, must, SupabaseService } from './supabase.service';
import { HttpRequestsService } from './http-requests.service';
import { OrgService } from './org.service';
import { TaskService } from './task.service';
import { daysBetween, isFriday, MONTHS, parseLocalDate, toDateString } from '../utils/work-schedule';
import { downloadBlob } from '../utils/format';

// Monthly production report: what was worked on each day of a calendar month (1st → last day,
// unlike the 11th → 10th payroll period), built from the time people log on board tasks
// (work_logs) plus attendance days and holidays. Exported as Word (day by day) and
// Excel (project × day grid), matching the paper reports people used to fill in by hand.

/** Where the first version kept the settings, before they moved to the database. */
const LEGACY_SETTINGS_KEY = 'productionReportSettings';

/** Day of the month the report is due (or the month's last day when it's shorter). */
export const REPORT_DUE_DAY = 30;

/** Printed colours (fixed: these are documents, not themed UI). */
const FILL = {
  header: 'D9E2F3',
  band: 'A7C7E7', // main assignment ("Oman" in the old reports)
  friday: 'F4B6D2',
  off: '000000',
  holiday: 'D9D9D9',
};

export interface ReportMonth {
  year: number;
  monthIndex: number;
}

/** A main assignment, shown as a band under every working day from `start` to `end`. */
export interface ReportAssignment {
  label: string; // e.g. "Oman"
  start: string; // YYYY-MM-DD, '' = from the beginning
  end: string; // YYYY-MM-DD, '' = still going
}

/** user_private (report columns): the person's own report details, the same for every month. */
export interface ReportSettings {
  organization: string;
  department: string;
  assignments: ReportAssignment[];
}

export interface ReportLine {
  country: string;
  project: string;
  projectColor: string;
  subProject: string; // the task's title
  kind: string;
  pages: string[];
  hours: number;
}

export type ReportDayKind = 'work' | 'friday' | 'holiday' | 'off';

export interface ReportDay {
  date: string; // YYYY-MM-DD
  label: string; // DD/MM/YYYY
  weekday: string;
  kind: ReportDayKind;
  /** Text of the band under the day's lines: holiday name, "Off", the main assignment or ''. */
  band: string;
  lines: ReportLine[];
  hours: number;
}

/** One Excel row: a sub-project on a project in a country, with its hours on each day. */
export interface ReportGridRow {
  project: string;
  subProject: string;
  country: string;
  hours: number[]; // index = day of month - 1
  total: number;
}

export interface ProductionReport {
  month: ReportMonth;
  monthLabel: string; // "February 2025"
  dueDate: string; // YYYY-MM-DD
  name: string;
  position: string;
  settings: ReportSettings;
  days: ReportDay[];
  grid: ReportGridRow[];
  byProject: { name: string; color: string; hours: number }[];
  totalHours: number;
  logCount: number;
  /** Working days up to today with a check-in but no time logged on any task. */
  unloggedDays: string[];
}

export function reportMonthOf(date: Date): ReportMonth {
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function reportMonthKey(month: ReportMonth): string {
  return `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}`;
}

export function reportMonthFromKey(key: string): ReportMonth {
  const [year, month] = key.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

export function reportMonthLabel(month: ReportMonth): string {
  return `${MONTHS[month.monthIndex]} ${month.year}`;
}

/** The 30th, or the last day of a shorter month. */
export function reportDueDate(month: ReportMonth): string {
  const lastDay = new Date(month.year, month.monthIndex + 1, 0).getDate();
  return toDateString(new Date(month.year, month.monthIndex, Math.min(REPORT_DUE_DAY, lastDay)));
}

/** The assignment covering `date`; when ranges overlap, the one that started last wins. */
export function assignmentOn(assignments: ReportAssignment[], date: string): ReportAssignment | undefined {
  return assignments
    .filter((a) => a.label.trim() && (!a.start || a.start <= date) && (!a.end || date <= a.end))
    .sort((a, b) => b.start.localeCompare(a.start))[0];
}

/** 3 → "3", 1.5 → "1.5", 0.33 → "0.33" */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable({
  providedIn: 'root',
})
export class ProductionReportService {
  constructor(
    private supabase: SupabaseService,
    private tasks: TaskService,
    private http: HttpRequestsService,
    private org: OrgService
  ) { }

  /* ---------- Settings ---------- */

  async getSettings(userId: string): Promise<ReportSettings> {
    const data = maybe(
      await this.supabase.client
        .from('user_private')
        .select('organization, department, assignments')
        .eq('userId', userId)
        .maybeSingle()
    );
    // The row also holds the salary, so it can exist before the report settings were ever saved
    if (data && data.organization !== null) {
      return {
        organization: data.organization ?? '',
        department: data.department ?? '',
        assignments: Array.isArray(data.assignments) ? data.assignments : [],
      };
    }
    return this.legacySettings();
  }

  async saveSettings(userId: string, settings: ReportSettings) {
    must(
      await this.supabase.client
        .from('user_private')
        .upsert({ userId, ...settings, updatedAt: new Date().toISOString() }, { onConflict: 'userId' })
    );
    try {
      window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
    } catch {
      // Nothing to clean up
    }
  }

  /** Settings the first version kept in this browser; offered until they're saved to the database. */
  private legacySettings(): ReportSettings {
    const empty: ReportSettings = { organization: '', department: '', assignments: [] };
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LEGACY_SETTINGS_KEY) : null;
      if (!saved) return empty;
      const old = JSON.parse(saved);
      return {
        organization: old.organization ?? '',
        department: old.department ?? '',
        assignments: old.mainAssignment ? [{ label: old.mainAssignment, start: '', end: '' }] : [],
      };
    } catch {
      return empty;
    }
  }

  /* ---------- Building ---------- */

  async build(user: UserProfile, month: ReportMonth): Promise<ProductionReport> {
    const first = toDateString(new Date(month.year, month.monthIndex, 1));
    const last = toDateString(new Date(month.year, month.monthIndex + 1, 0));
    const [logs, days, holidays, projects, settings] = await Promise.all([
      this.tasks.myWorkLogs(first, last),
      this.http.getUserDaysBetween(user.userId, first, last) as Promise<DayRecord[]>,
      this.http.getHolidays().catch(() => []),
      this.org.getProjects().catch(() => [] as Project[]),
      this.getSettings(user.userId).catch(() => this.legacySettings()),
    ]);
    return this.assemble(user, month, settings, logs, days, this.holidayNames(holidays), projects);
  }

  private holidayNames(holidays: any[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const h of holidays) {
      const date: Date | undefined = h?.date?.toDate?.();
      if (date) names.set(toDateString(date), h.name || 'Holiday');
    }
    return names;
  }

  private assemble(
    user: UserProfile,
    month: ReportMonth,
    settings: ReportSettings,
    logs: WorkLog[],
    dayRecords: DayRecord[],
    holidays: Map<string, string>,
    projects: Project[]
  ): ProductionReport {
    const today = toDateString(new Date());
    const projectsById = new Map(projects.map((p) => [p.id!, p]));
    const recordsByDate = new Map(dayRecords.map((d) => [d.start, d]));
    const dates = daysBetween(
      toDateString(new Date(month.year, month.monthIndex, 1)),
      toDateString(new Date(month.year, month.monthIndex + 1, 0))
    );

    const toLine = (log: WorkLog): ReportLine => {
      const project = projectsById.get(log.projectId);
      return {
        country: log.country.trim(),
        project: project?.name ?? '',
        projectColor: project?.color ?? '',
        subProject: log.taskTitle,
        kind: log.kind.trim(),
        pages: log.pages.split('\n').map((p) => p.trim()).filter(Boolean),
        hours: round2(log.hours),
      };
    };
    // Same order every time: by task, then by when it was logged
    const sorted = [...logs].sort(
      (a, b) => a.taskTitle.localeCompare(b.taskTitle) || (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    );

    const days: ReportDay[] = dates.map((date) => {
      const d = parseLocalDate(date);
      const record = recordsByDate.get(date);
      const lines = sorted.filter((l) => l.date === date).map(toLine);
      let kind: ReportDayKind = 'work';
      let band = assignmentOn(settings.assignments, date)?.label.trim() ?? '';
      if (record?.isDayOff && record.dayOffType !== DayOffType.Task) {
        kind = 'off';
        band = record.dayOffType === DayOffType.Absent ? 'Absent' : 'Off';
      } else if (holidays.has(date)) {
        kind = 'holiday';
        band = holidays.get(date)!;
      } else if (isFriday(d)) {
        kind = 'friday';
        band = '';
      }
      return {
        date,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
        kind,
        band,
        lines,
        hours: round2(lines.reduce((sum, l) => sum + l.hours, 0)),
      };
    });

    // Excel rows: one per project / sub-project / kind / country, in order of first appearance
    const grid = new Map<string, ReportGridRow & { pages: Set<string> }>();
    days.forEach((day, index) => {
      for (const line of day.lines) {
        const key = [line.project, line.subProject, line.kind, line.country].join('\u0000');
        let row = grid.get(key);
        if (!row) {
          row = {
            project: line.project,
            subProject: [line.subProject, line.kind].filter(Boolean).join(' '),
            country: line.country,
            hours: dates.map(() => 0),
            total: 0,
            pages: new Set(),
          };
          grid.set(key, row);
        }
        row.hours[index] = round2(row.hours[index] + line.hours);
        row.total = round2(row.total + line.hours);
        line.pages.forEach((p) => row!.pages.add(p));
      }
    });

    const byProject = new Map<string, { name: string; color: string; hours: number }>();
    for (const line of days.flatMap((d) => d.lines)) {
      const name = line.project || 'No project';
      const item = byProject.get(name) ?? { name, color: line.projectColor, hours: 0 };
      item.hours = round2(item.hours + line.hours);
      byProject.set(name, item);
    }

    return {
      month,
      monthLabel: reportMonthLabel(month),
      dueDate: reportDueDate(month),
      name: user.name ?? '',
      position: user.position ?? '',
      settings,
      days,
      grid: [...grid.values()].map(({ pages, ...row }) => ({
        ...row,
        subProject: [row.subProject, ...pages].join('\n'),
      })),
      byProject: [...byProject.values()].sort((a, b) => b.hours - a.hours),
      totalHours: round2(days.reduce((sum, d) => sum + d.hours, 0)),
      logCount: logs.length,
      unloggedDays: days
        .filter((d) => d.date <= today && !d.lines.length && recordsByDate.get(d.date)?.in && d.kind === 'work')
        .map((d) => d.date),
    };
  }

  /* ---------- Files ---------- */

  fileName(report: ProductionReport, extension: string): string {
    const department = report.settings.department.trim();
    return `Production Report ${report.monthLabel}${department ? ` (${department})` : ''}.${extension}`;
  }

  async downloadWord(report: ProductionReport) {
    downloadBlob(this.fileName(report, 'docx'), await this.wordBlob(report));
  }

  async downloadExcel(report: ProductionReport) {
    downloadBlob(this.fileName(report, 'xlsx'), await this.excelBlob(report));
  }

  /** Day-by-day table, like the old "Production Report <Month>.doc". */
  async wordBlob(report: ProductionReport): Promise<Blob> {
    const {
      AlignmentType,
      Document,
      Header,
      Packer,
      PageOrientation,
      Paragraph,
      ShadingType,
      Table,
      TableCell,
      TableRow,
      TextRun,
      VerticalAlign,
      VerticalMergeType,
      WidthType,
    } = await import('docx');

    const widths = [1500, 1400, 2500, 2900, 1700, 2900, 1000]; // twips; landscape A4 with 1.27 cm margins
    const font = 'Times New Roman';

    const text = (value: string | string[], opts: { bold?: boolean; color?: string; size?: number; align?: any } = {}) =>
      (Array.isArray(value) ? (value.length ? value : ['']) : [value]).map(
        (line) =>
          new Paragraph({
            alignment: opts.align ?? AlignmentType.CENTER,
            children: [new TextRun({ text: line, bold: opts.bold, color: opts.color, size: opts.size ?? 24, font })],
          })
      );

    const cell = (
      value: string | string[],
      opts: { fill?: string; color?: string; bold?: boolean; span?: number; merge?: any; align?: any; width?: number } = {}
    ) =>
      new TableCell({
        children: text(value, opts),
        columnSpan: opts.span,
        verticalMerge: opts.merge,
        verticalAlign: VerticalAlign.CENTER,
        width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
        shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      });

    const bandWidth = widths.slice(1).reduce((a, b) => a + b, 0);
    const band = (day: ReportDay) => {
      switch (day.kind) {
        case 'off':
          return cell(day.band, { fill: FILL.off, color: 'FFFFFF', span: 6, width: bandWidth });
        case 'holiday':
          return cell(day.band, { fill: FILL.holiday, span: 6, width: bandWidth });
        case 'friday':
          return cell('', { fill: FILL.friday, span: 6, width: bandWidth });
        default:
          return day.band ? cell(day.band, { fill: FILL.band, span: 6, width: bandWidth }) : null;
      }
    };

    const rows: InstanceType<typeof TableRow>[] = [
      new TableRow({
        tableHeader: true,
        children: ['Date', 'Country', 'Project Name', 'Sub-Project', 'Kind of Work', 'Page Number', 'Time'].map((title, i) =>
          cell(title, { bold: true, fill: FILL.header, width: widths[i] })
        ),
      }),
    ];

    for (const day of report.days) {
      const dateFill = day.kind === 'friday' ? FILL.friday : undefined;
      const bandCell = band(day);
      const count = day.lines.length + (bandCell ? 1 : 0);
      const dateCell = (index: number) =>
        cell(index === 0 ? day.label : '', {
          fill: dateFill,
          width: widths[0],
          merge: count > 1 ? (index === 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE) : undefined,
        });

      day.lines.forEach((line, i) => {
        rows.push(
          new TableRow({
            cantSplit: true,
            children: [
              dateCell(i),
              cell(line.country, { width: widths[1] }),
              cell(line.project, { width: widths[2] }),
              cell(line.subProject, { width: widths[3] }),
              cell(line.kind, { width: widths[4] }),
              cell(line.pages, { width: widths[5] }),
              cell(formatHours(line.hours), { width: widths[6] }),
            ],
          })
        );
      });
      if (bandCell) {
        rows.push(new TableRow({ cantSplit: true, children: [dateCell(day.lines.length), bandCell] }));
      } else if (!day.lines.length) {
        rows.push(new TableRow({ children: [dateCell(0), ...widths.slice(1).map((w) => cell('', { width: w }))] }));
      }
    }

    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell('Total', { bold: true, span: 6, align: AlignmentType.RIGHT, width: widths.slice(0, 6).reduce((a, b) => a + b, 0) }),
          cell(formatHours(report.totalHours), { bold: true, width: widths[6] }),
        ],
      })
    );

    const { organization, department } = report.settings;
    const headerLines = [
      ...(organization.trim() ? text(organization.trim(), { bold: true, size: 22 }) : []),
      ...text('Production Report', { bold: true, size: 28 }),
    ];

    const doc = new Document({
      creator: report.name,
      title: `Production Report ${report.monthLabel}`,
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.LANDSCAPE },
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
          headers: { default: new Header({ children: headerLines }) },
          children: [
            ...text(`Name: ${report.name}`, { bold: true, align: AlignmentType.LEFT }),
            ...(report.position ? text(report.position, { bold: true, align: AlignmentType.LEFT }) : []),
            ...(department.trim() ? text(`Department: ${department.trim()}`, { bold: true, align: AlignmentType.LEFT }) : []),
            ...text(`Month: ${report.monthLabel}`, { bold: true, align: AlignmentType.LEFT }),
            new Paragraph({ children: [] }),
            new Table({
              rows,
              width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
              columnWidths: widths,
            }),
          ],
        },
      ],
    });

    return Packer.toBlob(doc);
  }

  /** Project × day grid with hours, like the old "Production Report <Month>.xls". */
  async excelBlob(report: ProductionReport): Promise<Blob> {
    const module: any = await import('exceljs');
    const ExcelJS = module.default ?? module;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = report.name;

    const dayCount = report.days.length;
    const firstDayCol = 4; // D
    const totalCol = firstDayCol + dayCount;
    const col = (n: number) => {
      let s = '';
      for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
      return s;
    };
    const lastDayLetter = col(totalCol - 1);

    const sheet = workbook.addWorksheet(report.monthLabel, {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: 'frozen', xSplit: 3, ySplit: 8 }],
    });
    sheet.columns = [
      { width: 20 },
      { width: 34 },
      { width: 12 },
      ...report.days.map(() => ({ width: 4.5 })),
      { width: 8 },
    ];

    const solid = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } });
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const dayFill = (day: ReportDay) =>
      day.kind === 'friday' ? solid(FILL.friday) : day.kind === 'off' ? solid(FILL.off) : day.kind === 'holiday' ? solid(FILL.holiday) : undefined;

    // Title block
    const { organization, department } = report.settings;
    sheet.getCell('A1').value = organization.trim();
    sheet.getCell('A1').font = { bold: true, size: 13 };
    sheet.getCell('A2').value = 'Production Report';
    sheet.getCell('A2').font = { bold: true, size: 14 };
    sheet.getCell('A3').value = 'Department';
    sheet.getCell('A3').font = { bold: true };
    sheet.getCell('B3').value = department.trim();
    const labelCol = Math.max(firstDayCol, totalCol - 12);
    sheet.getCell(1, labelCol).value = 'Name :';
    sheet.getCell(2, labelCol).value = 'Month :';
    [1, 2].forEach((r) => {
      sheet.getCell(r, labelCol).font = { bold: true };
      sheet.mergeCells(r, labelCol, r, labelCol + 2);
      sheet.mergeCells(r, labelCol + 3, r, totalCol);
    });
    sheet.getCell(1, labelCol + 3).value = report.name;
    sheet.getCell(2, labelCol + 3).value = report.monthLabel;

    // Weekday names (rows 3–6, vertical) and day numbers (row 7)
    report.days.forEach((day, i) => {
      const c = firstDayCol + i;
      sheet.mergeCells(3, c, 6, c);
      const weekday = sheet.getCell(3, c);
      weekday.value = day.weekday;
      weekday.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' };
      weekday.font = { size: 8 };
      const number = sheet.getCell(7, c);
      number.value = i + 1;
      number.alignment = center;
      number.font = { bold: true };
    });
    sheet.getCell(7, 3).value = 'Date';
    sheet.getCell(7, totalCol).value = 'Total';
    sheet.getRow(6).height = 18;

    // Header row: column titles, then the main assignment / Off / holiday per day
    const headerRow = 8;
    ['Project Name', 'Sub - Project', 'Country'].forEach((title, i) => (sheet.getCell(headerRow, i + 1).value = title));
    report.days.forEach((day, i) => {
      if (day.kind === 'work') return;
      const header = sheet.getCell(headerRow, firstDayCol + i);
      header.value = day.kind === 'friday' ? '' : day.band;
      header.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' };
      header.font = { size: 8, color: { argb: day.kind === 'off' ? 'FFFFFFFF' : 'FF000000' } };
    });
    // Consecutive working days under the same main assignment share one merged cell
    for (let i = 0; i < dayCount; ) {
      const band = report.days[i].kind === 'work' ? report.days[i].band : '';
      let j = i;
      while (band && j + 1 < dayCount && report.days[j + 1].kind === 'work' && report.days[j + 1].band === band) j++;
      if (band) {
        const start = firstDayCol + i;
        const end = firstDayCol + j;
        if (end > start) sheet.mergeCells(headerRow, start, headerRow, end);
        const cellBand = sheet.getCell(headerRow, start);
        cellBand.value = band;
        // A run of one or two narrow day columns only fits the text sideways
        cellBand.alignment = end - start < 2 ? { ...center, textRotation: 90 } : center;
        if (end - start < 2) cellBand.font = { size: 8 };
        cellBand.fill = solid(FILL.band);
      }
      i = j + 1;
    }
    sheet.getRow(headerRow).height = 42;

    // Data rows
    const firstDataRow = headerRow + 1;
    report.grid.forEach((row, r) => {
      const rowNumber = firstDataRow + r;
      sheet.getCell(rowNumber, 1).value = row.project;
      sheet.getCell(rowNumber, 2).value = row.subProject;
      sheet.getCell(rowNumber, 3).value = row.country;
      row.hours.forEach((hours, i) => {
        if (hours) sheet.getCell(rowNumber, firstDayCol + i).value = hours;
      });
      sheet.getCell(rowNumber, totalCol).value = {
        formula: `SUM(${col(firstDayCol)}${rowNumber}:${lastDayLetter}${rowNumber})`,
        result: row.total,
      };
    });

    // Totals
    const totalRow = firstDataRow + report.grid.length;
    sheet.getCell(totalRow, 1).value = 'Total Working Hours';
    sheet.mergeCells(totalRow, 1, totalRow, 3);
    for (let c = firstDayCol; c <= totalCol; c++) {
      const letter = col(c);
      const result =
        c === totalCol ? report.totalHours : report.days[c - firstDayCol].hours;
      sheet.getCell(totalRow, c).value = report.grid.length
        ? { formula: `SUM(${letter}${firstDataRow}:${letter}${totalRow - 1})`, result }
        : 0;
    }

    // Styling of the table (row 7 down)
    for (let r = 7; r <= totalRow; r++) {
      for (let c = 1; c <= totalCol; c++) {
        const target = sheet.getCell(r, c);
        target.border = border;
        if (!target.alignment) target.alignment = c === 2 ? { vertical: 'middle', wrapText: true } : center;
        const day = c >= firstDayCol && c < totalCol ? report.days[c - firstDayCol] : null;
        const fill = day && (r > headerRow || day.kind !== 'work') ? dayFill(day) : undefined;
        if (fill) target.fill = fill;
        if (day?.kind === 'off' && r !== headerRow) target.font = { color: { argb: 'FFFFFFFF' } };
        // Hours: blank instead of 0, like the handwritten sheets
        if (r > headerRow && c >= firstDayCol) target.numFmt = 'General;-General;;@';
        if (r === headerRow || r === totalRow || c === totalCol) target.font = { ...(target.font ?? {}), bold: true };
      }
    }
    for (let c = 1; c <= 3; c++) sheet.getCell(headerRow, c).fill = solid(FILL.header);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}
