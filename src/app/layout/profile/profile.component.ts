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
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { LoaderComponent } from "../../shared/loader/loader.component";
import { AuthService } from '../../auth/auth.service';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';

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
    LoaderComponent,
    CardModule,
    ButtonModule
  ],
  providers: [MessageService],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  date: Date | undefined;
  user: any = {
    userId: '',
    name: '',
    email: '',
    currentAvatar: '',
  };
  submitBtn = false;
  oldAvatar: any;
  avatars: Avatar[] = [];
  displayAvatarDialog = false;
  isLoading = false;
  // Monthly salary, kept apart from the profile so only its owner can see it
  salary: number | null = null;
  savedSalary: number | null = null;
  salaryLoaded = false;
  salarySaving = false;
  genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
  ];

  constructor(
    private authService: AuthService,
    private avatarService: AvatarService,
    private messageService: MessageService,
    private userService: UserService,
    private httpRequestsService: HttpRequestsService,
    private fb: FormBuilder
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      gender: [''],
      birthDate: [null],
      position: [''],
      phone: [''],
      location: [''],
      bio: ['', Validators.maxLength(500)],
    });
  }

  ngOnInit() {
    this.isLoading = true;
    this.userService.user$.subscribe((user) => {
      this.user = user; // Update user when the value is emittedthis.user.birthDate
      if (this.user != null) {
        console.log(this.user);
        this.loadAvatars();
        this.isLoading = false;
        this.initializeForm();
        if (!this.salaryLoaded) this.loadSalary();
      }
    });
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
    this.oldAvatar = this.user.currentAvatar;
  }

  showAvatarDialog() {
    this.displayAvatarDialog = true;
  }

  selectAvatar(avatar: Avatar) {
    this.isLoading = true;
    this.user.currentAvatar = avatar.url;
    this.displayAvatarDialog = false;
    this.isLoading = false;
    this.isSubmitValid(this.profileForm.value);
  }

  initializeForm() {
    if (this.user != null) {
      this.profileForm = this.fb.group({
        name: [this.user.name, [Validators.required, Validators.minLength(2)]],
        email: [this.user.email, [Validators.required, Validators.email]],
        gender: [this.user.gender || ''],
        birthDate: [this.user.birthDate || null],
        position: [this.user.position || ''],
        phone: [this.user.phone || ''],
        location: [this.user.location || ''],
        bio: [this.user.bio || '', Validators.maxLength(500)],
        currentAvatar: this.user.currentAvatar,
        userId: this.user.userId,
      });
    }

    if (this.profileForm.valid && !this.compareObjects(this.profileForm.value, this.editableUser())) this.submitBtn = true;
    this.profileForm.valueChanges.subscribe(value => {
      console.log(value);

      this.isSubmitValid(value)
    });
  }

  isSubmitValid(val: any) {
    if (this.profileForm.valid && (!this.compareObjects(val, this.editableUser()) || this.oldAvatar != this.user.currentAvatar)) this.submitBtn = true;
    else this.submitBtn = false;
  }

  handleSubmit() {
    const formData = this.profileForm.value;
    formData.currentAvatar = this.user.currentAvatar;
    formData.userId = this.user.userId;

    if (this.profileForm.valid && (!this.compareObjects(formData, this.editableUser()) || this.oldAvatar != this.user.currentAvatar)) {
      console.log('Profile Data that will be change ====> ', formData);
      this.isLoading = true;
      this.authService.updateUserById(this.user.userId, formData).then(onfulfilled => {
        console.log(onfulfilled);
        if (onfulfilled.val) {
          // Keep fields the form doesn't edit (e.g. isAdmin) on the shared user
          this.userService.setUser({ ...this.user, ...formData });
          this.initializeForm();
          this.submitBtn = false;
          this.isLoading = false;
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: onfulfilled.msg,
          });
        } else {
          this.submitBtn = false;
          this.isLoading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: "Something went wrong, Please try again later.",
          });
        }
      })
    }
  }

  // The user without fields the profile form doesn't edit, for change detection
  private editableUser(): any {
    const { isAdmin, verified, salary, active, ...editable } = this.user ?? {};
    return editable;
  }

  private async loadSalary() {
    this.salaryLoaded = true;
    try {
      this.savedSalary = await this.httpRequestsService.getSalary(this.user.userId);
      this.salary = this.savedSalary;
    } catch (error) {
      console.error('Error loading salary:', error);
    }
  }

  get salaryDirty(): boolean {
    return this.salary !== null && this.salary !== undefined && this.salary > 0 && this.salary !== this.savedSalary;
  }

  async saveSalary() {
    if (!this.salaryDirty) return;
    this.salarySaving = true;
    try {
      await this.httpRequestsService.setSalary(this.user.userId, this.salary!);
      this.savedSalary = this.salary;
      this.messageService.add({ severity: 'success', summary: 'Salary saved', detail: 'Your pay will use the new amount.' });
    } catch (error) {
      console.error('Error saving salary:', error);
      this.messageService.add({ severity: 'error', summary: 'Error', detail: "Couldn't save your salary. Please try again." });
    } finally {
      this.salarySaving = false;
    }
  }

  compareObjects(obj1: any, obj2: any): boolean {

    const isEmpty = (value: any): boolean => value === null || value === undefined || value === '';

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) return obj1 === obj2;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    const allKeys = new Set([...keys1, ...keys2]);

    for (const key of allKeys) {
      let value1 = obj1[key];
      let value2 = obj2[key];

      if (isEmpty(value1) && isEmpty(value2)) continue;
      if (isEmpty(value1) !== isEmpty(value2)) return false;
      value1 = key == 'birthDate' ? obj1[key].toString() : obj1[key];
      value2 = key == 'birthDate' ? obj2[key].toString() : obj2[key];
      if (!this.compareObjects(value1, value2)) return false;

    }

    return true;
  }

}
