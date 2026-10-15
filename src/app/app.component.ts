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
import { UserService } from './shared/services/user.service';
import { DirectoryService } from './shared/services/directory.service';
import { PushService } from './shared/services/push.service';
import { distinctUntilChanged, filter, map } from 'rxjs';

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
  isLoading = false;
  sidebarOpen = false;
  constructor(
    private authService: AuthService,
    private router: Router,
    private userService: UserService,
    private directory: DirectoryService,
    private push: PushService
  ) { }

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

    if (typeof window !== 'undefined') {
      this.directory.start();
      // Once per signed-in person: check push support and refresh this device's token
      this.userService.user$
        .pipe(
          map((user) => user?.userId ?? ''),
          filter(Boolean),
          distinctUntilChanged()
        )
        .subscribe(() => this.push.init());
    }

    if (this.isLoggedIn) {
      const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
      const userData = isBrowser ? localStorage.getItem('user') : null;
      if (userData) {
        let uid: any = JSON.parse(userData).id;
        this.authService.getUserById(uid).then((res: any) => {
          if (!res[0]) return;
          // Deactivated accounts are signed out
          if (res[0].active === false) {
            this.authService.logout();
            return;
          }
          // convert timestamp to Data <<<<0_0>>>>
          res[0].birthDate = res[0].birthDate?.toDate();
          this.userService.setUser(res[0]);
        });
      }
    }
  }
}
