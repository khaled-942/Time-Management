import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Project, Role, Team, UserProfile } from '../models';

// Teams (admin-managed) and projects (admins and project managers).
@Injectable({
  providedIn: 'root',
})
export class OrgService {
  constructor(private firestore: Firestore, private auth: Auth) { }

  /* ---------- Teams ---------- */

  async getTeams(): Promise<Team[]> {
    const snapshot = await getDocs(collection(this.firestore, 'teams'));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Team) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTeam(name: string): Promise<string> {
    const ref = await addDoc(collection(this.firestore, 'teams'), { name, leaderId: '', createdAt: serverTimestamp() });
    return ref.id;
  }

  async renameTeam(teamId: string, name: string) {
    await updateDoc(doc(this.firestore, 'teams', teamId), { name });
  }

  /**
   * Save a person's access and place in the org in one batch, keeping teams consistent:
   * a leader leads exactly the team they're in, replacing (and demoting) its previous leader,
   * and leaving the leader role or the team frees the team's leader slot. PMs aren't in a team.
   */
  async saveMembership(
    user: UserProfile,
    changes: { role: Role; teamId: string; isAdmin?: boolean; active?: boolean },
    teams: Team[]
  ) {
    const teamId = changes.role === 'pm' ? '' : changes.teamId;
    if (changes.role === 'leader' && !teamId) throw new Error('LEADER_NEEDS_TEAM');

    const batch = writeBatch(this.firestore);
    const ledTeam = teams.find((t) => t.leaderId === user.userId);
    if (ledTeam && (changes.role !== 'leader' || ledTeam.id !== teamId)) {
      batch.update(doc(this.firestore, 'teams', ledTeam.id!), { leaderId: '' });
    }
    if (changes.role === 'leader') {
      const team = teams.find((t) => t.id === teamId)!;
      if (team.leaderId && team.leaderId !== user.userId) {
        batch.update(doc(this.firestore, 'users', team.leaderId), { role: 'member' });
      }
      batch.update(doc(this.firestore, 'teams', teamId), { leaderId: user.userId });
    }
    batch.update(doc(this.firestore, 'users', user.userId), { ...changes, teamId });
    await batch.commit();
  }

  /** Remove a team's leader; they stay in the team as a member. */
  async clearLeader(team: Team) {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'teams', team.id!), { leaderId: '' });
    if (team.leaderId) batch.update(doc(this.firestore, 'users', team.leaderId), { role: 'member' });
    await batch.commit();
  }

  /** Delete a team; its people keep their accounts but lose the team (leaders become members). */
  async deleteTeam(team: Team, people: UserProfile[]) {
    const batch = writeBatch(this.firestore);
    for (const person of people.filter((p) => p.teamId === team.id)) {
      batch.update(doc(this.firestore, 'users', person.userId), {
        teamId: '',
        ...(person.role === 'leader' ? { role: 'member' } : {}),
      });
    }
    batch.delete(doc(this.firestore, 'teams', team.id!));
    await batch.commit();
  }

  /* ---------- Projects ---------- */

  async getProjects(): Promise<Project[]> {
    const snapshot = await getDocs(collection(this.firestore, 'projects'));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Project) }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }

  async createProject(project: Pick<Project, 'name' | 'client' | 'color'>): Promise<string> {
    const ref = await addDoc(collection(this.firestore, 'projects'), {
      ...project,
      active: true,
      createdBy: this.auth.currentUser?.uid ?? '',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateProject(projectId: string, changes: Partial<Pick<Project, 'name' | 'client' | 'color' | 'active'>>) {
    await updateDoc(doc(this.firestore, 'projects', projectId), changes);
  }

  async deleteProject(projectId: string) {
    await deleteDoc(doc(this.firestore, 'projects', projectId));
  }
}
