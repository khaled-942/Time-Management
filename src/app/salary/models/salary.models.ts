export interface SalaryConfig {
    hourlyRate: number;
    overtimeRate: number;
    regularHours: number;
    workingDaysPerWeek: number;
    monthlyBaseSalary?: number;
}

export interface WorkDay {
    date: Date;
    hoursWorked: number;
    isHoliday: boolean;
    isWeekend: boolean;
    description?: string;
    attendance?: AttendanceRecord;
}

export interface AttendanceRecord {
    checkInTime: Date;
    checkOutTime: Date;
    lateMinutes: number;
    isExcused: boolean;
    isAbsent: boolean;
    isPaidLeave: boolean;
}

export interface ViolationCount {
    under15Minutes: number;
    between15And60Minutes: number;
    over60Minutes: number;
}

export interface SalaryDeductions {
    lateDeductions: number;
    absenceDeductions: number;
    totalDeductions: number;
}

export interface SalaryCalculation {
    totalRegularHours: number;
    totalOvertimeHours: number;
    regularPay: number;
    overtimePay: number;
    totalPay: number;
    periodStart: Date;
    periodEnd: Date;
    workDays: WorkDay[];
    deductions: SalaryDeductions;
    violations: ViolationCount;
}