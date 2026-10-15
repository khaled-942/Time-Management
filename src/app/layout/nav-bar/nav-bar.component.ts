import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { TooltipModule } from 'primeng/tooltip';
import { filter, Subscription } from 'rxjs';
import { UserService } from '../../shared/services/user.service';
import { ThemeService } from '../../shared/services/theme.service';
import { NotificationService } from '../../shared/services/notification.service';
import { HttpRequestsService } from '../../shared/services/http-requests.service';
import { AppNotification } from '../../shared/models';
import { parseLocalDate, scheduledEnd, toDateString } from '../../shared/utils/work-schedule';

const PAGE_TITLES: Record<string, [section: string, title: string]> = {
  dashboard: ['Dashboard', 'Overview'],
  home: ['Dashboard', 'Calendar'],
  leave: ['Dashboard', 'Leave Requests'],
  board: ['Work', 'Board'],
  'my-tasks': ['Work', 'My Tasks'],
  projects: ['Work', 'Projects'],
  'nation-days': ['Company', 'National Days'],
  admin: ['Management', 'Admin'],
  profile: ['Account', 'Profile'],
};

@Component({
  selector: 'appNavbar',
  imports: [CommonModule, RouterModule, OverlayPanelModule, TooltipModule],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.scss',
  standalone: true,
})
export class NavBarComponent implements OnInit, OnDestroy {
  @Output() menuToggle = new EventEmitter<void>();

  user: any = null;
  section = 'Dashboard';
  title = 'Overview';
  notifications: AppNotification[] = [];
  /** Not stored: shown while today is checked in but not checked out after the scheduled end. */
  checkoutReminder = false;
  private subscriptions = new Subscription();
  private startedFor = '';

  constructor(
    private router: Router,
    private userService: UserService,
    public theme: ThemeService,
    public notificationService: NotificationService,
    private http: HttpRequestsService
  ) { }

  ngOnInit(): void {
    this.updateTitle(this.router.url);
    this.subscriptions.add(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e) => this.updateTitle(e.urlAfterRedirects))
    );

    this.subscriptions.add(
      this.userService.user$.subscribe((user) => {
        this.user = user; // Update user when the value is emitted
        const key = user?.userId ? `${user.userId}:${!!user.isAdmin}` : '';
        if (key === this.startedFor) return;
        this.startedFor = key;
        if (user?.userId) {
          this.notificationService.start(user.userId, !!user.isAdmin);
          this.refreshReminder();
        } else {
          this.notificationService.stop();
        }
      })
    );

    this.subscriptions.add(this.notificationService.notifications$.subscribe((list) => (this.notifications = list)));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get unreadCount(): number {
    return this.notifications.filter((n) => !this.notificationService.isRead(n)).length + (this.checkoutReminder ? 1 : 0);
  }

  isRead(n: AppNotification) {
    return this.notificationService.isRead(n);
  }

  async refreshReminder() {
    if (!this.user?.userId) return;
    const today = toDateString(new Date());
    try {
      const day = await this.http.getDay(this.user.userId, today);
      const end = scheduledEnd(parseLocalDate(today));
      const now = new Date();
      const pastEnd = now.getHours() * 60 + now.getMinutes() >= end.hours * 60 + end.minutes;
      this.checkoutReminder = !!day?.in && !day.out && !day.isDayOff && pastEnd;
    } catch {
      this.checkoutReminder = false;
    }
  }

  open(n: AppNotification, panel: { hide: () => void }) {
    this.notificationService.markRead(n);
    if (n.link) {
      panel.hide();
      this.router.navigateByUrl(n.link);
    }
  }

  markAllRead() {
    this.notificationService.markAllRead();
  }

  goToDashboard(panel: { hide: () => void }) {
    panel.hide();
    this.router.navigate(['/dashboard']);
  }

  timeAgo(n: AppNotification): string {
    const ms = n.createdAt?.toMillis ? Date.now() - n.createdAt.toMillis() : 0;
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  private updateTitle(url: string) {
    const segment = url.split('?')[0].split('/')[1] ?? '';
    [this.section, this.title] = PAGE_TITLES[segment] ?? ['Dashboard', 'Overview'];
  }
}
