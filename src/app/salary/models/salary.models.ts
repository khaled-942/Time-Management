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
    // 0-15 minutes
    under15Minutes: number;
    // 16-30 minutes
    between16And30Minutes: number;
    // 31-60 minutes
    between31And60Minutes: number;
    // over 60 minutes
    over60Minutes: number;
}

export interface SalaryDeductions {
    lateDeductions: number;
    absenceDeductions: number;
    totalDeductions: number;
}

/** One deduction, for the salary breakdown. */
export interface DeductionLine {
    date: string; // YYYY-MM-DD
    reason: string;
    days: number; // fraction of a day's salary
    amount: number;
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
    dailySalary: number;
    deductionLines: DeductionLine[];
    /** Days of salary the next 0–30 min lateness would cost (0 = warning only). */
    nextLatePenaltyDays: number;
}