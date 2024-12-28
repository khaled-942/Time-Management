import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../../shared/services/user.service';
import { LoaderComponent } from "../../shared/loader/loader.component";

@Component({
  selector: 'app-side-bar',
  imports: [MenuModule, ButtonModule, CommonModule, RouterModule, LoaderComponent],
  templateUrl: './side-bar.component.html',
  styleUrl: './side-bar.component.scss',
  standalone: true,
})
export class SideBarComponent {
  user: any = null;
  isExpanded = false;
  isLoading = true;
  isAdmin = false;

  constructor(
    private router: Router,
              private authService: AuthService,
              private userService: UserService
    ) {}

  ngOnInit(): void {

    this.userService.user$.subscribe((user) => {
      this.user = user; // Update user when the value is emitted
      this.isAdmin = this.user?.isAdmin;
      this.isLoading = false
    });
  }


  // Toggle sidebar expansion
  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  // Navigation items
  sidebarItems = [
    { icon: 'pi pi-home', label: 'Dashboard', route: '/dashboard' },
    { icon: 'pi pi-calendar', label: 'Calendar', route: '/home' },
    { icon: 'pi pi-file', label: 'Admin', route: '/admin' },
    { icon: 'pi pi-flag', label: 'National Days', route: '/nation-days' },
  ];
  logout() {
    this.authService.logout();
  }
}
