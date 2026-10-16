import { Injectable } from '@angular/core';
import { TimeEntry } from '../models';
import { must, SupabaseService, withTimestamps } from './supabase.service';

/** "HH:mm" → minutes since midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Length of an entry in minutes; a running entry counts up to `now` (HH:mm) when given. */
export function entryMinutes(entry: TimeEntry, now?: string): number {
  const end = entry.end || now;
  return end ? Math.max(0, minutesOf(end) - minutesOf(entry.start)) : 0;
}

function entryFromRow(row: any): TimeEntry {
  const { userId, ...entry } = row;
  return withTimestamps<TimeEntry>(entry, ['createdAt', 'updatedAt']);
}

// The signed-in person's private task log (time_entries). Row-level security lets only the owner
// read or write it, so these calls always act on the current user.
@Injectable({
  providedIn: 'root',
})
export class TimeEntryService {
  constructor(private supabase: SupabaseService) { }

  private get uid(): string {
    const uid = this.supabase.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    return uid;
  }

  private get entries() {
    return this.supabase.client.from('time_entries');
  }

  /** Entries from `from` to `to` (YYYY-MM-DD, inclusive), oldest first. */
  async getRange(from: string, to: string): Promise<TimeEntry[]> {
    const rows = must(
      await this.entries.select('*').eq('userId', this.uid).gte('date', from).lte('date', to).order('date').order('start')
    );
    return rows.map(entryFromRow);
  }

  /** The entry whose timer is still running, if any. */
  async getRunning(): Promise<TimeEntry | null> {
    const rows = must(await this.entries.select('*').eq('userId', this.uid).eq('end', '').limit(1));
    return rows[0] ? entryFromRow(rows[0]) : null;
  }

  async add(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const row = must(await this.entries.insert({ ...entry, userId: this.uid }).select('id').single());
    return row.id;
  }

  async update(id: string, changes: Partial<Omit<TimeEntry, 'id' | 'createdAt'>>) {
    must(await this.entries.update({ ...changes, updatedAt: new Date().toISOString() }).eq('id', id));
  }

  async remove(id: string) {
    must(await this.entries.delete().eq('id', id));
  }
}
