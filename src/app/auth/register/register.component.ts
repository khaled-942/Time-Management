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

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  registerForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

  user = {
    userId: '',
    email: '',
    name: '',
    currentAvatar: '',
  };

  // private authService = inject(AuthService);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
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
      await this.authService.register(email, password).then((res: any) => {
        console.log(res.code);
        if (res._tokenResponse != undefined) {
          this.user.userId = res.user.uid;
          this.user.email = email;
          this.user.name = username;
          console.log(this.user);
          this.authService
            .saveRegisterdUser('users', this.user)
            .then((result: any) => {
              this.router.navigate(['/login']);
              console.log(result);
            })
            .catch((err) => {
              console.log(err);
            });
          console.log('User registered');
        } else if (res.code == 'auth/email-already-in-use') {
          console.log('email already exist');
        } else if (res.code == 'auth/weak-password') {
          console.log('weak password');
        } else if (res.code == 'auth/invalid-email') {
          console.log('invalid email');
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
    }
  }
  isFormValid(): boolean {
    return this.registerForm.valid;
  }
}
