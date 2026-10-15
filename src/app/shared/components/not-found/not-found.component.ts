import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-not-found',
  imports: [ButtonModule],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
  standalone: true,
})
export class NotFoundComponent {
  constructor(private router: Router) {}

  navigateHome() {
    this.router.navigate(['/dashboard']);
  }
}
