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
  QuerySnapshot,
  WithFieldValue,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class HttpRequestsService {
  constructor(private firestore: Firestore) {}

  async getAllUsers(): Promise<any> {
    const colRef = collection(this.firestore, 'users');
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(colRef);
    return querySnapshot.docs.map((doc) => doc.data());
  }

  async getHolidays(): Promise<any> {
    const colRef = collection(this.firestore, 'holidays');
    const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(colRef);
    return querySnapshot.docs.map((doc) =>{
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
    return {messege: `Holiday with ID ${id} has been deleted.`, id: id};
  } catch (error) {
    console.error('Error deleting document:', error);
  }
}

}
