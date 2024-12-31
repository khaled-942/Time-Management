import { Component } from '@angular/core';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../shared/services/user.service';
@Component({
  selector: 'app-log-in',
  imports: [FormsModule, ReactiveFormsModule, CommonModule, RouterModule],
  standalone: true,
  templateUrl: './log-in.component.html',
  styleUrl: './log-in.component.scss',
})
export class LogInComponent {
  loginForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;
  res: any;

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private userService: UserService
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  async handleSubmit() {
    if (this.loginForm.invalid) return;

    this.error = '';
    this.isLoading = true;
    try {
      const { username, password } = this.loginForm.value;
      await this.authService.login(username, password).then((res: any) => {
        if (res._tokenResponse !== undefined) {
          console.log('User logged in');
          this.authService.loginStatusChanged.emit(true);
          localStorage.setItem(
            'user',
            JSON.stringify({ id: res.user.uid, token: res.user.accessToken, date: new Date() })
          );
          this.authService.getUserById(res.user.uid).then((res: any) => {
            this.userService.setUser(res[0]);
            this.router.navigate(['/home']);
          });
        } else if (res.code === 'auth/invalid-credential') {
          this.error = 'Invalid credentials';
          console.log('Invalid credential');
        } else if (res.code === 'auth/invalid-email') {
          this.error = 'Invalid email format';
          console.log('Invalid email');
        } else {
          this.error = 'An error occurred';
        }
      });
    } catch (err) {
      this.error = 'An error occurred';
    } finally {
      this.isLoading = false;
    }
  }
  isFormValid(): boolean {
    return this.loginForm.valid;
  }
}
