import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import Chart from 'chart.js/auto'; // Explicit import
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import * as moment from 'moment';

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
    | 'Late Arrival';
}

interface StatisticCard {
  title: string;
  value: string;
  icon: string;
  color: string;
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
    ProgressSpinnerModule,
  ],
  templateUrl: './time-management-dashboard.component.html',
  styleUrls: ['./time-management-dashboard.component.scss'],
})
export class TimeManagementDashboardComponent implements OnInit {
  // Attendance Records
  attendanceRecords: AttendanceRecord[] = [];
  allRecords: AttendanceRecord[] = [];

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
  workHoursChartData: any;
  workHoursChartOptions: any;

  constructor(private httpService: HttpRequestsService) {}

  async ngOnInit(): Promise<void> {
    await this.getAllData();
    console.log(this.formatHours(this.totalExcuseHours));

    this.statisticCards = [
      {
        title: 'Work days',
        value: ` ${this.toatlWorkDays}`,
        icon: 'pi pi-clock',
        color: 'bg-blue-500',
      },
      {
        title: 'Total Days Off',
        value: this.totalOffDays.toString(),
        icon: 'pi pi-calendar',
        color: 'bg-green-500',
      },

      {
        title: 'Total Excused Days',
        value: this.totalExcusedDays.toString(),
        icon: 'pi pi-clock',
        color: 'bg-red-500',
      },
      {
        title: 'Remaining Days Off',
        value: this.remainingOffDays.toString(),
        icon: 'pi pi-calendar',
        color: 'bg-blue-500',
      },
      {
        title: 'Remaining Excuse Hours',
        value: this.formatHours(this.remainingExcuseHours),
        icon: 'pi pi-clock',
        color: 'bg-green-500',
      },
    ];

    this.initializeAttendanceChart();
    this.initializeWorkHoursChart();
  }

  async getAllData() {
    this.isLoading = true;
    const userData = localStorage.getItem('user');
    if (userData) {
      this.userId = JSON.parse(userData).id;
      await this.httpService
        .getUserDays(this.userId)
        .then((res: any) => {
          console.log(res);

          res.forEach((record: any) => {
            this.allRecords.push({
              date: new Date(record.start),
              checkIn: record.in.split('T')[1],
              checkOut: record.out.split('T')[1],
              status: this.whatTheStatusShouldBe(record),
            });
          });
          this.isLoading = false;
          console.log(this.attendanceRecords);
        })
        .catch((err) => {
          console.log('Something went wrong.', err);
          this.isLoading = false;
        });
    }
    this.attendanceRecords = this.allRecords.filter(
      (record) =>
        record.status != 'Task' &&
        record.status != 'Absent' &&
        record.status != 'Day Off'
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
      (record) => record.status == 'Late Arrival'
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
      return 'Late Arrival';
    } else if (record.isEarlyLeave) {
      return 'Early Leave';
    }
    return 'Normal';
  }

  calaulateExcuseHours = () => {
    const totalExcusedays = this.attendanceRecords.filter(
      (record) =>
        record.status == 'Late & Early Excused' ||
        record.status == 'Late Excused' ||
        record.status == 'Early Excused'
    );
    console.log(totalExcusedays);
    let totalExcuseHours = 0;
    totalExcusedays.forEach((record) => {
      const isThrusday = moment.default(record.date).day() === 4;
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
          const diff = checkOut.getTime() - checkIn.getTime();
          const workinHours = 4.5 * 60 * 60 * 1000;

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
    console.log(formattedHours + ':' + formattedMinutes);

    return formattedHours + ':' + formattedMinutes;
  };

  // Initialize Attendance Pie Chart
  initializeAttendanceChart() {
    const documentStyle = getComputedStyle(document.documentElement);

    this.attendanceChartData = {
      labels: [
        'Normal',
        'Late',
        'Early Leave',
        'Late & Early Excused',
        'Late Excused',
        'Early Excused',
        'Day Off',
        'Absent',
        'Task',
        'Late Arrival',
      ],
      datasets: [
        {
          data: [18, 4, 2, 1],
          backgroundColor: [
            documentStyle.getPropertyValue('--green-500'),
            documentStyle.getPropertyValue('--yellow-500'),
            documentStyle.getPropertyValue('--orange-500'),
            documentStyle.getPropertyValue('--red-500'),
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

  // Initialize Work Hours Bar Chart
  initializeWorkHoursChart() {
    const documentStyle = getComputedStyle(document.documentElement);

    this.workHoursChartData = {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [
        {
          label: 'Work Hours',
          data: [42, 45, 38, 40],
          backgroundColor: documentStyle.getPropertyValue('--blue-500'),
        },
      ],
    };

    this.workHoursChartOptions = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Hours',
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    };
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
      case 'Early Excused':
        return 'text-yellow-600';
      case 'Early Excused':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  getStatusRowClass(status: string): string {
    switch (status) {
      case 'Early Leave':
        return 'bg-yellow-100';
      case 'Late Arrival':
        return 'bg-red-200';
      case 'Late & Early Excused':
        return 'bg-yellow-200';
      case 'Late Excused':
        return 'bg-red-200';
      default:
        return '';
    }
  }
}
