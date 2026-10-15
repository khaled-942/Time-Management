import { Injectable } from '@angular/core';
import { SalaryCalculation } from '../models/salary.models';
import { UserProfile } from '../../shared/models';
import { periodLabel, ReportingPeriod } from '../../shared/utils/work-schedule';
import { formatDays, formatMoney, slug } from '../../shared/utils/format';

// Builds the payslip PDF for one user and period. jsPDF is loaded on demand.
@Injectable({
  providedIn: 'root',
})
export class PayslipService {
  async download(user: UserProfile, period: ReportingPeriod, calc: SalaryCalculation, locked: boolean) {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const left = 48;
    const right = pdf.internal.pageSize.getWidth() - 48;
    let y = 64;

    const text = (value: string, x: number, size = 10, style: 'normal' | 'bold' = 'normal', align: 'left' | 'right' = 'left') => {
      pdf.setFont('helvetica', style);
      pdf.setFontSize(size);
      pdf.text(value, x, y, { align });
    };
    const rule = (gap = 14) => {
      pdf.setDrawColor(220);
      pdf.line(left, y, right, y);
      y += gap;
    };
    const row = (label: string, value: string, bold = false) => {
      text(label, left, 10, bold ? 'bold' : 'normal');
      text(value, right, 10, bold ? 'bold' : 'normal', 'right');
      y += 18;
    };

    text('Time I/O', left, 11, 'bold');
    text('PAYSLIP', right, 11, 'bold', 'right');
    y += 28;
    text(user.name || '', left, 18, 'bold');
    y += 18;
    pdf.setTextColor(110);
    text([user.position, user.email].filter(Boolean).join(' · '), left, 10);
    y += 16;
    text(`Period: ${periodLabel(period)}${locked ? '' : '  (provisional, period not closed)'}`, left, 10);
    pdf.setTextColor(0);
    y += 28;
    rule(22);

    row('Monthly salary', formatMoney(calc.regularPay));
    row('Daily rate (salary / 30)', formatMoney(calc.dailySalary));
    y += 6;
    rule(22);

    text('DEDUCTIONS', left, 9, 'bold');
    y += 18;
    const charged = calc.deductionLines.filter((line) => line.days > 0);
    if (charged.length === 0) {
      pdf.setTextColor(110);
      text('No deductions this period.', left, 10);
      pdf.setTextColor(0);
      y += 18;
    }
    for (const line of charged) {
      if (y > 760) {
        pdf.addPage();
        y = 64;
      }
      text(line.date, left, 10);
      text(line.reason, left + 80, 10);
      text(formatDays(line.days), right - 90, 10, 'normal', 'right');
      text(`-${formatMoney(line.amount)}`, right, 10, 'normal', 'right');
      y += 18;
    }
    y += 6;
    rule(22);

    row('Late arrival deductions', `-${formatMoney(calc.deductions.lateDeductions)}`);
    row('Absence deductions', `-${formatMoney(calc.deductions.absenceDeductions)}`);
    row('Total deductions', `-${formatMoney(calc.deductions.totalDeductions)}`);
    y += 4;
    rule(26);
    text('Net pay', left, 14, 'bold');
    text(formatMoney(calc.totalPay), right, 14, 'bold', 'right');
    y += 40;

    pdf.setTextColor(140);
    text(`Generated ${new Date().toLocaleString()}`, left, 8);

    pdf.save(`payslip_${slug(user.name)}_${period.year}-${String(period.monthIndex + 1).padStart(2, '0')}.pdf`);
  }
}
