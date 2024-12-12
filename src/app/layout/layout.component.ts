import { Component } from '@angular/core';
import { HomePageComponent } from './home-page/home-page.component';

@Component({
  selector: 'app-layout',
  imports: [HomePageComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  standalone: true,
})
export class LayoutComponent {}
