import { Injectable } from '@angular/core';
import { collection, doc, Firestore, getDocs, setDoc, writeBatch } from '@angular/fire/firestore';
import { distinctUntilChanged, filter, map } from 'rxjs';
import { DirectoryEntry, roleOf, UserProfile } from '../models';
import { UserService } from './user.service';

export function toDirectoryEntry(user: UserProfile): DirectoryEntry {
  return {
    userId: user.userId,
    name: user.name ?? '',
    avatar: user.currentAvatar ?? '',
    role: roleOf(user),
    teamId: user.teamId ?? '',
    active: user.active !== false,
  };
}

// Public names/avatars/roles/teams (directory/{uid}) so people can see who's on a task without
// reading each other's private profiles. Everyone keeps their own entry current on sign-in and
// profile edits; admins refresh all entries from the Admin page.
@Injectable({
  providedIn: 'root',
})
export class DirectoryService {
  private started = false;

  constructor(private firestore: Firestore, private userService: UserService) { }

  /** Keep the signed-in person's entry in step with their profile. Call once, in the browser. */
  start() {
    if (this.started) return;
    this.started = true;
    this.userService.user$
      .pipe(
        filter((user): user is UserProfile => !!user?.userId),
        map(toDirectoryEntry),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe((entry) => {
        setDoc(doc(this.firestore, 'directory', entry.userId), entry).catch((error) =>
          console.error('Error updating directory entry:', error)
        );
      });
  }

  async getAll(): Promise<DirectoryEntry[]> {
    const snapshot = await getDocs(collection(this.firestore, 'directory'));
    return snapshot.docs
      .map((d) => d.data() as DirectoryEntry)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Admin: rewrite every entry from the full profiles (covers people who haven't signed in since). */
  async syncAll(users: UserProfile[]) {
    const batch = writeBatch(this.firestore);
    for (const user of users) batch.set(doc(this.firestore, 'directory', user.userId), toDirectoryEntry(user));
    await batch.commit();
  }
}
