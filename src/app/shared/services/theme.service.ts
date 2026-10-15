import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark';

// Light/dark mode. With nothing saved it follows the OS; a choice is saved in localStorage
// and applied as <html data-theme="..."> (index.html applies it before first paint).
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly storageKey = 'theme';
  private modeSubject = new BehaviorSubject<ThemeMode>('light');
  /** The theme currently shown (resolved from the saved choice or the OS setting). */
  mode$ = this.modeSubject.asObservable();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private document: Document
  ) {
    if (!isPlatformBrowser(this.platformId)) return;

    this.modeSubject.next(this.resolve());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!this.saved()) this.modeSubject.next(this.resolve());
    });
  }

  get mode(): ThemeMode {
    return this.modeSubject.value;
  }

  toggle() {
    this.set(this.mode === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode) {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.storageKey, mode);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page only
    }
    this.document.documentElement.setAttribute('data-theme', mode);
    this.syncThemeColor();
    this.modeSubject.next(mode);
  }

  // Colours the browser / installed-app bar with the page background
  private syncThemeColor() {
    const background = getComputedStyle(this.document.documentElement).getPropertyValue('--background').trim();
    if (!background) return;
    this.document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', background));
  }

  private saved(): ThemeMode | null {
    try {
      const value = localStorage.getItem(this.storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private resolve(): ThemeMode {
    return this.saved() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
}
