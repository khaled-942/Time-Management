import { Component } from '@angular/core';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../../shared/services/user.service';
@Component({
  selector: 'appNavbar',
  imports: [MenuModule, ButtonModule, AvatarModule],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.scss',
  standalone: true,
})
export class NavBarComponent {
  user: any = null;
  constructor(private router: Router, private authService: AuthService, private userService: UserService) {

  }

  ngOnInit(): void {
    this.userService.user$.subscribe(user => {
      this.user = user; // Update user when the value is emitted
    });

  }

  menuItems = [
    {
      label: 'Profile',
      icon: 'pi pi-user',
      command: () => this.onProfile(),
    },
    {
      label: 'Settings',
      icon: 'pi pi-cog',
      command: () => this.navigateToSettings(),
    },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => this.logout() },
  ];

  navigateToSettings() {
    console.log('Navigating to settings...');
    // Add navigation logic here
  }
  onProfile() {
    this.router.navigate(['/profile']);
  }
  logout() {
    this.authService.logout();
  }
}
