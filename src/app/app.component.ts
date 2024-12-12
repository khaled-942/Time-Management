import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBarComponent } from './layout/nav-bar/nav-bar.component';
import { SideBarComponent } from './layout/side-bar/side-bar.component';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavBarComponent, SideBarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Time-Management';
  isLoggedIn = false;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.isLoggedIn = this.authService.isLoggedIn(); // Check initial login status

    this.authService.loginStatusChanged.subscribe((status) => {
      // Subscribe to changes
      this.isLoggedIn = status;
    });
  }
}
