import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})

export class RegisterComponent {
  email: string = '';
  password: string = '';
  private authService = inject(AuthService);

  constructor(private router: Router) { }

  async register() {
    try {
      await this.authService.register(this.email, this.password).then((res: any) => {
        console.log(res.code);
        if(res._tokenResponse != undefined) {
          this.router.navigate(['/login']);
          console.log('User registered');
        } else if(res.code == 'auth/email-already-in-use') {
          console.log("email already exist");
        } else if(res.code == 'auth/weak-password') {
          console.log("weak password");
        } else if(res.code == 'auth/invalid-email') {
          console.log("invalid email");
        }
      })
    } catch (error) {
      console.error('Registration error:', error);
    }
  }
}
