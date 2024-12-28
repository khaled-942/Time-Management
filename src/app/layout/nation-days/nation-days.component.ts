import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { HttpRequestsService } from '../../shared/services/http-requests.service';


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

  providers: [DatePipe]
})
export class NationDaysComponent {
  nationalDays: any[] = [];
  loading: boolean = true;

  constructor(private datePipe: DatePipe, private httpRequestsService: HttpRequestsService) { }

  ngOnInit(): void {

    this.httpRequestsService.getHolidays().then((holidays) => {

      holidays.forEach((element: any) => {
       element.date.toDate();
      });

      this.nationalDays = holidays.map((item: any)=> {return {date: item.date.toDate(), name: item.name, type: item.tags, id: item.id}});
      console.log(this.nationalDays);

      this.loading = false;

    }).catch((error) => {
      console.error('Error fetching users', error);
    });
  }

  getTypeClass(type: string): string {
    switch (type) {
      case 'NATIONAL': return 'text-blue-600';
      case 'RELIGIOUS': return 'text-green-600';
      case 'CULTURAL': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  }
}
