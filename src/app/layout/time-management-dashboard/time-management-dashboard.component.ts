import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import Chart from 'chart.js/auto'; // Explicit import

interface AttendanceRecord {
  date: Date;
  checkIn: string;
  checkOut: string;
  status: 'Normal' | 'Late' | 'Early Leave' | 'Absent';
  workHours: number;
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
    DialogModule
  ],
  templateUrl: './time-management-dashboard.component.html',
  styleUrls: ['./time-management-dashboard.component.scss']
})
export class TimeManagementDashboardComponent implements OnInit {
  // Attendance Records
  attendanceRecords: AttendanceRecord[] = [
    {
      date: new Date(2024, 2, 1),
      checkIn: '08:15 AM',
      checkOut: '05:30 PM',
      status: 'Late',
      workHours: 8.5
    },
    {
      date: new Date(2024, 2, 2),
      checkIn: '07:55 AM',
      checkOut: '05:45 PM',
      status: 'Normal',
      workHours: 9
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
    {
      date: new Date(2024, 2, 3),
      checkIn: '09:10 AM',
      checkOut: '04:20 PM',
      status: 'Early Leave',
      workHours: 6.8
    },
  ];

  // Statistics Cards
  statisticCards: StatisticCard[] = [
    {
      title: 'Total Working Days',
      value: '22',
      icon: 'pi pi-calendar',
      color: 'bg-blue-500'
    },
    {
      title: 'On-Time Arrivals',
      value: '18',
      icon: 'pi pi-clock',
      color: 'bg-green-500'
    },
    {
      title: 'Late Arrivals',
      value: '4',
      icon: 'pi pi-exclamation-triangle',
      color: 'bg-yellow-500'
    },
    {
      title: 'Total Work Hours',
      value: '190.5',
      icon: 'pi pi-chart-bar',
      color: 'bg-purple-500'
    }
  ];

  // Pie Chart Data
  attendanceChartData: any;
  attendanceChartOptions: any;

  // Bar Chart Data
  workHoursChartData: any;
  workHoursChartOptions: any;

  constructor() { }

  ngOnInit(): void {
    this.initializeAttendanceChart();
    this.initializeWorkHoursChart();
  }

  // Initialize Attendance Pie Chart
  initializeAttendanceChart() {
    const documentStyle = getComputedStyle(document.documentElement);

    this.attendanceChartData = {
      labels: ['On Time', 'Late', 'Early Leave', 'Absent'],
      datasets: [
        {
          data: [18, 4, 2, 1],
          backgroundColor: [
            documentStyle.getPropertyValue('--green-500'),
            documentStyle.getPropertyValue('--yellow-500'),
            documentStyle.getPropertyValue('--orange-500'),
            documentStyle.getPropertyValue('--red-500')
          ]
        }
      ]
    };

    this.attendanceChartOptions = {
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
          },
        }
      }
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
          backgroundColor: documentStyle.getPropertyValue('--blue-500')
        }
      ]
    };

    this.workHoursChartOptions = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Hours'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    };
  }

  // Utility method to get status class
  getStatusClass(status: string): string {
    switch (status) {
      case 'Normal': return 'text-green-600';
      case 'Late': return 'text-yellow-600';
      case 'Early Leave': return 'text-orange-600';
      case 'Absent': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }
}