import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';
import Chart, { scales } from 'chart.js/auto'; // Explicit import
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import * as moment from 'moment';
import { LoaderComponent } from "../../shared/loader/loader.component";
import { SalaryService } from '../../salary/services/salary.service';
import { RouterModule } from '@angular/router';

interface AttendanceRecord {
  date: Date;
  checkIn: string;
  checkOut: string;
  status:
  | 'Normal'
  | 'Early Leave'
  | 'Late & Early Excused'
  | 'Late Excused'
  | 'Early Excused'
  | 'Day Off'
  | 'Absent'
  | 'Task'
  | 'Late';
}

interface StatisticCard {
  title: string;
  value: string;
  icon: string;
  color: string;
  trend?: number;  // percentage change from last month
}

interface AttendanceViolations {
  under15Minutes: number;
  between15And60Minutes: number;
  over60Minutes: number;
}

@Component({
  selector: 'app-time-management-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ChartModule,
    TableModule,
    ButtonModule,
    DialogModule,
    DropdownModule,
    FormsModule,
    ProgressSpinnerModule,
    LoaderComponent,
    RouterModule
  ],
  templateUrl: './time-management-dashboard.component.html',
  styleUrls: ['./time-management-dashboard.component.scss'],
})
export class TimeManagementDashboardComponent implements OnInit {
  Months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  selectedMonth: any;
  // Attendance Records
  attendanceRecords: AttendanceRecord[] = [];
  allRecords: AttendanceRecord[] = [];

  allDaysOff: any = [];

  // Statistics Cards
  statisticCards: StatisticCard[] = [];
  isLoading = false;
  userId: any;
  toatlWorkDays = 0;
  totalExcusedDays = 0;
  totalExcuseHours = 0;
  totalOffDays = 0;
  totalLatearrival = 0;
  totalEarlyLeaves = 0;
  remainingOffDays = 0;
  remainingExcuseHours = 0;
  totallateExcuse = 0;
  totalerlyExcuse = 0;
  // Pie Chart Data
  attendanceChartData: any;
  attendanceChartOptions: any;

  // Bar Chart Data
  daysOffChartData: any;
  daysOffChartOptions: any;

  attendanceViolations: AttendanceViolations = {
    under15Minutes: 0,
    between15And60Minutes: 0,
    over60Minutes: 0
  };

  // Salary and deductions properties
  lateDeductions: number = 0;
  absenceDeductions: number = 0;
  totalDeductions: number = 0;
  basePay: number = 0;
  totalPay: number = 0;

  // Add new property for salary message
  salaryMissing: boolean = false;

  constructor(
    private httpService: HttpRequestsService,
    private salaryService: SalaryService
  ) { }

  async ngOnInit(): Promise<void> {
    let day = new Date();
    console.log("HERE =============> ", this.Months[day.getMonth()]);
    console.log(day.getDate());
    day.getDate() > 10 ? this.selectedMonth = this.Months[day.getMonth() + 1] : this.selectedMonth = this.Months[day.getMonth()];
    await this.getAllData(new Date());
    await this.getDaysOff();
    await this.initializeAttendanceChart();
    await this.initializeDaysOffChart();
    this.loadSalaryData();
  }

  async getAllData(date: Date) {
    this.isLoading = true;
    const userData = localStorage.getItem('user');
    if (userData) {
      this.userId = JSON.parse(userData).id;
      await this.httpService
        .getUserMonthDays(this.userId, date)
        .then((res: any) => {
          res.forEach((record: any) => {
            this.allRecords.push({
              date: new Date(record.start),
              checkIn: record.in.split('T')[1],
              checkOut: record.out.split('T')[1],
              status: this.whatTheStatusShouldBe(record),
            });
          });
          this.isLoading = false;
          this.calculateViolations();
        })
        .catch((err) => {
          console.log('Something went wrong.', err);
          this.isLoading = false;
        });
    }
    this.attendanceRecords = this.allRecords.filter(
      (record) =>
        record.status != 'Task' &&
        record.status != 'Absent'
      // record.status != 'Day Off'
    );
    this.toatlWorkDays = this.allRecords.filter(
      (record) =>
        record.status != 'Absent' &&
        record.status != 'Task' &&
        record.status != 'Day Off'
    ).length;
    this.totalExcusedDays = this.allRecords.filter(
      (record) =>
        record.status == 'Late & Early Excused' ||
        record.status == 'Late Excused' ||
        record.status == 'Early Excused'
    ).length;
    this.totalOffDays = this.allRecords.filter(
      (record) => record.status == 'Day Off'
    ).length;
    this.totalLatearrival = this.allRecords.filter(
      (record) => record.status == 'Late'
    ).length;
    this.totalEarlyLeaves = this.allRecords.filter(
      (record) => record.status == 'Early Leave'
    ).length;
    this.totallateExcuse = this.allRecords.filter(
      (record) =>
        record.status == 'Late Excused' ||
        record.status == 'Late & Early Excused'
    ).length;
    this.totalerlyExcuse = this.allRecords.filter(
      (record) =>
        record.status == 'Early Excused' ||
        record.status == 'Late & Early Excused'
    ).length;

    this.remainingOffDays = 21 - this.totalOffDays;
    this.totalExcuseHours = this.calaulateExcuseHours();

    this.remainingExcuseHours = 4 * 60 * 60 * 1000 - this.totalExcuseHours;


    // Calculate trends by comparing with last month's data
    const lastMonthDate = new Date(date);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthData = await this.getMonthData(lastMonthDate);

    this.statisticCards = [
      {
        title: 'Work days',
        value: `${this.toatlWorkDays}`,
        icon: 'pi pi-clock',
        color: 'bg-blue-500',
        trend: this.calculateTrend(this.toatlWorkDays, lastMonthData.workDays)
      },
      {
        title: 'Total Days Off',
        value: this.totalOffDays.toString(),
        icon: 'pi pi-calendar',
        color: 'bg-green-500',
        trend: this.calculateTrend(this.totalOffDays, lastMonthData.daysOff)
      },
      {
        title: 'Total Excused Days',
        value: this.totalExcusedDays.toString(),
        icon: 'pi pi-clock',
        color: 'bg-red-500',
        trend: this.calculateTrend(this.totalExcusedDays, lastMonthData.excusedDays)
      },
      {
        title: 'Remaining Excuse Hours',
        value: this.formatHours(this.remainingExcuseHours),
        icon: 'pi pi-clock',
        color: 'bg-green-500',
        trend: this.calculateTrend(this.remainingExcuseHours, lastMonthData.remainingExcuseHours)
      },
      {
        title: 'Late (Under 15 min)',
        value: this.attendanceViolations.under15Minutes.toString(),
        icon: 'pi pi-clock',
        color: 'bg-yellow-500',
      },
      {
        title: 'Late (15-60 min)',
        value: this.attendanceViolations.between15And60Minutes.toString(),
        icon: 'pi pi-exclamation-triangle',
        color: 'bg-orange-500',
      },
      {
        title: 'Late (Over 60 min)',
        value: this.attendanceViolations.over60Minutes.toString(),
        icon: 'pi pi-times-circle',
        color: 'bg-red-500',
      }
    ];
  }

  whatTheStatusShouldBe(record: any) {
    if (record.isDayOff) {
      if (record.dayOffType === 0) {
        return 'Day Off';
      } else if (record.dayOffType === -1) {
        return 'Absent';
      } else if (record.dayOffType === 1) {
        return 'Task';
      }
    } else if (record.lateExcuse && record.earlyExcuse) {
      return 'Late & Early Excused';
    } else if (record.lateExcuse) {
      return 'Late Excused';
    } else if (record.earlyLeaveExcuse) {
      return 'Early Excused';
    } else if (record.isLate) {
      return 'Late';
    } else if (record.isEarlyLeave) {
      return 'Early Leave';
    }
    return 'Normal';
  }


  async onMonthChange(event: any) {
    const selectedMonth = event.value;
    this.selectedMonth = selectedMonth;
    console.log('Selected Month:', selectedMonth);
    this.attendanceRecords = [];
    this.allRecords = [];
    this.toatlWorkDays = 0;
    this.totalExcusedDays = 0;
    this.totalExcuseHours = 0;
    this.totalOffDays = 0;
    this.totalLatearrival = 0;
    this.totalEarlyLeaves = 0;
    this.remainingOffDays = 0;
    this.remainingExcuseHours = 0;
    this.totallateExcuse = 0;
    this.totalerlyExcuse = 0;
    await this.getAllData(new Date(2025, this.Months.findIndex(item => item == this.selectedMonth), 1));
    await this.initializeAttendanceChart();
    await this.initializeDaysOffChart();
    this.loadSalaryData();
  }

  private async loadSalaryData() {
    try {
      const user = localStorage.getItem('user');
      const userId = user ? JSON.parse(user).id : null;

      if (!userId) {
        console.error('User not found');
        return;
      }

      // Create proper date objects using the current year and selected month index
      const monthIndex = this.Months.findIndex(month => month === this.selectedMonth);
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, monthIndex, 1);
      const endDate = new Date(currentYear, monthIndex + 1, 0);

      try {
        const calculation = await this.salaryService.calculateSalaryForPeriod(
          userId,
          startDate,
          endDate
        );

        this.salaryMissing = false;
        this.lateDeductions = calculation.deductions.lateDeductions;
        this.absenceDeductions = calculation.deductions.absenceDeductions;
        this.totalDeductions = calculation.deductions.totalDeductions;
        this.basePay = calculation.regularPay + calculation.overtimePay;
        this.totalPay = calculation.totalPay;
      } catch (error: any) {
        if (error.message === 'NO_SALARY_DEFINED') {
          this.salaryMissing = true;
          this.lateDeductions = 0;
          this.absenceDeductions = 0;
          this.totalDeductions = 0;
          this.basePay = 0;
          this.totalPay = 0;
        }
      }
    } catch (error) {
      console.error('Error loading salary data:', error);
    }
  }

  calaulateExcuseHours = () => {
    const totalExcusedays = this.attendanceRecords.filter(
      (record) =>
        record.status == 'Late & Early Excused' ||
        record.status == 'Late Excused' ||
        record.status == 'Early Excused'
    );
    let totalExcuseHours = 0;
    totalExcusedays.forEach((record) => {
      const isThrusday = moment.default(record.date).day() === 4;
      console.log("HERE", isThrusday);

      if (record.status == 'Late & Early Excused') {
        const checkOut = moment.default(record.checkOut, 'hh:mm').toDate();
        const checkIn = moment.default(record.checkIn, 'hh:mm').toDate();
        const diff = checkOut.getTime() - checkIn.getTime();
        if (isThrusday) {
          const workinHours = 4.5 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        } else {
          const workinHours = 8 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        }
      } else if (record.status == 'Late Excused') {
        const checkIn = moment.default(record.checkIn, 'hh:mm').toDate();
        if (isThrusday) {
          const checkOut = moment.default('13:30', 'hh:mm').toDate();
          const diff = checkOut.getTime() - checkIn.getTime();
          const workinHours = 4.5 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        } else {
          const checkOut = moment.default('17:00', 'hh:mm').toDate();
          console.log(checkOut.getTime());

          const diff = checkOut.getTime() - checkIn.getTime();
          const workinHours = 8 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        }
      } else if (record.status == 'Early Excused') {
        const checkOut = moment.default(record.checkOut, 'hh:mm').toDate();
        const checkIn = moment.default('09:00', 'hh:mm').toDate();
        const diff = checkOut.getTime() - checkIn.getTime();
        if (isThrusday) {
          const workinHours = 4.5 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        } else {
          const workinHours = 8 * 60 * 60 * 1000;

          totalExcuseHours += workinHours - diff;
        }
      }

      console.log(totalExcuseHours);
    });
    return totalExcuseHours;
  };

  formatHours = (Milsec: number) => {
    // Convert milliseconds to hours and minutes
    const totalExcuseSeconds = Math.floor(Milsec / 1000);
    const hours = Math.floor(totalExcuseSeconds / 3600);
    const minutes = Math.floor((totalExcuseSeconds % 3600) / 60);

    // Format as HH:MM
    const formattedHours = hours < 10 ? '0' + hours : hours.toString();
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes.toString();

    return formattedHours + ':' + formattedMinutes;
  };

  // Initialize Attendance Pie Chart
  initializeAttendanceChart() {
    const documentStyle = getComputedStyle(document.documentElement);

    this.attendanceChartData = {
      labels: [
        'Normal',
        'Late Excused',
        'Early Excused',
        'Late    ',
        'Early Leave    ',
        'Absent',
        'Day Off',
        'Task',
      ],
      datasets: [
        {
          data: this.getAttendanceChartData(),
          backgroundColor: [
            documentStyle.getPropertyValue('--green-500'),
            documentStyle.getPropertyValue('--green-500'),
            documentStyle.getPropertyValue('--green-500'),
            documentStyle.getPropertyValue('--red-500'),
            documentStyle.getPropertyValue('--red-500'),
            documentStyle.getPropertyValue('--red-600'),
            documentStyle.getPropertyValue('--blue-500'),
            documentStyle.getPropertyValue('--blue-500'),
          ],
        },
      ],
    };

    this.attendanceChartOptions = {
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
          },
        },
      },
    };
  }

  getAttendanceChartData(): number[] {
    const data: any = [];
    data.push(this.allRecords.filter(day => (day.status == 'Normal')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Late Excused')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Early Excused')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Late')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Early Leave')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Absent')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Day Off')).length);
    data.push(this.allRecords.filter(day => (day.status == 'Task')).length);

    return data;
  }

  // Initialize Work Hours Bar Chart
  initializeDaysOffChart() {
    const documentStyle = getComputedStyle(document.documentElement);

    this.daysOffChartData = {
      labels: this.getMonthsLabels(),
      datasets: [
        {
          label: 'No Days off',
          data: this.getDaysOffNo(),
          backgroundColor: documentStyle.getPropertyValue('--blue-500'),
        },
      ],
    };

    this.daysOffChartOptions = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Days',
          },
          ticks: {
            stepSize: 1,
          }
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    };
  }

  getMonthsLabels(): string[] {
    let data: string[] = [];
    let curentDay = new Date();
    for (let index = 1; index <= 11; index++) {
      const element: any = this.Months[(Math.abs(curentDay.getMonth() + index) % this.Months.length)]
      data.push(element);
    }
    data.push(this.Months[curentDay.getMonth()]);

    return data;
  }

  getDaysOffNo(): number[] {
    let data: number[] = [];
    let months = this.getMonthsLabels();
    months.forEach(month => {
      // we need to handle the year of this day off.
      data.push(this.allDaysOff.filter((item: any) => item.month == month).length)
    })
    return data;
  }



  async getDaysOff() {

    await this.httpService.getUserDaysOffDays(this.userId).then((res: any) => {
      res.forEach((day: any) => {
        let d = new Date(day.start);
        this.allDaysOff.push({
          date: d,
          month: this.Months[d.getMonth()],
          year: d.getFullYear()
        });
      });
    }).catch((err) => {
      console.log('Something went wrong.', err);
    });

  }

  formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    let period = 'AM';
    let hours12 = hours;

    if (hours >= 12) {
      period = 'PM';
      if (hours > 12) {
        hours12 = hours - 12;
      }
    } else if (hours === 0) {
      hours12 = 12; // Midnight case
    }

    const formattedHours = hours12 < 10 ? `0${hours12}` : hours12.toString();
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes.toString();

    return `${formattedHours}:${formattedMinutes} ${period}`;
  }

  // Utility method to get status class
  getStatusClass(status: string): string {
    switch (status) {
      case 'Normal':
        return 'text-green-600';
      case 'Early Leave':
        return 'text-red-600';
      case 'Late':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  getStatusRowClass(status: string): string {
    switch (status) {
      case 'Early Leave':
        return 'bg-red-100';
      case 'Late':
        return 'bg-red-100';
      case 'Late & Early Excused':
        return 'bg-gren-200';
      case 'Late Excused':
        return 'bg-green-200';
      case 'Early Excused':
        return 'bg-green-200';
      default:
        return '';
    }
  }

  private calculateTrend(currentValue: number, previousValue: number): number {
    if (previousValue === 0) return 0;
    return Math.round(((currentValue - previousValue) / previousValue) * 100);
  }

  private async getMonthData(date: Date) {
    const userData = localStorage.getItem('user');
    if (userData) {
      const userId = JSON.parse(userData).id;

      return await this.httpService
        .getUserMonthDays(userId, date)
        .then((res: any) => {
          const allRecords = res.map((record: any) => ({
            date: new Date(record.start),
            checkIn: record.in.split('T')[1],
            checkOut: record.out.split('T')[1],
            status: this.whatTheStatusShouldBe(record),
          }));

          const workDays = allRecords.filter(
            (record: any) =>
              record.status != 'Absent' &&
              record.status != 'Task' &&
              record.status != 'Day Off'
          ).length;

          const daysOff = allRecords.filter(
            (record: any) => record.status == 'Day Off'
          ).length;

          const excusedDays = allRecords.filter(
            (record: any) =>
              record.status == 'Late & Early Excused' ||
              record.status == 'Late Excused' ||
              record.status == 'Early Excused'
          ).length;

          const totalExcuseHours = this.calaulateExcuseHours();
          const remainingExcuseHours = 4 * 60 * 60 * 1000 - totalExcuseHours;

          return {
            workDays,
            daysOff,
            excusedDays,
            remainingExcuseHours,
          };
        })
        .catch((err) => {
          console.log('Something went wrong.', err);
          return {
            workDays: 0,
            daysOff: 0,
            excusedDays: 0,
            remainingExcuseHours: 0,
          };
        });
    }

    return {
      workDays: 0,
      daysOff: 0,
      excusedDays: 0,
      remainingExcuseHours: 0,
    };
  }

  private calculateViolations() {
    const violations: AttendanceViolations = {
      under15Minutes: 0,
      between15And60Minutes: 0,
      over60Minutes: 0
    };

    this.allRecords.forEach(record => {
      if (record.status === 'Late') {
        const checkIn = moment.default(record.checkIn, 'hh:mm').toDate();
        const scheduledStart = moment.default('09:00', 'hh:mm').toDate();
        const lateMinutes = Math.max(0, (checkIn.getTime() - scheduledStart.getTime()) / (1000 * 60));

        if (lateMinutes > 60) {
          violations.over60Minutes++;
        } else if (lateMinutes > 15) {
          violations.between15And60Minutes++;
        } else if (lateMinutes > 0) {
          violations.under15Minutes++;
        }
      }
    });

    this.attendanceViolations = violations;
    return violations;
  }
}
