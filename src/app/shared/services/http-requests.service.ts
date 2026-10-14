import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  getDocs,
  orderBy,
  query,
  QuerySnapshot,
  setDoc,
  where,
  WithFieldValue,
} from '@angular/fire/firestore';
import { periodContaining } from '../utils/work-schedule';

@Injectable({
  providedIn: 'root',
})
export class HttpRequestsService {
  constructor(private firestore: Firestore) { }

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

  async saveDayEvent(userId: string, day: string, data: any): Promise<void> {
    try {
      const dayDocRef = doc(this.firestore, `users/${userId}/days/${day}`);
      await setDoc(dayDocRef, data, { merge: true });
      console.log(`Data for ${day} saved successfully!`);
    } catch (error) {
      console.error(`Error saving data for ${day}:`, error);
      throw error;
    }
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

}
