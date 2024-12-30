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
import { HttpRequestsService } from '../../services/http-requests.service';
import { title } from 'process';
import { UserService } from '../../services/user.service';
import { LoaderComponent } from "../../loader/loader.component";

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
    LoaderComponent
],
  templateUrl: './fullcalendar.component.html',
  styleUrl: './fullcalendar.component.scss',
  standalone: true,
})
export class FullcalendarComponent {
  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;
  isLoading = false;
  userId: any;
  check_In_time: Date | null = null;
  check_Out_time: Date | null = null;
  checked: boolean = false;
  checked2: boolean = false;
  selectedDate: string = '';
  calendarVisible = true;
  visible: boolean = false;
  isBrowser: boolean;

  nationalDays: any[] = [];

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
    events: async (info, successCallback, failureCallback) => {
      try {
        const fridayEvents = this.generateFridays(info.start, info.end);

        // Then, get the national holidays events asynchronously
        const nationalDays = await this.getNationalDays();  // Wait for the holidays to load
        console.log("Holidays", nationalDays);

        const userEvents = this.getUserEvents();

        // Combine both the Friday and national days events
        const events = [...fridayEvents, ...nationalDays, ...userEvents];

        successCallback(events);

      } catch (error: any) {
        // Handle error if any
        failureCallback(error);
      }

    },
  };

  currentEvents: EventApi[] = [];

  constructor(
    private changeDetector: ChangeDetectorRef,
    private httpRequestsService: HttpRequestsService,
    private userService: UserService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit() {
    this.isLoading = true;
    const userData = localStorage.getItem('user');
    if (userData) {
      this.userId = JSON.parse(userData).id;
      this.httpRequestsService.getUserDays(this.userId).then((res: any) => {
        this.timing = res;
        console.log("User Days", this.timing);
        this.isLoading = false;
      }).catch(err=> {
        console.log("Something went wrong.", err);
        this.isLoading = false;
      })
    }
  }

  getUserEvents() {
    const events: any[] = [];
    this.timing.forEach(day => {
      if (day.isDayOff) {
        // add day off event to calender
        events.push({
          id: day.id,
          title: 'dayOff',
          start: day.start,
        });
      } else {
        // add default check-in to calender
        events.push({
          id: day.id + 'IN',
          title: 'Check-in',
          start: day.in,
          color: day.isLate ? 'red' : 'default'
        });

        // add default check-out to calender
        events.push({
          id: day.id + 'OUT',
          title: 'Check-out',
          start: day.out,
          color: day.isEarlyLeave ? 'red' : 'default'
        });

        // add excuse event to calender
        if (day.earlyLeaveExcuse || day.lateExcuse) {
          events.push({
            id: day.id + 'Excuse',
            title: 'Excuse',
            start: day.start,
            backgroundColor: "red"
          });
        }

      }

    })
    return events;
  }

  getNationalDays(): Promise<any[]> {
    const events: any[] = [];
    return this.httpRequestsService.getHolidays().then((holidays) => {

      this.nationalDays = holidays.map((item: any) => {
        return {
          date: item.date.toDate(), // Assuming item.date is a Firestore Timestamp object
          name: item.name,
          type: item.tags,
          id: item.id,
        };
      });



      // Loop through nationalDays and create events for the calendar
      this.nationalDays.forEach((day: any) => {
        events.push({
          start: day.date.getFullYear().toString() + (day.date.getMonth()+1).toString().padStart(2, '0') + day.date.getDate().toString().padStart(2, '0'), // Format as YYYY-MM-DD
          display: 'background',
          title: `${day.type}`,
        })
        events.push({
          start: day.date.getFullYear().toString() + (day.date.getMonth()+1).toString().padStart(2, '0') + day.date.getDate().toString().padStart(2, '0'),
          title: day.name,
          color: '#8fdf82',
          textColor: 'black',
        })
      })

      return events;
    }).catch((error) => {

      console.error('Error fetching users', error);
      return events;
    });
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

    const notNationalDay = this.nationalDays.findIndex((item) => this.compareDates(new Date(this.selectedDate), new Date(item.date)) == 0) == -1;

    if (!isFriday && notNationalDay && this.compareDates(new Date(this.selectedDate), new Date()) <= 0) {
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
    let standardCheckOutTime: Date = isTusday ? new Date(2024, 0, 1, 13, 30) : new Date(2024, 0, 1, 17, 0); // 5:00 PM
    // Compare check-out time with standard check-out time
    const checkOutHours = this.check_Out_time.getHours();
    const checkOutMinutes = this.check_Out_time.getMinutes();
    const standardHours = standardCheckOutTime.getHours();
    const standardMinutes = standardCheckOutTime.getMinutes();

    this.isEarlyLeave = (checkOutHours < standardHours) || (checkOutHours === standardHours && checkOutMinutes < standardMinutes);
  }

  // Method to handle dialog submission
  async onDialogSubmit() {

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

    calendarApi.getEvents().filter((i) => i.startStr.split('T')[0] == this.selectedDate).forEach((event) => event.remove());

    let eventID = createEventId();

    if (this.isDayOff) {
      // add day off event to calender
      calendarApi.addEvent({
        id: eventID,
        title: 'dayOff',
        start: this.selectedDate,
      });
    } else {
      // add default check-in to calender
      calendarApi.addEvent({
        id: eventID + 'IN',
        title: 'Check-in',
        start: `${this.selectedDate}T${checkInTime}`,
        color: this.isLate ? 'red' : 'default'
      });

      // add default check-out to calender
      calendarApi.addEvent({
        id: eventID + 'OUT',
        title: 'Check-out',
        start: `${this.selectedDate}T${checkOutTime}`,
        color: this.isEarlyLeave ? 'red' : 'default'
      });

      // add excuse event to calender
      if (this.earlyLeaveExcuse || this.lateExcuse) {
        calendarApi.addEvent({
          id: eventID + 'Excuse',
          title: 'Excuse',
          start: this.selectedDate,
          backgroundColor: "red"
        });
      }

    }

    let index = this.timing.findIndex((item) => item.start == this.selectedDate);

    // Add to timing array
    let eventData = {
      id: eventID,
      title: 'Day Event',
      start: this.selectedDate,
      in: `${this.selectedDate}T${checkInTime}`,
      out: `${this.selectedDate}T${checkOutTime}`,
      isDayOff: this.isDayOff,
      isLate: this.isLate,
      isEarlyLeave: this.isEarlyLeave,
      lateExcuse: this.lateExcuse,
      earlyLeaveExcuse: this.earlyLeaveExcuse
    };
    if (index == -1) {
      this.timing.push(eventData);
    } else {
      this.timing[index] = eventData;
    }

    try {
      console.log(this.userId);

      await this.httpRequestsService.saveDayEvent(this.userId, this.selectedDate, eventData);
      console.log('Event saved successfully!');
    } catch (error) {
      console.error('Error saving event:', error);
    }

    console.log("Timing List", this.timing);

    console.log("Events List", calendarApi.getEvents());


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
