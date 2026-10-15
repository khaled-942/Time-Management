import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  QuerySnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  WithFieldValue,
} from '@angular/fire/firestore';
import { periodContaining, periodKeyOfDay } from '../utils/work-schedule';
import { DayRecord } from '../models';
import { UserService } from './user.service';

export const PERIOD_LOCKED = 'PERIOD_LOCKED';

@Injectable({
  providedIn: 'root',
})
export class HttpRequestsService {
  constructor(private firestore: Firestore, private auth: Auth, private userService: UserService) { }

  async getAllUsers(): Promise<any> {
    const colRef = collection(this.firestore, 'users');
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(colRef);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  async getHolidays(): Promise<any> {
    const colRef = collection(this.firestore, 'holidays');
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(colRef);
    return querySnapshot.docs.map((doc) => {
      const data = doc.data();  // Get the document data
      const id = doc.id;         // Get the document ID
      return { id, ...data };
    });
  }

  // add a holiday
  async addHoliday(holiday: any): Promise<any> {
    try {
      const colRef = collection(this.firestore, 'holidays');
      return addDoc(colRef, holiday);
    } catch (error) {
      throw error;
    }
  }

  // Delete a holiday by its document ID
  async deleteHoliday(id: string): Promise<any> {
    const docRef = doc(this.firestore, 'holidays', id); // Get the document reference by ID
    try {
      await deleteDoc(docRef);  // Delete the document
      return { messege: `Holiday with ID ${id} has been deleted.`, id: id };
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }

  // Saves a day and records the change in the audit log.
  // Days in a locked payroll period can only be changed by admins (also enforced by firestore.rules).
  async saveDayEvent(userId: string, day: string, data: Partial<DayRecord>): Promise<void> {
    const actor = this.userService.current;
    if (!actor?.isAdmin && (await this.isPeriodLocked(periodKeyOfDay(day)))) {
      throw new Error(PERIOD_LOCKED);
    }

    try {
      const dayDocRef = doc(this.firestore, `users/${userId}/days/${day}`);
      const before = await getDoc(dayDocRef);
      await setDoc(dayDocRef, data, { merge: true });

      await addDoc(collection(this.firestore, 'auditLog'), {
        ownerId: userId,
        dayId: day,
        changedBy: this.auth.currentUser?.uid ?? '',
        changedByName: actor?.name ?? '',
        at: serverTimestamp(),
        before: before.exists() ? before.data() : null,
        after: data,
      });
    } catch (error) {
      console.error(`Error saving data for ${day}:`, error);
      throw error;
    }
  }

  async getDay(userId: string, day: string): Promise<DayRecord | null> {
    const snapshot = await getDoc(doc(this.firestore, `users/${userId}/days/${day}`));
    return snapshot.exists() ? (snapshot.data() as DayRecord) : null;
  }

  async isPeriodLocked(key: string): Promise<boolean> {
    const snapshot = await getDoc(doc(this.firestore, 'lockedPeriods', key));
    return snapshot.exists();
  }

  /** Holiday dates as "YYYY-MM-DD" strings. */
  async getHolidayDates(): Promise<string[]> {
    const holidays = await this.getHolidays();
    return holidays.map((h: any) => {
      const d: Date = h.date.toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }

  // Get all days for a specific user
  async getUserDays(userId: string): Promise<any> {
    const colRef = collection(this.firestore, `users/${userId}/days`);
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(colRef);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  // Get the days of the 11th → 10th reporting period that contains `date`
  async getUserMonthDays(userId: string, date: Date): Promise<any> {
    const period = periodContaining(date);
    return this.getUserDaysBetween(userId, period.startStr, period.endStr);
  }

  // Get days whose `start` ("YYYY-MM-DD") is within [startStr, endStr], both inclusive
  async getUserDaysBetween(userId: string, startStr: string, endStr: string): Promise<any> {
    const colRef = collection(this.firestore, `users/${userId}/days`);
    const daysQuery = query(colRef, orderBy('start'), where('start', '>=', startStr), where('start', '<=', endStr));
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(daysQuery);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  async getUserDaysOffDays(userId: string): Promise<any> {

    // console.log(startOfMonth, endOfMonth);
    const colRef = collection(this.firestore, `users/${userId}/days`);
    const daysQuery = query(colRef, where('dayOffType', '==', 0), where('isDayOff', '==', true));
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(daysQuery);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  async getUserProfile(userId: string): Promise<any> {
    try {
      const colRef = collection(this.firestore, 'users');
      const userQuery = query(colRef, where('userId', '==', userId));
      const querySnapshot = await getDocs(userQuery);

      if (querySnapshot.empty) {
        throw new Error('User not found');
      }

      return querySnapshot.docs[0].data();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  // The monthly salary is private to its owner: users/{uid}/private/salary, which admins can't read.
  // Older accounts kept it on the profile (readable by admins); it is moved on the owner's first read.
  async getSalary(userId: string): Promise<number | null> {
    const snapshot = await getDoc(doc(this.firestore, `users/${userId}/private/salary`));
    if (snapshot.exists()) {
      const salary = snapshot.data()['salary'];
      return typeof salary === 'number' ? salary : null;
    }

    const legacy = (await this.getUserProfile(userId))?.salary;
    if (typeof legacy !== 'number' || !legacy) return null;
    if (this.auth.currentUser?.uid === userId) {
      await this.setSalary(userId, legacy).catch((error) => console.error('Error moving salary:', error));
    }
    return legacy;
  }

  async setSalary(userId: string, salary: number): Promise<void> {
    await setDoc(doc(this.firestore, `users/${userId}/private/salary`), { salary, updatedAt: serverTimestamp() });
    // Drop the old copy from the profile so admins no longer see it
    await updateDoc(doc(this.firestore, `users/${userId}`), { salary: deleteField() });
  }

}
