import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { LoaderComponent } from '../../shared/loader/loader.component';

@Component({
  selector: 'nation-days',
  standalone: true,
  imports: [CommonModule, TableModule, LoaderComponent],
  templateUrl: './nation-days.component.html',
  styleUrls: ['./nation-days.component.scss'],
})
export class NationDaysComponent implements OnInit {
  nationalDays: any[] = [];
  loading: boolean = true;

  constructor(private httpRequestsService: HttpRequestsService) { }

  ngOnInit(): void {
    this.httpRequestsService.getHolidays().then((holidays) => {
      this.nationalDays = holidays.map((item: any) => ({ date: item.date.toDate(), name: item.name, type: item.tags, id: item.id }));
    }).catch((error) => {
      console.error('Error fetching holidays', error);
    }).finally(() => {
      this.loading = false;
    });
  }

  /** The next holiday from today on. */
  get upcoming() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.nationalDays
      .filter((d) => d.date >= today)
      .sort((a, b) => a.date - b.date)[0];
  }

  daysUntil(date: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return Math.round((day.getTime() - today.getTime()) / 86_400_000);
  }

  isPast(date: Date): boolean {
    return this.daysUntil(date) < 0;
  }

  tagList(tags: unknown): string[] {
    return Array.isArray(tags) ? tags : tags ? [String(tags)] : [];
  }

  tagTone(tag: string): string {
    switch (tag) {
      case 'NATIONAL': return 'info';
      case 'RELIGIOUS': return 'success';
      case 'CULTURAL': return 'warning';
      default: return '';
    }
  }
}
