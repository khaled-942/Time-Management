import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

interface NationalDay {
  date: Date;
  name: string;
  description: string;
  type: 'National' | 'Religious' | 'Cultural';
}

@Component({
  selector: 'nation-days',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    TableModule,
    ButtonModule
  ],
  templateUrl: './nation-days.component.html',
  styleUrls: ['./nation-days.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class NationDaysComponent implements OnInit {
  nationalDays: NationalDay[] = [
    {
      date: new Date("1-7-2025"),
      name: 'Coptic Christmas',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("1-25-2025"),
      name: 'Revoultion DAy January 25',
      description: '',
      type: 'National'
    },
    {
      date: new Date("3-21-2025"),
      name: 'Sham El Nassim',
      description: 'Monday after Orthodox Ester. Spring Festival.',
      type: 'National'
    },
    {
      date: new Date("3-31-2025"),
      name: 'Eid Al Fitr',
      description: 'Last Day of Ramadan.',
      type: 'Religious'
    },
    {
      date: new Date("4-1-2025"),
      name: 'Eid Al Fitr Day 2',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("4-2-2025"),
      name: 'Eid Al Fitr Day 3',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("3-20-2025"),
      name: 'Coptic Easter Sunday',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("4-25-2025"),
      name: 'Sinai Liberation Day',
      description: '',
      type: 'National'
    },
    {
      date: new Date("5-1-2025"),
      name: 'Labour Day',
      description: 'international Workers\' Day.',
      type: 'National'
    },
    {
      date: new Date("7-23-2025"),
      name: 'Egyptian Revolution Day',
      description: 'Commemorates the 1952 revolution that ended the monarchy.',
      type: 'National'
    },
    {
      date: new Date("10-6-2025"),
      name: 'Armed Forces Day',
      description: 'Honors the Egyptian military\'s victory in the 1973 October War.',
      type: 'National'
    },
    {
      date: new Date("6-8-2025"),
      name: 'Eid al-Kibr',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("6-9-2025"),
      name: 'Eid al-Kibr',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("6-10-2025"),
      name: 'Eid al-Kibr',
      description: '',
      type: 'Religious'
    },
    {
      date: new Date("6-27-2025"),
      name: 'Hijri New Year',
      description: '',
      type: 'Religious'
    },

    {
      date: new Date("6-30-2025"),
      name: 'June 30 Revolution Day',
      description: '',
      type: 'National'
    },
    {
      date: new Date("7-24-2025"),
      name: 'July 23 Revolution Day',
      description: '',
      type: 'National'
    },
    {
      date: new Date("9-5-2025"),
      name: 'Al-Mould Al-Nabawy',
      description: '',
      type: 'National'
    },
  ];

  constructor(private datePipe: DatePipe) { }

  ngOnInit(): void { }

  getTypeClass(type: string): string {
    switch (type) {
      case 'National': return 'text-blue-600';
      case 'Religious': return 'text-green-600';
      case 'Cultural': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  }
}