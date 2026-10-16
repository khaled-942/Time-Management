import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export type Unsubscribe = () => void;

/**
 * A point in time read from a timestamp column. Same shape as the Firestore Timestamp the app was
 * written against (`toDate()`, `toMillis()`), so templates and sorting work unchanged.
 */
export class Timestamp {
  constructor(private readonly ms: number) { }

  static from(value: unknown): Timestamp | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const ms = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
    return Number.isNaN(ms) ? undefined : new Timestamp(ms);
  }

  toDate(): Date {
    return new Date(this.ms);
  }

  toMillis(): number {
    return this.ms;
  }
}

/** Turn the given timestamp columns of a row into Timestamps. */
export function withTimestamps<T>(row: any, keys: string[]): T {
  const out = { ...row };
  for (const key of keys) if (key in out) out[key] = Timestamp.from(out[key]);
  return out as T;
}

/** Drop null columns, so a row looks like the document it replaced (missing field = undefined). */
export function withoutNulls<T>(row: any): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) as T;
}

/** Throw the error of a Supabase response, otherwise return its data. */
export function must<T>(response: { data: T; error: any }): NonNullable<T> {
  if (response.error) throw response.error;
  return response.data as NonNullable<T>;
}

/** Like must(), for single-row lookups (maybeSingle) that may find nothing. */
export function maybe<T = any>(response: { data: unknown; error: any }): T | null {
  if (response.error) throw response.error;
  return (response.data ?? null) as T | null;
}

// The one Supabase client (Auth + Postgres + Realtime). Access rules are row-level security
// policies in supabase/migrations, so every query only returns what the signed-in person may see.
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient;
  private session: Session | null = null;

  constructor(
    private zone: NgZone,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    const browser = isPlatformBrowser(platformId);
    this.client = createClient(environment.supabase.url, environment.supabase.anonKey, {
      auth: {
        persistSession: browser,
        autoRefreshToken: browser,
        detectSessionInUrl: browser,
      },
    });
    if (browser) this.client.auth.onAuthStateChange((_event, session) => (this.session = session));
  }

  /** The signed-in person's id ('' when signed out or before the session is restored). */
  get uid(): string {
    return this.session?.user.id ?? '';
  }

  /** Resolves once the stored session has been restored (null when signed out). */
  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    this.session = data.session;
    return data.session;
  }

  /**
   * Run `load` now and again whenever a row of `table` changes (Realtime). Rows the person may not
   * see never reach them: `load` goes through row-level security, the change only triggers it.
   */
  watch(table: string, load: () => Promise<void>, onError: (error: unknown) => void): Unsubscribe {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const run = () => {
      if (stopped) return;
      load().catch((error) => this.zone.run(() => onError(error)));
    };
    const channel = this.client
      .channel(`${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        // Several writes often land together (a task and its activity); reload once
        clearTimeout(timer);
        timer = setTimeout(run, 150);
      })
      .subscribe();
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      this.client.removeChannel(channel);
    };
  }
}
