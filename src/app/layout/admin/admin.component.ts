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

  constructor(private httpRequestsService: HttpRequestsService) {}
  ngOnInit(): void {
    // Load existing holidays from a service in a real app

    this.httpRequestsService.getHolidays().then((holidays) => {

      holidays.forEach((element: any) => {
       element.date.toDate();
      });

      this.holidays = holidays.map((item: any)=> {return {date: item.date.toDate(), name: item.name, tags: item.tags, id: item.id}});
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

      this.httpRequestsService.addHoliday(holiday).then((res)=> {
          if(res.id) {
            this.holidays.push(holiday);
            this.httpRequestsService.getHolidays().then((holidays) => {

              holidays.forEach((element: any) => {
              element.date.toDate();
              });

              this.holidays = holidays.map((item: any)=> {return {date: item.date.toDate(), name: item.name, tags: item.tags, id: item.id}});

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
      if(res.id) {
        this.holidays = this.holidays.filter((h: any) => h.id !== holiday.id);
      }
    }).catch((error) => {
      console.error('Error fetching users', error);
    });
  }

  downloadUserData(user: any) {
    // In a real app, this would fetch user's time tracking data
    const userData = [
      ['Date', 'Check In', 'Check Out', 'Days Off'],
      ['2024-01-15', '09:00', '17:00', 'No'],
      ['2024-01-16', '09:30', '16:45', 'Yes'],
    ];

    // Convert to CSV
    const csvContent = userData.map((e) => e.join(',')).join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
