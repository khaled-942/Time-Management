import { Component } from '@angular/core';

import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-side-bar',
  imports: [MenuModule, ButtonModule, CommonModule, RouterModule],
  templateUrl: './side-bar.component.html',
  styleUrl: './side-bar.component.scss',
  standalone: true,
})
export class SideBarComponent {
  isExpanded = false;
  constructor(private router: Router) {}

  // Toggle sidebar expansion
  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  // Navigation items
  sidebarItems = [
    { icon: 'pi pi-home', label: 'Dashboard', route: '/dashboard' },
    { icon: 'pi pi-calendar', label: 'Calendar', route: '/calendar' },
    { icon: 'pi pi-file', label: 'Report', route: '/report' },
    { icon: 'pi pi-flag', label: 'National Days', route: '/national-days' },
    // { icon: 'pi pi-cog', label: 'Settings', route: '/settings' },
    // { icon: 'pi pi-sign-out', label: 'Logout', route: '/logout' },
  ];
  logout() {
    console.log('Logging out...');
    this.router.navigate(['/login']);
    // Add logout logic here
  }
}
