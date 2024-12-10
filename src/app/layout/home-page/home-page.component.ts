import { Component } from '@angular/core';
import { FullcalendarComponent } from '../../shared/components/fullcalendar/fullcalendar.component';
import { NavBarComponent } from '../../layout/nav-bar/nav-bar.component';
@Component({
  selector: 'app-home-page',
  imports: [FullcalendarComponent, NavBarComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  standalone: true,
})
export class HomePageComponent {}
