import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { LoaderComponent } from '../../shared/loader/loader.component';
import { DirectoryService } from '../../shared/services/directory.service';
import { OrgService } from '../../shared/services/org.service';
import { TaskService } from '../../shared/services/task.service';
import { UserService } from '../../shared/services/user.service';
import { DirectoryEntry, Project, PROJECT_COLORS, roleOf, Task, TASK_STATUSES, TaskStatus, UserProfile } from '../../shared/models';
import { managesAll } from '../../shared/utils/task-access';

type ProjectForm = Pick<Project, 'name' | 'client' | 'color'>;

// Shared project list. Everyone sees it; admins and project managers maintain it. Each project
// opens a list of its board tasks (the ones the viewer may see), with who created and who has them.
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    DialogModule,
    DropdownModule,
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

  // Board tasks, live, grouped by project
  tasks: Task[] = [];
  tasksLoaded = false;
  seesAllTasks = false;
  private peopleById = new Map<string, DirectoryEntry>();
  // Tasks dialog
  viewing: Project | null = null;
  showArchivedTasks = false;
  statusFilter: TaskStatus | '' = '';
  readonly statusOptions = [{ label: 'Any status', value: '' }, ...TASK_STATUSES.map((s) => ({ label: s.label, value: s.value }))];

  private subscription?: Subscription;
  private unwatch?: () => void;
  private watching = '';

  constructor(
    private org: OrgService,
    private userService: UserService,
    private tasksService: TaskService,
    private directory: DirectoryService,
    private messageService: MessageService
  ) { }

  ngOnInit() {
    this.subscription = this.userService.user$.subscribe((user: UserProfile | null) => {
      this.isAdmin = !!user?.isAdmin;
      this.canManage = this.isAdmin || roleOf(user) === 'pm';
      this.watchTasks(user);
    });
    this.load();
    this.directory
      .getAll()
      .then((people) => (this.peopleById = new Map(people.map((p) => [p.userId, p]))))
      .catch((error) => console.error('Error loading people', error));
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.unwatch?.();
  }

  private watchTasks(user: UserProfile | null) {
    if (!user?.userId) return;
    const key = `${user.userId}|${user.isAdmin}|${user.role}|${user.teamId}`;
    if (key === this.watching) return;
    this.watching = key;
    this.seesAllTasks = managesAll(user);
    this.unwatch?.();
    this.unwatch = this.tasksService.watch(
      user,
      (tasks) => {
        this.tasks = tasks;
        this.tasksLoaded = true;
      },
      (error) => {
        console.error('Error loading tasks', error);
        this.tasksLoaded = true;
      }
    );
  }

  /* ---------- Project tasks ---------- */

  /** Open / done counts for a project card (archived tasks left out). */
  taskCounts(project: Project): { open: number; done: number } {
    const tasks = this.tasks.filter((t) => t.projectId === project.id && !t.archived);
    const done = tasks.filter((t) => t.status === 'done').length;
    return { open: tasks.length - done, done };
  }

  openTasks(project: Project) {
    this.viewing = project;
    this.statusFilter = '';
    this.showArchivedTasks = false;
  }

  get projectTasks(): Task[] {
    const id = this.viewing?.id;
    if (!id) return [];
    const order = TASK_STATUSES.map((s) => s.value);
    return this.tasks
      .filter((t) => t.projectId === id)
      .filter((t) => this.showArchivedTasks || !t.archived)
      .filter((t) => !this.statusFilter || t.status === this.statusFilter)
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.order - b.order);
  }

  get archivedTaskCount(): number {
    return this.tasks.filter((t) => t.projectId === this.viewing?.id && t.archived).length;
  }

  statusLabel(status: TaskStatus): string {
    return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
  }

  statusTone(status: TaskStatus): string {
    return { done: 'success', review: 'warning', changes: 'danger', in_progress: 'info' }[status as string] ?? '';
  }

  person(id: string): DirectoryEntry | undefined {
    return this.peopleById.get(id);
  }

  parentTitle(task: Task): string {
    return task.parentId ? this.tasks.find((t) => t.id === task.parentId)?.title ?? '' : '';
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
