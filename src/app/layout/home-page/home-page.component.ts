import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
@Component({
  selector: 'app-home-page',
  imports: [ButtonModule],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  standalone:true,
})
export class HomePageComponent {

}
