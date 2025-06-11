import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { SalaryConfig, WorkDay, SalaryCalculation, ViolationCount, SalaryDeductions, AttendanceRecord } from '../models/salary.models';
import { HttpRequestsService } from '../../shared/services/http-requests.service';

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
        const scheduledStart = new Date(dayData.start);

        // Calculate minutes late
        const scheduledStartTime = new Date(scheduledStart);
        scheduledStartTime.setHours(9, 0, 0, 0); // Set to 9:00 AM of the scheduled day

        // Calculate late minutes only if not excused
        const lateMinutes = dayData.isLate && !dayData.lateExcuse && Math.max(0, (checkInTime.getTime() - scheduledStartTime.getTime()) / (1000 * 60)) || 0;
        // If check-in is before scheduled start, late minutes are 0

        // If excused, late minutes are set to 0

        return {
            checkInTime,
            checkOutTime,
            lateMinutes,
            isExcused: dayData.lateExcuse || false,
            isAbsent: dayData.isDayOff && dayData.dayOffType === -1,
            isPaidLeave: dayData.isDayOff && dayData.dayOffType === 0
        };
    }

    private calculateViolationPenalty(violations: ViolationCount, dailySalary: number): number {
        let totalDeduction = 0;

        // Under 15 minutes
        if (violations.under15Minutes === 1) {
            // Warning only
        } else if (violations.under15Minutes === 2) {
            totalDeduction += dailySalary * 0.25; // Quarter-day
        } else if (violations.under15Minutes === 3) {
            totalDeduction += dailySalary * 0.5; // Half-day
        } else if (violations.under15Minutes >= 4) {
            totalDeduction += dailySalary; // Full-day
        }

        // 15-60 minutes
        if (violations.between15And60Minutes === 1) {
            // Warning only
        } else if (violations.between15And60Minutes === 2) {
            totalDeduction += dailySalary * 0.25;
        } else if (violations.between15And60Minutes === 3) {
            totalDeduction += dailySalary * 0.5;
        } else if (violations.between15And60Minutes >= 4) {
            totalDeduction += dailySalary;
        }

        // Over 60 minutes
        totalDeduction += violations.over60Minutes * dailySalary; // Full day deduction for each occurrence

        return totalDeduction;
    }

    calculateWorkDay(dayData: any, config: SalaryConfig): WorkDay {
        const date = new Date(dayData.start);
        let hoursWorked = 0;
        const attendance = this.calculateAttendance(dayData);
        console.log(`Calculating work day for ${date.toDateString()}:`, dayData);


        if (!dayData.isDayOff && attendance) {
            hoursWorked = (attendance.checkOutTime.getTime() - attendance.checkInTime.getTime()) / (1000 * 60 * 60);
        }

        return {
            date,
            hoursWorked,
            isHoliday: dayData.isDayOff && dayData.dayOffType === 0,
            isWeekend: date.getDay() === 5 || date.getDay() === 6,
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

    async calculateSalaryForPeriod(userId: string, startDate: Date, endDate: Date): Promise<SalaryCalculation> {
        const config = this.salaryConfigSubject.value;
        const timingData = await this.httpService.getUserDays(userId);

        const workDays: WorkDay[] = timingData
            .filter((day: any) => {
                const date = new Date(day.start);
                return date >= startDate && date <= endDate;
            })
            .map((day: any) => this.calculateWorkDay(day, config));

        let totalRegularHours = 0;
        let totalOvertimeHours = 0;
        const violations: ViolationCount = {
            under15Minutes: 0,
            between15And60Minutes: 0,
            over60Minutes: 0
        };

        // Calculate violations
        workDays.forEach(day => {
            if (!day.isHoliday && !day.isWeekend && day.attendance && !day.attendance.isExcused) {
                const lateMinutes = day.attendance.lateMinutes;
                if (lateMinutes > 60) {
                    violations.over60Minutes++;
                } else if (lateMinutes > 15) {
                    violations.between15And60Minutes++;
                } else if (lateMinutes > 0) {
                    violations.under15Minutes++;
                }
            }

            if (!day.isHoliday && !day.isWeekend && !day.attendance?.isAbsent) {
                if (day.hoursWorked <= config.regularHours) {
                    totalRegularHours += day.hoursWorked;
                } else {
                    totalRegularHours += config.regularHours;
                    totalOvertimeHours += day.hoursWorked - config.regularHours;
                }
            }
        });

        const regularPay = totalRegularHours * config.hourlyRate;
        const overtimePay = totalOvertimeHours * (config.hourlyRate * config.overtimeRate);
        const basePay = config.monthlyBaseSalary || (regularPay + overtimePay);
        const dailySalary = basePay / 30; // Assuming 30-day month for calculation

        // Calculate deductions
        const deductions: SalaryDeductions = {
            lateDeductions: this.calculateViolationPenalty(violations, dailySalary),
            absenceDeductions: workDays.filter(d =>
                !d.isWeekend && !d.isHoliday &&
                d.attendance?.isAbsent &&
                !d.attendance?.isPaidLeave
            ).length * dailySalary,
            totalDeductions: 0
        };
        deductions.totalDeductions = deductions.lateDeductions + deductions.absenceDeductions;

        return {
            totalRegularHours,
            totalOvertimeHours,
            regularPay,
            overtimePay,
            totalPay: basePay - deductions.totalDeductions,
            periodStart: startDate,
            periodEnd: endDate,
            workDays,
            deductions,
            violations
        };
    }
}