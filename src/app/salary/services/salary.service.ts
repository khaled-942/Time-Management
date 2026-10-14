import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { SalaryConfig, WorkDay, SalaryCalculation, ViolationCount, SalaryDeductions, AttendanceRecord } from '../models/salary.models';
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
        if (!dayData.in || !dayData.out) return undefined;

        const checkInTime = new Date(dayData.in);
        const checkOutTime = new Date(dayData.out);

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

    private calculateViolationPenalty(violations: ViolationCount, dailySalary: number): number {
        let totalDeduction = 0;

        // Combine 0-15 and 16-30 into the same 0-30 bucket per spec
        const u = (violations.under15Minutes || 0) + (violations.between16And30Minutes || 0);
        if (u === 1) {
            // first occurrence: warning, no deduction
        } else if (u === 2) {
            totalDeduction += dailySalary * 0.25; // second -> quarter day
        } else if (u === 3) {
            totalDeduction += dailySalary * 0.25; // second
            totalDeduction += dailySalary * 0.5;  // third -> half day
        } else if (u >= 4) {
            // second and third already handled (0.25 + 0.5). From 4th onward each is a full day.
            totalDeduction += dailySalary * 0.25; // second
            totalDeduction += dailySalary * 0.5;  // third
            totalDeduction += dailySalary * (u - 3); // 4th+ -> full day each
        }

        // 31-60 minutes tier: first -> half day, second+ -> full day each
        const b = violations.between31And60Minutes || 0;
        if (b === 1) {
            totalDeduction += dailySalary * 0.5;
        } else if (b >= 2) {
            totalDeduction += dailySalary * 0.5; // first
            totalDeduction += dailySalary * (b - 1); // second+ each full day
        }

        // over60: each occurrence -> full day
        const o = violations.over60Minutes || 0;
        totalDeduction += o * dailySalary;

        return totalDeduction;
    }

    calculateWorkDay(dayData: any, config: SalaryConfig): WorkDay {
        const date = parseLocalDate(dayData.start);
        let hoursWorked = 0;
        const attendance = this.calculateAttendance(dayData);
        console.log(`Calculating work day for ${date.toDateString()}:`, dayData);

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
            const response = await this.httpService.getUserProfile(userId);
            return response?.salary || 0;
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

        // Prepare violation counters according to new buckets
        const violations: ViolationCount = {
            under15Minutes: 0,
            between16And30Minutes: 0,
            between31And60Minutes: 0,
            over60Minutes: 0
        };

        let absenceDaysCount = 0;

        timingData.forEach((dayData: any, i: number) => {
            const day = workDays[i];

            // Absence (unpaid) is deducted once per absent day
            if (dayData.isDayOff && dayData.dayOffType === -1) {
                absenceDaysCount++;
                return;
            }

            // Count violations only for attended working days (not days off, not Fridays)
            if (!dayData.isDayOff && !day.isWeekend && day.attendance && !day.attendance.isExcused) {
                const lateMinutes = day.attendance.lateMinutes;
                if (lateMinutes > 60) {
                    violations.over60Minutes++;
                } else if (lateMinutes > 30) {
                    violations.between31And60Minutes++;
                } else if (lateMinutes > 15) {
                    violations.between16And30Minutes++;
                } else if (lateMinutes > 0) {
                    violations.under15Minutes++;
                }
            }
        });

        // Late deductions
        const lateDeductions = this.calculateViolationPenalty(violations, dailySalary);

        // Absence deductions: each unpaid absence -> full day deduction
        const absenceDeductions = absenceDaysCount * dailySalary;

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
            violations
        };
    }
}