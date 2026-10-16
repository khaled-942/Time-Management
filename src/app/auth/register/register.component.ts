import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  FormBuilder,
  ReactiveFormsModule,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AvatarService } from '../../shared/services/avatar.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, ButtonModule, InputTextModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  registerForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

  // private authService = inject(AuthService);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private avatarService: AvatarService
  ) {
    this.registerForm = this.fb.group(
      {
        username: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (password?.value !== confirmPassword?.value) {
      confirmPassword?.setErrors({ passwordMismatch: true });
    } else {
      confirmPassword?.setErrors(null);
    }
    return null;
  }

  async handleRegister() {
    if (this.registerForm.invalid) return;
    this.error = '';
    this.isLoading = true;
    const { username, email, password } = this.registerForm.value;
    try {
      const avatar = this.avatarService.generateAvatars(username, true)[0].url;
      const res = await this.authService.register(email, password, username, avatar);
      if (res.uid) {
        this.router.navigate(['/login']);
      } else if (res.code == 'auth/email-already-in-use') {
        this.error = 'This email is already registered';
      } else if (res.code == 'auth/weak-password') {
        this.error = 'Password is too weak (at least 6 characters)';
      } else if (res.code == 'auth/invalid-email') {
        this.error = 'Invalid email format';
      } else {
        this.error = 'Registration failed, please try again';
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.error = 'Registration failed, please try again';
    } finally {
      this.isLoading = false;
    }
  }
  isFormValid(): boolean {
    return this.registerForm.valid;
  }
}
