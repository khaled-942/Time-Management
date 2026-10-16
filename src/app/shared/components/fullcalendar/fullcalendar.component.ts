import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import {
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import {
  CalendarOptions,
  EventApi,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import { createEventId } from './event-needs/event';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { InputSwitchModule } from 'primeng/inputswitch';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CalendarModule } from 'primeng/calendar';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { HttpRequestsService, PERIOD_LOCKED } from '../../services/http-requests.service';
import { UserService } from '../../services/user.service';
import { PayrollService } from '../../services/payroll.service';
import { LoaderComponent } from "../../loader/loader.component";
import { isFriday, parseLocalDate, periodKeyOfDay, scheduledEnd, toDateString, WORK_START } from '../../utils/work-schedule';
import { dayStatus, STATUS_LEGEND, timePart } from '../../utils/day-status';
import { DayOffType } from '../../models';

// Phones get a one-row toolbar, the view switch at the bottom and short entry labels
const MOBILE_QUERY = '(max-width: 640px)';
const DESKTOP_TOOLBARS = {
  headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
  footerToolbar: false as const,
};
const MOBILE_TOOLBARS = {
  headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
  footerToolbar: { left: '', center: 'dayGridMonth,listMonth', right: '' },
};
// Labels short enough for a phone-width day cell
const SHORT_DAY_OFF: Record<string, string> = { leave: 'Leave', absent: 'Absent', task: 'Task' };

@Component({
  selector: 'app-fullcalendar',
  imports: [
    CommonModule,
    FullCalendarModule,
    InputSwitchModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    DropdownModule,
    InputTextModule,
    CalendarModule,
    CheckboxModule,
    ToastModule,
    LoaderComponent
  ],
  providers: [MessageService],
  templateUrl: './fullcalendar.component.html',
  styleUrl: './fullcalendar.component.scss',
  standalone: true,
})
export class FullcalendarComponent implements OnDestroy {
  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;
  isLoading = false;
  isSaving = false;
  userId: any;
  check_In_time: Date | null = null;
  check_Out_time: Date | null = null;
  selectedDate: string = '';
  calendarVisible = true;
  visible: boolean = false;
  isBrowser: boolean;
  legend = STATUS_LEGEND;

  nationalDays: any[] = [];
  private nationalDaysLoaded?: Promise<void>;
  private lockedPeriods = new Set<string>();

  timing: any[] = [];
  // Resolves once the user's saved days are in `timing`, so calendar events never render without them
  private timingLoaded: Promise<void> = Promise.resolve();

  // Day Off
  isDayOff: boolean = false;
  dayOffName = '';
  dayOffTags = [
    { name: 'Paid leave', value: DayOffType.Paid },
    { name: 'Absent', value: DayOffType.Absent },
    { name: 'Task', value: DayOffType.Task },
  ];
  selectedTags: number = 0;

  // Late and Early Leave flags
  isLate: boolean = false;
  isEarlyLeave: boolean = false;

  // Excuses
  lateExcuse: boolean = false;
  earlyLeaveExcuse: boolean = false;

  calendarOptions: CalendarOptions = {
    plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin],
    ...DESKTOP_TOOLBARS,
    buttonText: { today: 'Today', month: 'Month', list: 'List' },
    initialView: 'dayGridMonth',
    weekends: true,
    editable: false,
    // dateClick (not select) so a normal tap opens a day on touch screens; select needs a long press there
    selectable: false,
    dayMaxEvents: true,
    height: 'auto',
    hiddenDays: [],
    firstDay: 6,
    dateClick: this.handleDateClick.bind(this),
    eventClick: this.handleEventClick.bind(this),
    eventContent: this.renderEventContent.bind(this),
    eventsSet: this.handleEvents.bind(this),
    events: async (info, successCallback, failureCallback) => {
      try {
        const fridayEvents = this.generateFridays(info.start, info.end);
        const nationalDays = await this.getNationalDays();
        await this.timingLoaded;
        successCallback([...fridayEvents, ...nationalDays, ...this.getUserEvents()]);
      } catch (error: any) {
        failureCallback(error);
      }
    },
  };

  currentEvents: EventApi[] = [];
  private mobileQuery?: MediaQueryList;
  private onMobileChange = (event: MediaQueryListEvent | MediaQueryList) => this.applyLayout(event.matches);

  constructor(
    private changeDetector: ChangeDetectorRef,
    private httpRequestsService: HttpRequestsService,
    private userService: UserService,
    private payroll: PayrollService,
    private messageService: MessageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.mobileQuery = window.matchMedia(MOBILE_QUERY);
      this.onMobileChange(this.mobileQuery);
      this.mobileQuery.addEventListener('change', this.onMobileChange);
    }
  }

  ngOnDestroy() {
    this.mobileQuery?.removeEventListener('change', this.onMobileChange);
  }

  private applyLayout(mobile: boolean) {
    this.calendarOptions = { ...this.calendarOptions, ...(mobile ? MOBILE_TOOLBARS : DESKTOP_TOOLBARS) };
  }

  // Full label plus a short one; CSS shows the short one on phones
  private renderEventContent(arg: EventContentArg) {
    if (arg.event.display === 'background') return undefined;
    const full = document.createElement('span');
    full.className = 'ev-full';
    full.textContent = arg.event.title;
    const short = document.createElement('span');
    short.className = 'ev-short';
    short.textContent = arg.event.extendedProps['short'] ?? arg.event.title;
    return { domNodes: [full, short] };
  }

  ngOnInit() {
    const userData = this.isBrowser ? localStorage.getItem('user') : null;
    if (!userData) return;

    this.isLoading = true;
    this.userId = JSON.parse(userData).id;
    this.timingLoaded = this.httpRequestsService.getUserDays(this.userId).then((res: any) => {
      this.timing = res;
    }).catch(err => {
      console.error('Error loading saved days:', err);
      this.toast('error', 'Could not load your days', 'Please refresh the page.');
    }).finally(() => {
      this.isLoading = false;
    });

    this.payroll.getLocks()
      .then((locks) => (this.lockedPeriods = new Set(locks.keys())))
      .catch((err) => console.error('Error loading locked periods:', err));
  }

  // One block per saved day, coloured by its status
  getUserEvents() {
    return this.timing.map((day) => {
      const status = dayStatus(day);
      const checkIn = timePart(day.in);
      const checkOut = timePart(day.out);
      const title = day.isDayOff ? status.label : checkOut ? `${checkIn} – ${checkOut}` : `In ${checkIn}`;
      return {
        id: day.id,
        title,
        start: day.start,
        allDay: true,
        classNames: ['day-block', `status-${status.key}`],
        extendedProps: { kind: 'day', status: status.label, short: day.isDayOff ? SHORT_DAY_OFF[status.key] : checkIn },
      };
    });
  }

  getNationalDays(): Promise<any[]> {
    this.nationalDaysLoaded ??= this.httpRequestsService.getHolidays().then((holidays) => {
      this.nationalDays = holidays.map((item: any) => ({
        date: item.date.toDate(), // Timestamp
        name: item.name,
        type: item.tags,
        id: item.id,
      }));
    }).catch((error) => {
      console.error('Error fetching holidays', error);
    });

    return this.nationalDaysLoaded.then(() =>
      this.nationalDays.flatMap((day: any) => {
        const start = toDateString(day.date);
        return [
          { start, display: 'background', classNames: ['holiday-bg'] },
          { start, title: day.name, allDay: true, classNames: ['holiday-block'], extendedProps: { kind: 'holiday' } },
        ];
      })
    );
  }

  // Background shading for Fridays (the weekly day off)
  generateFridays(start: Date, end: Date) {
    const events = [];
    for (let currentDate = new Date(start); currentDate < end; currentDate.setDate(currentDate.getDate() + 1)) {
      if (isFriday(currentDate)) {
        events.push({
          start: toDateString(currentDate), // Local YYYY-MM-DD
          display: 'background',
          classNames: ['friday-bg'],
        });
      }
    }
    return events;
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

  handleDateClick(info: DateClickArg) {
    this.openDay(info.dateStr);
  }

  handleEventClick(info: EventClickArg) {
    if (info.event.extendedProps['kind'] === 'day') {
      this.openDay(info.event.startStr.split('T')[0]);
    }
  }

  get selectedDateLabel(): string {
    return this.selectedDate
      ? parseLocalDate(this.selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      : '';
  }

  // Open the edit dialog for a day, or explain why that day can't be edited
  private openDay(date: string) {
    const selected = parseLocalDate(date);
    const isNationalDay = this.nationalDays.some((item) => this.compareDates(new Date(selected), new Date(item.date)) == 0);

    if (isFriday(selected)) {
      this.toast('info', 'Friday is the weekly day off', 'There is nothing to record on Fridays.');
      return;
    }
    if (isNationalDay) {
      this.toast('info', 'National holiday', 'Holidays are days off for everyone.');
      return;
    }
    if (this.compareDates(new Date(selected), new Date()) > 0) {
      this.toast('info', 'That day is in the future', 'You can only record today or earlier.');
      return;
    }
    if (!this.userService.current?.isAdmin && this.lockedPeriods.has(periodKeyOfDay(date))) {
      this.toast('warn', 'This payroll period is closed', 'Ask an admin if this day needs a correction.');
      return;
    }

    this.selectedDate = date;
    this.resetFields();
    const { timeIn, timeOut } = this.scheduledTimes();
    const saved = this.timing.find((item) => item.start == this.selectedDate);

    this.check_In_time = saved?.in ? new Date(saved.in) : timeIn;
    this.check_Out_time = saved?.out ? new Date(saved.out) : timeOut;

    if (saved) {
      this.isDayOff = saved.isDayOff;
      if (this.isDayOff) this.selectedTags = saved.dayOffType;
      this.isLate = !!saved.isLate;
      this.isEarlyLeave = !!saved.isEarlyLeave;
      this.earlyLeaveExcuse = !!saved.earlyLeaveExcuse;
      this.lateExcuse = !!saved.lateExcuse;
    } else {
      this.validateCheckIn();
      this.validateCheckOut();
    }

    this.showDialog();
  }

  // Default check-in/out for the selected day (09:00 → 17:00, or 13:30 on the short day)
  private scheduledTimes(): { timeIn: Date; timeOut: Date } {
    const timeIn = parseLocalDate(this.selectedDate);
    const timeOut = parseLocalDate(this.selectedDate);
    const end = scheduledEnd(timeOut);
    timeIn.setHours(WORK_START.hours, WORK_START.minutes, 0, 0);
    timeOut.setHours(end.hours, end.minutes, 0, 0);
    return { timeIn, timeOut };
  }

  setDefaultDayData() {
    const { timeIn, timeOut } = this.scheduledTimes();
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
    const checkInMinutes = this.check_In_time.getHours() * 60 + this.check_In_time.getMinutes();
    this.isLate = checkInMinutes > WORK_START.hours * 60 + WORK_START.minutes;
    if (!this.isLate) this.lateExcuse = false;
  }

  // Validate Check-Out Time
  validateCheckOut() {
    if (!this.check_Out_time) return;
    const end = scheduledEnd(parseLocalDate(this.selectedDate));
    const checkOutMinutes = this.check_Out_time.getHours() * 60 + this.check_Out_time.getMinutes();
    this.isEarlyLeave = checkOutMinutes < end.hours * 60 + end.minutes;
    if (!this.isEarlyLeave) this.earlyLeaveExcuse = false;
  }

  // Method to handle dialog submission
  async onDialogSubmit() {
    if (!this.check_In_time || !this.check_Out_time) {
      this.toast('warn', 'Missing times', 'Please set both check-in and check-out.');
      return;
    }
    if (!this.isDayOff && this.check_Out_time <= this.check_In_time) {
      this.toast('warn', 'Check-out is before check-in', 'Please correct the times.');
      return;
    }

    const checkInTime = this.convertTime(this.check_In_time);
    const checkOutTime = this.convertTime(this.check_Out_time);
    const existing = this.timing.find((item) => item.start == this.selectedDate);

    const eventData: any = {
      id: existing?.id ?? createEventId(),
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
    if (this.isDayOff) {
      eventData.dayOffType = this.selectedTags;
    }

    this.isSaving = true;
    try {
      await this.httpRequestsService.saveDayEvent(this.userId, this.selectedDate, eventData);
    } catch (error: any) {
      // Keep the dialog open so nothing typed is lost
      this.toast(
        'error',
        'Day not saved',
        error?.message === PERIOD_LOCKED ? 'This payroll period is closed.' : 'Please check your connection and try again.'
      );
      return;
    } finally {
      this.isSaving = false;
    }

    const index = this.timing.findIndex((item) => item.start == this.selectedDate);
    if (index == -1) {
      this.timing.push(eventData);
    } else {
      this.timing[index] = { ...this.timing[index], ...eventData };
    }
    this.calendarComponent?.getApi().refetchEvents();
    this.toast('success', 'Day saved', this.selectedDateLabel);

    this.visible = false;
    this.resetFields();
  }

  // Utility method to convert time
  convertTime(time: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
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
    this.selectedTags = 0;
    this.isLate = false;
    this.isEarlyLeave = false;
    this.lateExcuse = false;
    this.earlyLeaveExcuse = false;
  }

  showDialog() {
    this.visible = true;
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
