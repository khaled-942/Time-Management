import { Component, OnInit } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  Event,
  RouterOutlet,
} from '@angular/router';
import { NavBarComponent } from './layout/nav-bar/nav-bar.component';
import { SideBarComponent } from './layout/side-bar/side-bar.component';
import { AuthService } from './auth/auth.service';
import { LoaderComponent } from './shared/loader/loader.component';
import { UserService } from './shared/services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavBarComponent, SideBarComponent, LoaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Time-Management';
  isLoggedIn = false;
  isLoading = false;
  constructor(
    private authService: AuthService,
    private router: Router,
    private userService: UserService
  ) {}

  ngOnInit() {
    this.router.events.subscribe((event: Event) => {
      if (event instanceof NavigationStart) {
        this.isLoading = true;
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isLoading = false;
      }
    });
    this.isLoggedIn = this.authService.isLoggedIn(); // Check initial login status

    this.authService.loginStatusChanged.subscribe((status) => {
      // Subscribe to changes
      this.isLoggedIn = status;
    });

    if (this.isLoggedIn) {
      const userData = localStorage.getItem('user');
      if (userData) {
        let uid: any = JSON.parse(userData).id;
        this.authService.getUserById(uid).then((res: any) => {
          // convert timestamp to Data <<<<0_0>>>>
          res[0].birthDate = res[0].birthDate?.toDate();
          this.userService.setUser(res[0]);
        });
      }
    }
  }
}
