import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
@Component({
  selector: 'app-log-in',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './log-in.component.html',
  styleUrl: './log-in.component.scss',
})
export class LogInComponent {
  email: string = '';
  password: string = '';
  private authService = inject(AuthService);

  constructor(private router: Router) { }

  async login() {
    try {
      await this.authService.login(this.email, this.password).then((res: any) => {
        console.log(res);
        if(res._tokenResponse != undefined) {
          this.router.navigate(['/home']);
          console.log('User logged in');
        } else if(res.code == 'auth/invalid-credential') {
          console.log("invalid credential");
        } else if(res.code == 'auth/invalid-email') {
          console.log("invalid email");
        }
      })
    } catch (error) {
      console.error('Login error:', error);
    }
  }
}
