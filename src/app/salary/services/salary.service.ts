import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { SalaryConfig, WorkDay, SalaryCalculation, ViolationCount, AttendanceRecord, DeductionLine } from '../models/salary.models';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { isFriday, parseLocalDate, toDateString, WORK_START } from '../../shared/utils/work-schedule';

@Injectable({
    providedIn: 'root'
})
export class SalaryService {
    private salaryConfigSubject = new BehaviorSubject<SalaryConfig>({
        hourlyRate: 0,
        overtimeRate: 1.5,
        regularHours: 8,
        workingDaysPerWeek: 6,
        monthlyBaseSalary: 0
    });

    salaryConfig$ = this.salaryConfigSubject.asObservable();

    constructor(private httpService: HttpRequestsService) { }

    updateConfig(config: Partial<SalaryConfig>): void {
        this.salaryConfigSubject.next({
            ...this.salaryConfigSubject.value,
            ...config
        });
    }

    private calculateAttendance(dayData: any): AttendanceRecord | undefined {
        if (!dayData.in) return undefined;

        const checkInTime = new Date(dayData.in);
        // Still checked in: treat check-out as the check-in time until it is recorded
        const checkOutTime = dayData.out ? new Date(dayData.out) : checkInTime;

        // Every day starts at 9:00, including the short day (only its end is earlier)
        const scheduledStartTime = parseLocalDate(dayData.start);
        scheduledStartTime.setHours(WORK_START.hours, WORK_START.minutes, 0, 0);

        // Late minutes only count when not excused
        let lateMinutes = 0;
        // treat both late excuses and early-leave excuses as a valid excuse to avoid counting deductions
        const hasAnyExcuse = !!(dayData.lateExcuse || dayData.earlyLeaveExcuse);
        if (dayData.isLate && !dayData.isDayOff && !hasAnyExcuse) {
            lateMinutes = Math.max(0, Math.round((checkInTime.getTime() - scheduledStartTime.getTime()) / (1000 * 60)));
        }

        // If check-in is before scheduled start or excused, late minutes are 0
        if (lateMinutes < 0) lateMinutes = 0;

        return {
            checkInTime,
            checkOutTime,
            lateMinutes,
            // mark as excused if there is either a late excuse or an early-leave excuse
            isExcused: hasAnyExcuse,
            isAbsent: !!(dayData.isDayOff && dayData.dayOffType === -1),
            isPaidLeave: !!(dayData.isDayOff && dayData.dayOffType === 0)
        };
    }

    // Lateness penalties, as a fraction of a day's salary, for the n-th occurrence (1-based) in a period.
    // 0–30 min: 1st warning, 2nd ¼, 3rd ½, 4th+ a full day. 31–60 min: 1st ½, then a full day. Over 60: a full day.
    static latePenaltyDays(bucket: 'upTo30' | 'upTo60' | 'over60', occurrence: number): number {
        if (bucket === 'upTo30') return [0, 0.25, 0.5][occurrence - 1] ?? 1;
        if (bucket === 'upTo60') return occurrence === 1 ? 0.5 : 1;
        return 1;
    }

    calculateWorkDay(dayData: any, config: SalaryConfig): WorkDay {
        const date = parseLocalDate(dayData.start);
        let hoursWorked = 0;
        const attendance = this.calculateAttendance(dayData);

        // If paid leave or weekend/holiday, we still consider the day as paid for salary basis
        if (!dayData.isDayOff && attendance) {
            hoursWorked = (attendance.checkOutTime.getTime() - attendance.checkInTime.getTime()) / (1000 * 60 * 60);
        }

        return {
            date,
            hoursWorked,
            isHoliday: dayData.isDayOff && dayData.dayOffType === 0,
            isWeekend: isFriday(date),
            description: this.getWorkDayDescription(dayData, attendance),
            attendance
        };
    }

    private getWorkDayDescription(dayData: any, attendance?: AttendanceRecord): string {
        if (!attendance) return 'No attendance record';
        if (attendance.isPaidLeave) return 'Paid Leave';
        if (attendance.isAbsent) return 'Absent';
        if (dayData.isDayOff) return 'Day Off';
        if (attendance.isExcused) return 'Excused Late';
        if (attendance.lateMinutes > 60) return 'Late (Over 60 min)';
        if (attendance.lateMinutes > 15) return 'Late (15-60 min)';
        if (attendance.lateMinutes > 0) return 'Late (Under 15 min)';
        return 'Present';
    }

    private async getUserBaseSalary(userId: string): Promise<number> {
        try {
            return (await this.httpService.getSalary(userId)) || 0;
        } catch (error) {
            console.error('Error fetching user salary:', error);
            return 0;
        }
    }

    async calculateSalaryForPeriod(userId: string, startDate: Date, endDate: Date): Promise<SalaryCalculation> {
        const config = this.salaryConfigSubject.value;
        const baseSalary = await this.getUserBaseSalary(userId);

        if (!baseSalary) {
            throw new Error('NO_SALARY_DEFINED');
        }

        const timingData = await this.httpService.getUserDaysBetween(userId, toDateString(startDate), toDateString(endDate));

        const workDays: WorkDay[] = timingData.map((day: any) => this.calculateWorkDay(day, config));

        // The full monthly salary is paid for the period; only absences and late arrivals are deducted.
        // Paid leave, task days, Fridays and days without a record cost nothing.
        const dailySalary = baseSalary / 30; // keep 30-day assumption for consistency

        const violations: ViolationCount = {
            under15Minutes: 0,
            between16And30Minutes: 0,
            between31And60Minutes: 0,
            over60Minutes: 0
        };
        const occurrences = { upTo30: 0, upTo60: 0, over60: 0 };
        const deductionLines: DeductionLine[] = [];
        const addLine = (date: string, reason: string, days: number) => {
            // Lines with 0 days are warnings (first 0–30 min lateness), shown so people see them coming
            deductionLines.push({ date, reason, days, amount: days * dailySalary });
        };
        const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

        let lateDeductions = 0;
        let absenceDeductions = 0;

        timingData.forEach((dayData: any, i: number) => {
            const day = workDays[i];

            // Absence (unpaid) is deducted once per absent day
            if (dayData.isDayOff && dayData.dayOffType === -1) {
                absenceDeductions += dailySalary;
                addLine(dayData.start, 'Absence', 1);
                return;
            }

            // Count violations only for attended working days (not days off, not Fridays)
            if (dayData.isDayOff || day.isWeekend || !day.attendance || day.attendance.isExcused) return;
            const lateMinutes = day.attendance.lateMinutes;
            if (lateMinutes <= 0) return;

            let bucket: 'upTo30' | 'upTo60' | 'over60';
            let label: string;
            if (lateMinutes > 60) {
                violations.over60Minutes++;
                bucket = 'over60';
                label = 'over 60 min';
            } else if (lateMinutes > 30) {
                violations.between31And60Minutes++;
                bucket = 'upTo60';
                label = '31–60 min';
            } else {
                if (lateMinutes > 15) violations.between16And30Minutes++;
                else violations.under15Minutes++;
                bucket = 'upTo30';
                label = '0–30 min';
            }
            const occurrence = ++occurrences[bucket];
            const days = SalaryService.latePenaltyDays(bucket, occurrence);
            lateDeductions += days * dailySalary;
            addLine(dayData.start, `${ordinal(occurrence)} late arrival, ${label} (${lateMinutes} min)`, days);
        });

        const totalDeductions = lateDeductions + absenceDeductions;

        return {
            totalRegularHours: 0,
            totalOvertimeHours: 0,
            regularPay: baseSalary,
            overtimePay: 0,
            totalPay: Math.max(0, baseSalary - totalDeductions),
            periodStart: startDate,
            periodEnd: endDate,
            workDays,
            deductions: {
                lateDeductions,
                absenceDeductions,
                totalDeductions
            },
            violations,
            dailySalary,
            deductionLines,
            nextLatePenaltyDays: SalaryService.latePenaltyDays('upTo30', occurrences.upTo30 + 1)
        };
    }
}