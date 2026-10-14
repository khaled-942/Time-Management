import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { CardModule } from 'primeng/card';
import { TabViewModule } from 'primeng/tabview';

// interface NationalHoliday {
//   id?: number;
//   date: Date;
//   name: string;
//   tags: string[];
// }

// interface User {
//   id: number;
//   name: string;
//   email: string;
//   phone: string;
//   isVerified: boolean;
// }

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    ButtonModule,
    CalendarModule,
    DropdownModule,
    CheckboxModule,
    CardModule,
    TabViewModule
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  holidays: any = [];
  newHoliday: any = {
    date: new Date(),
    name: '',
    tags: [],
  };

  holidayTags = [
    { name: 'National', value: 'NATIONAL' },
    { name: 'Religious', value: 'RELIGIOUS' },
    { name: 'Cultural', value: 'CULTURAL' },
    { name: 'International', value: 'INTERNATIONAL' },
  ];

  selectedTags: string[] = [];

  users: any[] = [];

  constructor(private httpRequestsService: HttpRequestsService) { }
  ngOnInit(): void {
    // Load existing holidays from a service in a real app

    this.httpRequestsService.getHolidays().then((holidays) => {

      holidays.forEach((element: any) => {
        element.date.toDate();
      });

      this.holidays = holidays.map((item: any) => { return { date: item.date.toDate(), name: item.name, tags: item.tags, id: item.id } });
      console.log("holydays", this.holidays);

    }).catch((error) => {
      console.error('Error fetching users', error);
    });


    this.httpRequestsService.getAllUsers().then((users) => {
      this.users = users;
      console.log("users", this.users);
    }).catch((error) => {
      console.error('Error fetching users', error);
    });
  }

  addHoliday() {
    if (this.newHoliday.name && this.newHoliday.date) {
      const holiday = {
        date: this.newHoliday.date,
        name: this.newHoliday.name,
        tags: this.selectedTags,
      };

      this.httpRequestsService.addHoliday(holiday).then((res) => {
        if (res.id) {
          this.holidays.push(holiday);
          this.httpRequestsService.getHolidays().then((holidays) => {

            holidays.forEach((element: any) => {
              element.date.toDate();
            });

            this.holidays = holidays.map((item: any) => { return { date: item.date.toDate(), name: item.name, tags: item.tags, id: item.id } });

          })
        }
      }).catch((error) => {
        console.error('Error fetching users', error);
      });

      // Reset form
      this.newHoliday = {
        date: new Date(),
        name: '',
        tags: [],
      };
      this.selectedTags = [];
    }
  }

  deleteHoliday(holiday: any) {
    this.httpRequestsService.deleteHoliday(holiday.id).then((res: any) => {
      console.log(res);
      if (res.id) {
        this.holidays = this.holidays.filter((h: any) => h.id !== holiday.id);
      }
    }).catch((error) => {
      console.error('Error fetching users', error);
    });
  }

  async downloadUserData(user: any) {
    let days: any[];
    try {
      days = await this.httpRequestsService.getUserDays(user.userId);
    } catch (error) {
      console.error('Error fetching user days', error);
      return;
    }
    days.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    const time = (value?: string) => (value ? value.split('T')[1] ?? '' : '');
    const yesNo = (value: any) => (value ? 'Yes' : 'No');
    const dayOffLabel: Record<number, string> = { 0: 'Paid Day Off', [-1]: 'Absent', 1: 'Task' };

    const userData = [
      ['Date', 'Check In', 'Check Out', 'Status', 'Late', 'Early Leave', 'Late Excuse', 'Early Leave Excuse'],
      ...days.map((day) => [
        day.start,
        day.isDayOff ? '' : time(day.in),
        day.isDayOff ? '' : time(day.out),
        day.isDayOff ? dayOffLabel[day.dayOffType] ?? 'Day Off' : 'Worked',
        yesNo(day.isLate),
        yesNo(day.isEarlyLeave),
        yesNo(day.lateExcuse),
        yesNo(day.earlyLeaveExcuse),
      ]),
    ];

    // Convert to CSV
    const csvContent = userData.map((e) => e.join(',')).join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${user.name}_timetracking.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}
