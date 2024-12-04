import { Component } from '@angular/core';
import { FullcalendarComponent } from '../../shared/components/fullcalendar/fullcalendar.component';

@Component({
  selector: 'app-home-page',
  imports: [FullcalendarComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  standalone: true,
})
export class HomePageComponent {}
