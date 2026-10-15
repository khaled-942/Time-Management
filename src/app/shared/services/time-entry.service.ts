import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { TimeEntry } from '../models';

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

// The signed-in person's private task log (users/{uid}/timeEntries). firestore.rules lets only
// the owner read or write it, so these calls always act on the current user.
@Injectable({
  providedIn: 'root',
})
export class TimeEntryService {
  constructor(private firestore: Firestore, private auth: Auth) { }

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('NOT_SIGNED_IN');
    return uid;
  }

  private get entries() {
    return collection(this.firestore, `users/${this.uid}/timeEntries`);
  }

  /** Entries from `from` to `to` (YYYY-MM-DD, inclusive), oldest first. */
  async getRange(from: string, to: string): Promise<TimeEntry[]> {
    const snapshot = await getDocs(query(this.entries, where('date', '>=', from), where('date', '<=', to)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as TimeEntry) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }

  /** The entry whose timer is still running, if any. */
  async getRunning(): Promise<TimeEntry | null> {
    const snapshot = await getDocs(query(this.entries, where('end', '==', '')));
    const doc = snapshot.docs[0];
    return doc ? { id: doc.id, ...(doc.data() as TimeEntry) } : null;
  }

  async add(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.entries, { ...entry, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }

  async update(id: string, changes: Partial<Omit<TimeEntry, 'id' | 'createdAt'>>) {
    await updateDoc(doc(this.entries, id), { ...changes, updatedAt: serverTimestamp() });
  }

  async remove(id: string) {
    await deleteDoc(doc(this.entries, id));
  }
}
