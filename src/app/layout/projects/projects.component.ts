import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { OrgService } from '../../shared/services/org.service';
import { UserService } from '../../shared/services/user.service';
import { Project, PROJECT_COLORS, roleOf } from '../../shared/models';

type ProjectForm = Pick<Project, 'name' | 'client' | 'color'>;

// Shared project list. Everyone sees it; admins and project managers maintain it.
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputSwitchModule,
    InputTextModule,
    ToastModule,
    TooltipModule,
    LoaderComponent,
  ],
  providers: [MessageService],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  loading = true;
  saving = false;
  projects: Project[] = [];
  readonly colors = PROJECT_COLORS;

  canManage = false;
  isAdmin = false;
  showArchived = false;

  // Dialog: null when closed, editingId '' for a new project
  form: ProjectForm | null = null;
  editingId = '';

  private subscription?: Subscription;

  constructor(
    private org: OrgService,
    private userService: UserService,
    private messageService: MessageService
  ) { }

  ngOnInit() {
    this.subscription = this.userService.user$.subscribe((user) => {
      this.isAdmin = !!user?.isAdmin;
      this.canManage = this.isAdmin || roleOf(user) === 'pm';
    });
    this.load();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  private async load() {
    try {
      this.projects = await this.org.getProjects();
    } catch (error) {
      console.error('Error fetching projects', error);
      this.toast('error', 'Could not load projects', 'Please refresh the page.');
    } finally {
      this.loading = false;
    }
  }

  get visibleProjects(): Project[] {
    return this.showArchived ? this.projects : this.projects.filter((p) => p.active);
  }

  get archivedCount(): number {
    return this.projects.filter((p) => !p.active).length;
  }

  openNew() {
    this.editingId = '';
    this.form = { name: '', client: '', color: this.colors[this.projects.length % this.colors.length] };
  }

  openEdit(project: Project) {
    this.editingId = project.id!;
    this.form = { name: project.name, client: project.client, color: project.color };
  }

  async save() {
    if (!this.form) return;
    const form: ProjectForm = { ...this.form, name: this.form.name.trim(), client: this.form.client.trim() };
    if (!form.name) return;
    const duplicate = this.projects.some(
      (p) => p.id !== this.editingId && p.name.toLowerCase() === form.name.toLowerCase()
    );
    if (duplicate) {
      this.toast('warn', 'Project exists', `There is already a project called ${form.name}.`);
      return;
    }

    this.saving = true;
    try {
      if (this.editingId) {
        await this.org.updateProject(this.editingId, form);
      } else {
        await this.org.createProject(form);
      }
      this.toast('success', this.editingId ? 'Project updated' : 'Project added', form.name);
      this.form = null;
      await this.load();
    } catch (error) {
      console.error('Error saving project', error);
      this.toast('error', 'Could not save the project', 'Please try again.');
    } finally {
      this.saving = false;
    }
  }

  async setActive(project: Project, active: boolean) {
    try {
      await this.org.updateProject(project.id!, { active });
      project.active = active;
      this.toast('success', active ? 'Project restored' : 'Project archived', project.name);
    } catch (error) {
      console.error('Error archiving project', error);
      this.toast('error', 'Could not update the project', 'Please try again.');
    }
  }

  async remove(project: Project) {
    try {
      await this.org.deleteProject(project.id!);
      this.projects = this.projects.filter((p) => p.id !== project.id);
      this.toast('success', 'Project deleted', project.name);
    } catch (error) {
      console.error('Error deleting project', error);
      this.toast('error', 'Could not delete the project', 'Please try again.');
    }
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string) {
    this.messageService.add({ severity, summary, detail, life: 3500 });
  }
}
