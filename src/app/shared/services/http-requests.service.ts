import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HttpRequestsService {
  holidays = [
    {
      id: 1,
      date: new Date('2024-01-01'),
      name: 'New Year',
      tags: ['NATIONAL'],
    },
    {
      id: 2,
      date: new Date('2024-01-14'),
      name: 'Pongal',
      tags: ['NATIONAL', 'CULTURAL'],
    },
  ];

  constructor() {}

  getHolidays(): any {
    return this.holidays;
  }

  addHoliday(holiday: any): any {
    this.holidays.push(holiday);
    return this.holidays;
  }

  deleteHoliday(holiday: any): any {
    this.holidays = this.holidays.filter((h) => h.id !== holiday.id);
    return this.holidays;
  }

  updateHoliday(holiday: any): void {
    const index = this.holidays.findIndex((h) => h.id === holiday.id);
    this.holidays[index] = holiday;
  }
}
