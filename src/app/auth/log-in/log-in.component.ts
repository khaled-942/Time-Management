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
import { Router } from '@angular/router';
@Component({
  selector: 'app-log-in',
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
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
    private fb: FormBuilder
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
        console.log("LOG IN", res.user);

        if (res._tokenResponse !== undefined) {
          this.router.navigate(['/home']);
          console.log('User logged in');
          localStorage.setItem('user', JSON.stringify({ id: res.user.uid, token: res.user.accessToken }));
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
