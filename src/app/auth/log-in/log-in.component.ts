import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from '@angular/fire/auth';

@Component({
  selector: 'app-log-in',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './log-in.component.html',
  styleUrl: './log-in.component.scss',
})
export class LogInComponent {
  phoneNumber: string = '';
  otp: string = '';
  otpSent = false;
  errorMessage: string | null = null;
  private recaptchaVerifier: RecaptchaVerifier | undefined;
  private confirmationResult: any;

  constructor(private auth: Auth) {}

  sendOTP() {
    this.errorMessage = null;

    this.recaptchaVerifier = new RecaptchaVerifier(
      this.auth,
      'recaptcha-container',
      { size: 'invisible' }
    );

    signInWithPhoneNumber(this.auth, this.phoneNumber, this.recaptchaVerifier)
      .then((confirmationResult) => {
        this.otpSent = true;
        this.confirmationResult = confirmationResult;
      })
      .catch((error) => {
        this.errorMessage = error.message;
      });
  }

  verifyOTP() {
    if (!this.confirmationResult) {
      this.errorMessage = 'No OTP was sent!';
      return;
    }

    this.confirmationResult
      .confirm(this.otp)
      .then((result: any) => {
        console.log('User signed in successfully:', result.user);
      })
      .catch((error: any) => {
        this.errorMessage = error.message;
      });
  }
}
