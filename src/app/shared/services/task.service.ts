import { Injectable, NgZone } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  query,
  Query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Task, TaskStatus, UserProfile } from '../models';
import { managesAll } from '../utils/task-access';

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

// Team tasks (tasks/{id}), kept live with Firestore listeners.
@Injectable({
  providedIn: 'root',
})
export class TaskService {
  constructor(private firestore: Firestore, private zone: NgZone) { }

  private get tasks() {
    return collection(this.firestore, 'tasks');
  }

  /**
   * Live list of the tasks `me` may see. PMs and admins read everything; others read their
   * team's tasks plus anything they're assigned to or created. Each query matches a branch of
   * the read rule in firestore.rules, so Firestore can authorise it.
   */
  watch(me: UserProfile, onChange: (tasks: Task[]) => void, onError: (error: unknown) => void): Unsubscribe {
    const queries: Query[] = managesAll(me)
      ? [this.tasks]
      : [
          ...(me.teamId ? [query(this.tasks, where('teamIds', 'array-contains', me.teamId))] : []),
          query(this.tasks, where('assigneeIds', 'array-contains', me.userId)),
          query(this.tasks, where('createdBy', '==', me.userId)),
        ];

    const results: Task[][] = queries.map(() => []);
    const listeners = queries.map((q, i) =>
      onSnapshot(
        q,
        (snapshot) => {
          results[i] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Task) }));
          // The same task can match several queries
          const merged = new Map(results.flat().map((t) => [t.id!, t]));
          this.zone.run(() => onChange([...merged.values()]));
        },
        (error) => this.zone.run(() => onError(error))
      )
    );
    return () => listeners.forEach((unsubscribe) => unsubscribe());
  }

  async create(task: NewTask): Promise<string> {
    const ref = await addDoc(this.tasks, { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }

  async update(id: string, changes: Partial<NewTask>) {
    await updateDoc(doc(this.tasks, id), { ...changes, updatedAt: serverTimestamp() });
  }

  /** Move a card on the board. Requesting changes also records the reviewer's note. */
  async move(id: string, status: TaskStatus, order: number, reviewNote?: string) {
    await this.update(id, { status, order, ...(reviewNote !== undefined ? { reviewNote } : {}) });
  }

  async remove(id: string) {
    await deleteDoc(doc(this.tasks, id));
  }
}
