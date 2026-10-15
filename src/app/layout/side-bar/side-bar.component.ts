import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { Subscription } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../../shared/services/user.service';
import { FEATURES } from '../../shared/features';

interface SidebarItem {
  label: string;
  route: string;
  icon: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
  adminOnly?: boolean;
}

@Component({
  selector: 'app-side-bar',
  imports: [CommonModule, RouterModule, MenuModule],
  templateUrl: './side-bar.component.html',
  styleUrl: './side-bar.component.scss',
  standalone: true,
})
export class SideBarComponent implements OnInit, OnDestroy {
  /** Emitted when a link is followed, so the mobile drawer can close. */
  @Output() navigate = new EventEmitter<void>();

  user: any = null;
  isAdmin = false;
  private subscription?: Subscription;

  sections: SidebarSection[] = [
    {
      title: 'Main Menu',
      items: [
        { icon: 'pi pi-th-large', label: 'Dashboard', route: '/dashboard' },
        { icon: 'pi pi-calendar', label: 'Calendar', route: '/home' },
        ...(FEATURES.leaveRequests ? [{ icon: 'pi pi-send', label: 'Leave Requests', route: '/leave' }] : []),
      ],
    },
    {
      title: 'Work',
      items: [
        { icon: 'pi pi-objects-column', label: 'Board', route: '/board' },
        { icon: 'pi pi-check-square', label: 'My Tasks', route: '/my-tasks' },
        { icon: 'pi pi-briefcase', label: 'Projects', route: '/projects' },
      ],
    },
    {
      title: 'Company',
      items: [{ icon: 'pi pi-flag', label: 'National Days', route: '/nation-days' }],
    },
    {
      title: 'Management',
      adminOnly: true,
      items: [{ icon: 'pi pi-users', label: 'Admin', route: '/admin' }],
    },
  ];

  accountMenu: MenuItem[] = [
    { label: 'Profile', icon: 'pi pi-user', routerLink: '/profile', command: () => this.navigate.emit() },
    { separator: true },
    { label: 'Log out', icon: 'pi pi-sign-out', command: () => this.logout() },
  ];

  constructor(
    private authService: AuthService,
    private userService: UserService
  ) { }

  ngOnInit(): void {
    this.subscription = this.userService.user$.subscribe((user) => {
      this.user = user; // Update user when the value is emitted
      this.isAdmin = this.user?.isAdmin ? this.user?.isAdmin : false;
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        localStorage.setItem('isAdmin', JSON.stringify(this.isAdmin));
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  logout() {
    this.authService.logout();
  }
}
