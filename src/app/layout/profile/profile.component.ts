// src/app/user-profile/user-profile.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarModule } from 'primeng/avatar';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AvatarService, Avatar } from '../../shared/services/avatar.service';
import { UserService } from '../../shared/services/user.service';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextareaModule } from 'primeng/inputtextarea';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    AvatarModule,
    DialogModule,
    ProgressSpinnerModule,
    ToastModule,
    CalendarModule,
    FormsModule,
    ReactiveFormsModule,
    DropdownModule,
    InputNumberModule,
    InputTextModule,
    InputMaskModule,
    InputTextareaModule,
  ],
  providers: [MessageService],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  date: Date | undefined;
  user: any = {
    id: '',
    name: '',
    email: '',
    currentAvatar: '',
  };
  avatars: Avatar[] = [];
  displayAvatarDialog = false;
  isLoading = false;
  genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
  ];

  constructor(
    private avatarService: AvatarService,
    private messageService: MessageService,
    private userService: UserService,
    private fb: FormBuilder
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      gender: [''],
      birthDate: [null],
      position: [''],
      salary: [null, [Validators.min(0)]],
      phone: [''],
      location: [''],
      bio: ['', Validators.maxLength(500)],
    });
  }

  ngOnInit() {
    this.userService.user$.subscribe((user) => {
      this.user = user; // Update user when the value is emitted
      if (this.user != null) {
        this.loadAvatars();
      }
    });
    this.initializeForm();
  }

  initializeForm() {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      gender: [''],
      birthDate: [null],
      position: [''],
      salary: [null, [Validators.min(0)]],
      phone: [''],
      location: [''],
      bio: ['', Validators.maxLength(500)],
    });
  }

  handleSubmit() {
    if (this.profileForm.valid) {
      const formData = this.profileForm.value;
      console.log('Profile Data:', formData);
      // Here you would typically send the data to a backend service
    }
  }

  loadAvatars() {
    // Generate avatars based on user's name
    this.avatars = this.avatarService.generateAvatars(this.user?.name);

    // Set default avatar to the first generated avatar
    if (this.avatars.length > 0) {
      this.user.currentAvatar === ''
        ? (this.user.currentAvatar = this.avatars[0].url)
        : (this.user.currentAvatar = this.user.currentAvatar);
    }
  }

  showAvatarDialog() {
    this.displayAvatarDialog = true;
  }
  selectAvatar(avatar: Avatar) {
    this.isLoading = true;
    this.user.currentAvatar = avatar.url;
    this.displayAvatarDialog = false;
    this.isLoading = false;
    // this.messageService.add({
    //   severity: 'success',
    //   summary: 'Success',
    //   detail: 'Avatar updated successfully',
    // });
  }
}
