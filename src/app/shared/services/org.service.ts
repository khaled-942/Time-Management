import { Injectable } from '@angular/core';
import { Project, Role, Team, UserProfile } from '../models';
import { must, SupabaseService, withTimestamps } from './supabase.service';

// Teams (admin-managed) and projects (admins and project managers).
@Injectable({
  providedIn: 'root',
})
export class OrgService {
  constructor(private supabase: SupabaseService) { }

  private get db() {
    return this.supabase.client;
  }

  /* ---------- Teams ---------- */

  async getTeams(): Promise<Team[]> {
    const rows = must(await this.db.from('teams').select('*'));
    return rows.map((r) => withTimestamps<Team>(r, ['createdAt'])).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTeam(name: string): Promise<string> {
    return must(await this.db.from('teams').insert({ name, leaderId: '' }).select('id').single()).id;
  }

  async renameTeam(teamId: string, name: string) {
    must(await this.db.from('teams').update({ name }).eq('id', teamId));
  }

  /**
   * Save a person's access and place in the org atomically (save_membership in the database),
   * keeping teams consistent: a leader leads exactly the team they're in, replacing (and demoting)
   * its previous leader, and leaving the leader role or the team frees the team's leader slot.
   * PMs aren't in a team.
   */
  async saveMembership(
    user: UserProfile,
    changes: { role: Role; teamId: string; isAdmin?: boolean; active?: boolean },
    _teams: Team[]
  ) {
    const teamId = changes.role === 'pm' ? '' : changes.teamId;
    if (changes.role === 'leader' && !teamId) throw new Error('LEADER_NEEDS_TEAM');
    must(
      await this.db.rpc('save_membership', {
        p_user: user.userId,
        p_role: changes.role,
        p_team: teamId,
        p_is_admin: changes.isAdmin ?? null,
        p_active: changes.active ?? null,
      })
    );
  }

  /** Remove a team's leader; they stay in the team as a member. */
  async clearLeader(team: Team) {
    must(await this.db.rpc('clear_leader', { p_team: team.id }));
  }

  /** Delete a team; its people keep their accounts but lose the team (leaders become members). */
  async deleteTeam(team: Team, _people: UserProfile[]) {
    must(await this.db.rpc('delete_team', { p_team: team.id }));
  }

  /* ---------- Projects ---------- */

  async getProjects(): Promise<Project[]> {
    const rows = must(await this.db.from('projects').select('*'));
    return rows
      .map((r) => withTimestamps<Project>(r, ['createdAt']))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }

  async createProject(project: Pick<Project, 'name' | 'client' | 'color'>): Promise<string> {
    const row = must(
      await this.db
        .from('projects')
        .insert({ ...project, active: true, createdBy: this.supabase.uid })
        .select('id')
        .single()
    );
    return row.id;
  }

  async updateProject(projectId: string, changes: Partial<Pick<Project, 'name' | 'client' | 'color' | 'active'>>) {
    must(await this.db.from('projects').update(changes).eq('id', projectId));
  }

  async deleteProject(projectId: string) {
    must(await this.db.from('projects').delete().eq('id', projectId));
  }
}
