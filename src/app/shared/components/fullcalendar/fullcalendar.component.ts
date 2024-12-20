import {
  ChangeDetectorRef,
  Component,
  Inject,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import {
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import {
  CalendarOptions,
  DateSelectArg,
  EventClickArg,
  EventApi,
} from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import { createEventId } from './event-needs/event';
import { isPlatformBrowser } from '@angular/common';
import { InputSwitchModule } from 'primeng/inputswitch';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CalendarModule } from 'primeng/calendar';
import { CheckboxModule } from 'primeng/checkbox';

import { log } from 'console';

@Component({
  selector: 'app-fullcalendar',
  imports: [
    FullCalendarModule,
    InputSwitchModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    CalendarModule,
    CheckboxModule,

  ],
  templateUrl: './fullcalendar.component.html',
  styleUrl: './fullcalendar.component.scss',
  standalone: true,
})
export class FullcalendarComponent {
  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;

  check_In_time: Date | null = null;
  check_Out_time: Date | null = null;
  checked: boolean = false;
  checked2: boolean = false;
  selectedDate: string = '';
  calendarVisible = true;
  visible: boolean = false;
  isBrowser: boolean;

  timing: any[] = [];

  // Day Off
  isDayOff: boolean = false;
  // Late and Early Leave flags
  isLate: boolean = false;
  isEarlyLeave: boolean = false;

  // Excuses
  lateExcuse: boolean = false;
  earlyLeaveExcuse: boolean = false;

  calendarOptions: CalendarOptions = {
    plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin],
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: '',
    },
    // validRange: {
    //   end: new Date(),
    // },
    initialView: 'dayGridMonth',
    initialEvents: this.timing,
    weekends: true,

    editable: false,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    dateClick: (info) => {
      this.selectedDate = info.dateStr;
    },
    select: this.handleDateSelect.bind(this),

    eventsSet: this.handleEvents.bind(this),
    hiddenDays: [],
    firstDay: 6,
    events: (info, successCallback, failureCallback) => {
      const events = this.generateFridays(info.start, info.end);
      successCallback(events);
    },
  };

  currentEvents: EventApi[] = [];

  constructor(
    private changeDetector: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }


  // Function to generate background events for all Fridays
  generateFridays(start: Date, end: Date) {
    const events = [];
    let currentDate = new Date(start);

    while (currentDate < end) {
      if (currentDate.getDay() === 6) {
        // 5 corresponds to Friday
        events.push({
          start: currentDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
          display: 'background',
          backgroundColor: 'lightblue', // Optional: Custom background color
        });
      }
      currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
    }

    return events;
  }

  handleCalendarToggle() {
    this.calendarVisible = !this.calendarVisible;
  }

  handleWeekendsToggle() {
    const { calendarOptions } = this;
    if (calendarOptions.hiddenDays?.length === 0) {
      calendarOptions.hiddenDays = [5];
    } else {
      calendarOptions.hiddenDays = [];
    }
  }

  compareDates(date1: Date, date2: Date) {
    date1.setHours(0, 0, 0, 0);
    date2.setHours(0, 0, 0, 0);

    if (date1 > date2) {
      return 1;
    } else if (date1 < date2) {
      return -1;
    } else {
      return 0;
    }
  }

  // Handle date selection in FullCalendar
  handleDateSelect(selectInfo: DateSelectArg) {
    // Store the selected date
    this.selectedDate = selectInfo.startStr;
    const isFriday = new Date(this.selectedDate).getDay() === 5;
    const isTusday = new Date(this.selectedDate).getDay() === 4;

    if(!isFriday && this.compareDates(new Date(this.selectedDate), new Date()) <= 0) {
      // in Day We can click
      const timeOut = new Date(this.selectedDate);
      const timeIn = new Date(this.selectedDate);

      isTusday ? timeOut.setHours(13, 30, 0, 0) : timeOut.setHours(17, 0, 0, 0);
      timeIn.setHours(9, 0, 0, 0);

      let index = this.timing.findIndex((item) => item.start == this.selectedDate);

      this.check_Out_time = index == -1 ? timeOut : new Date(this.timing[index].out);
      this.check_In_time = index == -1 ? timeIn : new Date(this.timing[index].in);

      if (index != -1) {
        this.isDayOff = this.timing[index].isDayOff;
        this.isLate = this.timing[index].isLate;
        this.isEarlyLeave = this.timing[index].isEarlyLeave;
        this.earlyLeaveExcuse = this.timing[index].earlyLeaveExcuse;
        this.lateExcuse = this.timing[index].lateExcuse;
      }

      this.showDialog();
    }

    // Clear the calendar selection
    selectInfo.view.calendar.unselect();
  }

  setDefaultDayData() {

    const isTusday = new Date(this.selectedDate).getDay() === 4;
    const timeOut = new Date(this.selectedDate);
    const timeIn = new Date(this.selectedDate);
    isTusday ? timeOut.setHours(13, 30, 0, 0) : timeOut.setHours(17, 0, 0, 0);
    timeIn.setHours(9, 0, 0, 0);
    this.check_Out_time = timeOut;
    this.check_In_time = timeIn;
  }

  // Handle Day Off switch
  onDayOffChange() {
    if (this.isDayOff) {
      // Reset all time-related fields when day off is selected
      this.setDefaultDayData();
      this.isLate = false;
      this.isEarlyLeave = false;
      this.lateExcuse = false;
      this.earlyLeaveExcuse = false;
    }
  }

  // Validate Check-In Time
  validateCheckIn() {
    if (!this.check_In_time) return;
  // Standard work timings (can be configured)
    let standardCheckInTime: Date = new Date(2024, 0, 1, 9, 0); // 9:00 AM
    // Compare check-in time with standard check-in time
    const checkInHours = this.check_In_time.getHours();
    const checkInMinutes = this.check_In_time.getMinutes();
    const standardHours = standardCheckInTime.getHours();
    const standardMinutes = standardCheckInTime.getMinutes();

    this.isLate = (checkInHours > standardHours) || (checkInHours === standardHours && checkInMinutes > standardMinutes);
  }

  // Validate Check-Out Time
  validateCheckOut() {
    if (!this.check_Out_time) return;
    const isTusday = new Date(this.selectedDate).getDay() === 4;
    let standardCheckOutTime: Date =  isTusday ? new Date(2024, 0, 1, 13, 30) : new Date(2024, 0, 1, 17, 0); // 5:00 PM
    // Compare check-out time with standard check-out time
    const checkOutHours = this.check_Out_time.getHours();
    const checkOutMinutes = this.check_Out_time.getMinutes();
    const standardHours = standardCheckOutTime.getHours();
    const standardMinutes = standardCheckOutTime.getMinutes();

    this.isEarlyLeave = (checkOutHours < standardHours) || (checkOutHours === standardHours && checkOutMinutes < standardMinutes);
  }

  // Method to handle dialog submission
  onDialogSubmit() {

    // Perform submission logic here
    this.visible = false;


    if (!this.check_In_time || !this.check_Out_time) {
      console.error('Please select both check-in and check-out times');
      return;
    }

    // Get the calendar API from the ViewChild reference
    const calendarApi = this.calendarComponent?.getApi();

    if (!calendarApi) {
      console.error('Calendar API not available');
      return;
    }

    // Get formatted times
    const checkInTime = this.convertTime(this.check_In_time);
    const checkOutTime = this.convertTime(this.check_Out_time);
    // Add event to calendar

    calendarApi
      .getEvents()
      .filter((i) => i.startStr.split('T')[0] == this.selectedDate)
      .forEach((event) => event.remove());

    console.log(calendarApi.getEvents());

    if (this.isDayOff) {
      // add day off event to calender
      calendarApi.addEvent({
        id: createEventId(),
        title: 'dayOff',
        start: this.selectedDate,
      });
    } else {
      // add default check-in to calender
      calendarApi.addEvent({
        id: createEventId(),
        title: 'Check-in',
        start: `${this.selectedDate}T${checkInTime}`,
        color: this.isLate ? 'red' : 'default'
      });

      // add default check-out to calender
      calendarApi.addEvent({
        id: createEventId(),
        title: 'Check-out',
        start: `${this.selectedDate}T${checkOutTime}`,
        color: this.isEarlyLeave ? 'red' : 'default'
      });

      // add excuse event to calender
      if(this.earlyLeaveExcuse || this.lateExcuse) {
        calendarApi.addEvent({
          id: createEventId(),
          title: 'Excuse',
          start: this.selectedDate,
          backgroundColor: "red"
        });
      }

    }



    let index = this.timing.findIndex(
      (item) => item.start == this.selectedDate
    );

    // Add to timing array
    if (index == -1) {
      this.timing.push({
        id: createEventId(),
        title: 'Check-in Event',
        start: this.selectedDate,
        in: `${this.selectedDate}T${checkInTime}`,
        out: `${this.selectedDate}T${checkOutTime}`,
        isDayOff: this.isDayOff,
        isLate: this.isLate,
        isEarlyLeave: this.isEarlyLeave,
        lateExcuse: this.lateExcuse,
        earlyLeaveExcuse: this.earlyLeaveExcuse
      });
    } else {
      this.timing[index] = {
        id: createEventId(),
        title: 'Check-in Event',
        start: this.selectedDate,
        in: `${this.selectedDate}T${checkInTime}`,
        out: `${this.selectedDate}T${checkOutTime}`,
        isDayOff: this.isDayOff,
        isLate: this.isLate,
        isEarlyLeave: this.isEarlyLeave,
        lateExcuse: this.lateExcuse,
        earlyLeaveExcuse: this.earlyLeaveExcuse
      };
    }

    console.log(this.timing);


    // Close the dialog and reset times
    this.visible = false;
    this.resetFields();
  }

  // Utility method to convert time
  convertTime(time: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Helsinki',
      hour12: false,
    }).format(time);
  }

  // Other existing methods remain the same
  // handleEventClick(clickInfo: EventClickArg) {
  //   if (confirm(`Are you sure you want to delete the event '${clickInfo.event.title}'`)) {
  //     clickInfo.event.remove();
  //   }
  // }

  handleEvents(events: EventApi[]) {
    this.currentEvents = events;
    this.changeDetector.detectChanges();
  }
  cancelDialog() {
    this.visible = false;
    // Reset all fields
    this.resetFields();
  }

  // Reset all fields
  private resetFields() {
    this.isDayOff = false;
    this.isLate = false;
    this.isEarlyLeave = false;
    this.lateExcuse = false;
    this.earlyLeaveExcuse = false;

  }

  showDialog() {
    this.visible = true;
  }
}
