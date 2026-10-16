import { Injectable } from '@angular/core';
import { DirectoryEntry, roleOf, UserProfile } from '../models';
import { must, SupabaseService } from './supabase.service';

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

// Public names/avatars/roles/teams so people can see who's on a task without reading each
// other's private profiles. `directory` is a database view over users, so it's always current.
@Injectable({
  providedIn: 'root',
})
export class DirectoryService {
  constructor(private supabase: SupabaseService) { }

  async getAll(): Promise<DirectoryEntry[]> {
    const rows = must(await this.supabase.client.from('directory').select('*'));
    return (rows as DirectoryEntry[]).sort((a, b) => a.name.localeCompare(b.name));
  }
}
