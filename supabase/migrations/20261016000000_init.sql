-- Time Management schema: replaces Firestore. Column names are camelCase (quoted) so rows map
-- 1:1 onto the TypeScript models in src/app/shared/models.ts.
-- Access rules (formerly firestore.rules) are row-level security policies plus a few triggers
-- for "these columns may not change" checks that policies can't express.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

/* ===================================================================== tables */

create table public.users (
  "userId" uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  "currentAvatar" text not null default '',
  "isAdmin" boolean not null default false,
  active boolean not null default true,
  role text check (role in ('pm', 'leader', 'member')), -- null = member
  "teamId" text not null default '',
  position text,
  phone text,
  gender text,
  location text,
  bio text check (char_length(bio) <= 500),
  "birthDate" timestamptz,
  verified boolean not null default true,
  "createdAt" timestamptz not null default now()
);

-- Owner-only: salary and production report settings (admins can't read it)
create table public.user_private (
  "userId" uuid primary key references public.users ("userId") on delete cascade,
  salary numeric check (salary >= 0),
  organization text check (char_length(organization) <= 120),
  department text check (char_length(department) <= 80),
  assignments jsonb check (assignments is null or (jsonb_typeof(assignments) = 'array' and jsonb_array_length(assignments) <= 50)),
  "updatedAt" timestamptz not null default now()
);

-- Web Push subscriptions, one per device
create table public.push_subscriptions (
  endpoint text primary key,
  "userId" uuid not null references public.users ("userId") on delete cascade,
  subscription jsonb not null,
  "userAgent" text not null default '',
  "updatedAt" timestamptz not null default now()
);
create index on public.push_subscriptions ("userId");

create table public.teams (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  "leaderId" text not null default '',
  "createdAt" timestamptz not null default now()
);

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  client text not null default '',
  color text not null default '#3b82f6',
  active boolean not null default true,
  "createdBy" uuid not null,
  "createdAt" timestamptz not null default now()
);

-- One row per person per day; "dayId" is the YYYY-MM-DD key, "id" is the event id stored in the day
create table public.days (
  "userId" uuid not null references public.users ("userId") on delete cascade,
  "dayId" text not null check ("dayId" ~ '^\d{4}-\d{2}-\d{2}$'),
  id text,
  title text,
  start text not null,
  "in" text,
  "out" text,
  "isDayOff" boolean not null default false,
  "dayOffType" integer,
  "isLate" boolean,
  "isEarlyLeave" boolean,
  "lateExcuse" boolean,
  "earlyLeaveExcuse" boolean,
  "leaveRequestId" text,
  primary key ("userId", "dayId")
);
create index on public.days ("userId", start);

create table public.time_entries (
  id text primary key default gen_random_uuid()::text,
  "userId" uuid not null default auth.uid() references public.users ("userId") on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  "projectId" text not null default '',
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  start text not null check (start ~ '^\d{2}:\d{2}$'),
  "end" text not null default '' check ("end" = '' or ("end" ~ '^\d{2}:\d{2}$' and "end" > start)),
  note text not null default '' check (char_length(note) <= 1000),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index on public.time_entries ("userId", date);

create table public.holidays (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  name text not null,
  tags jsonb not null default '[]'
);

create table public."lockedPeriods" (
  key text primary key,
  "lockedBy" uuid,
  "lockedByName" text not null default '',
  "lockedAt" timestamptz not null default now()
);

create table public."auditLog" (
  id text primary key default gen_random_uuid()::text,
  "ownerId" uuid not null,
  "dayId" text not null,
  "changedBy" uuid not null,
  "changedByName" text not null default '',
  at timestamptz not null default now(),
  before jsonb,
  after jsonb not null
);
create index on public."auditLog" (at desc);

create table public."leaveRequests" (
  id text primary key default gen_random_uuid()::text,
  "userId" uuid not null,
  "userName" text not null default '',
  start text not null,
  "end" text not null,
  days integer not null,
  reason text not null default '',
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  "createdAt" timestamptz not null default now(),
  "decidedBy" uuid,
  "decidedByName" text,
  "decidedAt" timestamptz,
  "decisionNote" text
);
create index on public."leaveRequests" ("userId");

-- Either for one user ("userId") or for every admin (audience = 'admins'); "userId" is text so '' works
create table public.notifications (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null default '',
  audience text not null default '' check (audience in ('', 'admins')),
  title text not null,
  body text not null default '',
  link text,
  icon text,
  "createdAt" timestamptz not null default now(),
  "createdBy" text not null,
  "readBy" text[] not null default '{}',
  pushed boolean not null default false -- set by the send-push Edge Function
);
create index on public.notifications ("userId");
create index on public.notifications (audience);

create table public.tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  type text not null check (type in ('feature', 'bug', 'review_fixes', 'chore')),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null check (status in ('backlog', 'todo', 'in_progress', 'review', 'changes', 'done')),
  "order" double precision not null default 0,
  "projectId" text not null default '',
  "assigneeIds" text[] not null default '{}' check (cardinality("assigneeIds") <= 20),
  "teamIds" text[] not null default '{}' check (cardinality("teamIds") <= 10),
  "parentId" text not null default '',
  "createdBy" text not null,
  "createdByName" text not null default '',
  "dueDate" text not null default '',
  "estimateHours" double precision,
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 10),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 50),
  "reviewNote" text not null default '' check (char_length("reviewNote") <= 1000),
  subtasks jsonb not null default '{}',
  archived boolean not null default false,
  "archivedByName" text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index on public.tasks using gin ("teamIds");
create index on public.tasks using gin ("assigneeIds");
create index on public.tasks ("createdBy");

-- A task with logged time can't be deleted (restrict): archive it instead
create table public.work_logs (
  id text primary key default gen_random_uuid()::text,
  "taskId" text not null references public.tasks (id) on delete restrict,
  "taskTitle" text not null check (char_length("taskTitle") <= 200),
  "projectId" text not null default '',
  "userId" text not null,
  "userName" text not null default '' check (char_length("userName") <= 100),
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  hours double precision not null check (hours > 0 and hours <= 24),
  country text not null default '' check (char_length(country) <= 100),
  kind text not null default '' check (char_length(kind) <= 100),
  pages text not null default '' check (char_length(pages) <= 1000),
  note text not null default '' check (char_length(note) <= 1000),
  "createdAt" timestamptz not null default now()
);
create index on public.work_logs ("taskId", date desc);
create index on public.work_logs ("userId", date);

-- History of a task; deleted with it
create table public.task_activity (
  id text primary key default gen_random_uuid()::text,
  "taskId" text not null references public.tasks (id) on delete cascade,
  by text not null,
  "byName" text not null default '' check (char_length("byName") <= 100),
  icon text not null default '' check (char_length(icon) <= 60),
  text text not null check (char_length(text) <= 500),
  at timestamptz not null default now()
);
create index on public.task_activity ("taskId", at desc);

/* ===================================================================== helpers */
-- security definer so policies can read the caller's profile without recursing into users' RLS

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select "isAdmin" from public.users where "userId" = auth.uid()), false)
$$;

-- One role per person: 'pm', 'leader' or 'member' (null means member)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.users where "userId" = auth.uid()), 'member')
$$;

create or replace function public.my_team() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select "teamId" from public.users where "userId" = auth.uid()), '')
$$;

-- Deactivated people (active = false) can still read, but not write
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.users where "userId" = auth.uid()), false)
$$;

-- Admins and project managers see and manage every team task
create or replace function public.manages_all() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.my_role() = 'pm'
$$;

-- Who may see a task; mirrors shared/utils/task-access.ts
create or replace function public.can_see_task(team_ids text[], assignee_ids text[], created_by text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.manages_all()
    or (public.my_team() <> '' and public.my_team() = any (team_ids))
    or auth.uid()::text = any (assignee_ids)
    or created_by = auth.uid()::text)
$$;

create or replace function public.can_see_task_id(task_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_see_task(t."teamIds", t."assigneeIds", t."createdBy")
                     from public.tasks t where t.id = task_id), false)
$$;

-- Payroll period key ("YYYY-MM", named after the month of the 10th) for a "YYYY-MM-DD" day id
create or replace function public.period_key_of(day_id text) returns text
language sql immutable as $$
  select to_char(
    case when substr(day_id, 9, 2)::int > 10
      then date_trunc('month', day_id::date) + interval '1 month'
      else date_trunc('month', day_id::date) end,
    'YYYY-MM')
$$;

create or replace function public.period_locked(day_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public."lockedPeriods" where key = public.period_key_of(day_id))
$$;

/* ===================================================================== new accounts */

-- Every sign-up gets a profile; the very first account becomes the admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users ("userId", email, name, "currentAvatar", "isAdmin")
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'currentAvatar', ''),
    not exists (select 1 from public.users)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ===================================================================== column guards */
-- Trusted functions below (security definer) run as the table owner and skip these checks.

-- Users may edit their own profile, but never their admin flag, active flag, role, team or id
create or replace function public.guard_users_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if not public.is_admin() and (
    new."userId" is distinct from old."userId" or new."isAdmin" is distinct from old."isAdmin"
    or new.active is distinct from old.active or new.role is distinct from old.role
    or new."teamId" is distinct from old."teamId") then
    raise exception 'Only admins can change access, role or team' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_users_update before update on public.users
  for each row execute function public.guard_users_update();

-- The creator (a leader) edits freely but keeps the task in their team; assignees only move
-- unfinished tasks up to Need review, tick the checklist and record sub-task progress
create or replace function public.guard_tasks_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new."createdBy" is distinct from old."createdBy" then
    raise exception 'The creator of a task cannot change' using errcode = '42501';
  end if;
  if public.manages_all() then return new; end if;
  if old."createdBy" = auth.uid()::text and new."teamIds" = array[public.my_team()] then return new; end if;
  if auth.uid()::text = any (old."assigneeIds")
    and old.status <> 'done' and not old.archived
    and new.status in ('backlog', 'todo', 'in_progress', 'review')
    and (to_jsonb(new) - array['status', 'order', 'checklist', 'subtasks', 'updatedAt'])
      = (to_jsonb(old) - array['status', 'order', 'checklist', 'subtasks', 'updatedAt']) then
    return new;
  end if;
  raise exception 'Not allowed to change this task' using errcode = '42501';
end $$;
create trigger guard_tasks_update before update on public.tasks
  for each row execute function public.guard_tasks_update();

-- Owners may only cancel their own pending leave request; admins decide
create or replace function public.guard_leave_update() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_admin() then return new; end if;
  if old.status = 'pending' and new.status = 'cancelled'
    and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'Not allowed to change this request' using errcode = '42501';
end $$;
create trigger guard_leave_update before update on public."leaveRequests"
  for each row execute function public.guard_leave_update();

/* ===================================================================== RPCs */

-- Mark a notification read by the caller (readers may only add themselves to readBy)
create or replace function public.mark_notification_read(notification_id text) returns void
language sql security definer set search_path = public as $$
  update public.notifications
     set "readBy" = array_append("readBy", auth.uid()::text)
   where id = notification_id
     and not (auth.uid()::text = any ("readBy"))
     and ("userId" = auth.uid()::text or (audience = 'admins' and public.is_admin()))
$$;

/*
 * Record a sub-task's state on its parent (done null = removed). When every sub-task is done the
 * parent moves to Need review; returns the parent (as it was) in that case so the app can tell its
 * reviewer. Runs as definer so whoever moves a sub-task (who may not be on the parent) can update the map.
 */
create or replace function public.sync_parent(parent_id text, subtask_id text, done boolean)
returns setof public.tasks
language plpgsql security definer set search_path = public as $$
declare
  parent public.tasks;
  sub public.tasks;
  map jsonb;
  all_done boolean;
begin
  select * into sub from public.tasks where id = subtask_id;
  if found then
    if sub."parentId" <> parent_id or not public.can_see_task(sub."teamIds", sub."assigneeIds", sub."createdBy") then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif done is not null or not public.can_see_task_id(parent_id) then
    return; -- a removed sub-task: only someone who sees the parent may drop it from the map
  end if;

  select * into parent from public.tasks where id = parent_id for update;
  if not found then return; end if;

  map := case when done is null then parent.subtasks - subtask_id
              else jsonb_set(parent.subtasks, array[subtask_id], to_jsonb(done)) end;
  select count(*) > 0 and coalesce(bool_and(value::boolean), false) into all_done from jsonb_each_text(map);

  if all_done and parent.status not in ('review', 'done') then
    -- epoch milliseconds sort after the board's usual values, so the parent lands at the end of Need review
    update public.tasks set subtasks = map, status = 'review',
      "order" = extract(epoch from now()) * 1000, "updatedAt" = now()
     where id = parent_id;
    return next parent;
    return;
  end if;
  update public.tasks set subtasks = map, "updatedAt" = now() where id = parent_id;
end $$;

-- Admin: save someone's access and place in the org atomically, keeping teams consistent:
-- a leader leads exactly the team they're in, replacing (and demoting) its previous leader
create or replace function public.save_membership(
  p_user uuid, p_role text, p_team text, p_is_admin boolean default null, p_active boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  team_id text := case when p_role = 'pm' then '' else coalesce(p_team, '') end;
  previous_leader text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_role = 'leader' and team_id = '' then raise exception 'LEADER_NEEDS_TEAM'; end if;

  update public.teams set "leaderId" = ''
   where "leaderId" = p_user::text and (p_role <> 'leader' or id <> team_id);

  if p_role = 'leader' then
    select "leaderId" into previous_leader from public.teams where id = team_id;
    if previous_leader <> '' and previous_leader <> p_user::text then
      update public.users set role = 'member' where "userId" = previous_leader::uuid;
    end if;
    update public.teams set "leaderId" = p_user::text where id = team_id;
  end if;

  update public.users
     set role = p_role, "teamId" = team_id,
         "isAdmin" = coalesce(p_is_admin, "isAdmin"), active = coalesce(p_active, active)
   where "userId" = p_user;
end $$;

-- Admin: remove a team's leader; they stay in the team as a member
create or replace function public.clear_leader(p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare leader text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select "leaderId" into leader from public.teams where id = p_team;
  update public.teams set "leaderId" = '' where id = p_team;
  if leader <> '' then update public.users set role = 'member' where "userId" = leader::uuid; end if;
end $$;

-- Admin: delete a team; its people keep their accounts but lose the team (leaders become members)
create or replace function public.delete_team(p_team text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.users
     set "teamId" = '', role = case when role = 'leader' then 'member' else role end
   where "teamId" = p_team;
  delete from public.teams where id = p_team;
end $$;

/* ===================================================================== directory */

-- Public part of each profile (name, avatar, role, team) for everyone signed in; users itself is private.
-- The view runs as its owner, so it reads users past RLS and is always in step with the profiles.
create view public.directory as
  select "userId", name, "currentAvatar" as avatar, coalesce(role, 'member') as role, "teamId", active
    from public.users;
revoke all on public.directory from anon, public;
grant select on public.directory to authenticated;

/* ===================================================================== row-level security */

alter table public.users enable row level security;
alter table public.user_private enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.teams enable row level security;
alter table public.projects enable row level security;
alter table public.days enable row level security;
alter table public.time_entries enable row level security;
alter table public.holidays enable row level security;
alter table public."lockedPeriods" enable row level security;
alter table public."auditLog" enable row level security;
alter table public."leaveRequests" enable row level security;
alter table public.notifications enable row level security;
alter table public.tasks enable row level security;
alter table public.work_logs enable row level security;
alter table public.task_activity enable row level security;

-- users (rows are created by handle_new_user)
create policy "users read" on public.users for select to authenticated
  using (public.is_admin() or "userId" = auth.uid());
create policy "users update" on public.users for update to authenticated
  using (public.is_admin() or ("userId" = auth.uid() and public.is_active()));
create policy "users delete" on public.users for delete to authenticated using (public.is_admin());

-- Private to the owner — admins can't read or change it
create policy "private read" on public.user_private for select to authenticated using ("userId" = auth.uid());
create policy "private insert" on public.user_private for insert to authenticated
  with check ("userId" = auth.uid() and public.is_active());
create policy "private update" on public.user_private for update to authenticated
  using ("userId" = auth.uid() and public.is_active());

create policy "push own" on public.push_subscriptions for all to authenticated
  using ("userId" = auth.uid()) with check ("userId" = auth.uid());

create policy "teams read" on public.teams for select to authenticated using (true);
create policy "teams write" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Shared project list: admins and project managers maintain it, everyone picks from it
create policy "projects read" on public.projects for select to authenticated using (true);
create policy "projects insert" on public.projects for insert to authenticated
  with check ("createdBy" = auth.uid() and (public.is_admin() or (public.is_active() and public.my_role() = 'pm')));
create policy "projects update" on public.projects for update to authenticated
  using (public.is_admin() or (public.is_active() and public.my_role() = 'pm'));
create policy "projects delete" on public.projects for delete to authenticated using (public.is_admin());

-- Employees can't change days in a closed payroll period; admins can
create policy "days read" on public.days for select to authenticated
  using (public.is_admin() or "userId" = auth.uid());
create policy "days insert" on public.days for insert to authenticated
  with check (public.is_admin() or ("userId" = auth.uid() and public.is_active() and not public.period_locked("dayId")));
create policy "days update" on public.days for update to authenticated
  using (public.is_admin() or ("userId" = auth.uid() and public.is_active() and not public.period_locked("dayId")));
create policy "days delete" on public.days for delete to authenticated
  using (public.is_admin() or ("userId" = auth.uid() and public.is_active() and not public.period_locked("dayId")));

-- Private task log: only the owner, never admins, PMs or leaders
create policy "entries read" on public.time_entries for select to authenticated using ("userId" = auth.uid());
create policy "entries delete" on public.time_entries for delete to authenticated using ("userId" = auth.uid());
create policy "entries insert" on public.time_entries for insert to authenticated
  with check ("userId" = auth.uid() and public.is_active());
create policy "entries update" on public.time_entries for update to authenticated
  using ("userId" = auth.uid() and public.is_active()) with check ("userId" = auth.uid());

create policy "holidays read" on public.holidays for select to authenticated using (true);
create policy "holidays write" on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "locks read" on public."lockedPeriods" for select to authenticated using (true);
create policy "locks write" on public."lockedPeriods" for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "audit read" on public."auditLog" for select to authenticated using (public.is_admin());
create policy "audit insert" on public."auditLog" for insert to authenticated with check ("changedBy" = auth.uid());

create policy "leave read" on public."leaveRequests" for select to authenticated
  using (public.is_admin() or "userId" = auth.uid());
create policy "leave insert" on public."leaveRequests" for insert to authenticated
  with check ("userId" = auth.uid() and status = 'pending' and public.is_active());
create policy "leave update" on public."leaveRequests" for update to authenticated
  using (public.is_admin() or "userId" = auth.uid());

-- Read your own, or admin-wide ones when you're an admin; readBy changes go through mark_notification_read
create policy "notifications read" on public.notifications for select to authenticated
  using ("userId" = auth.uid()::text or (audience = 'admins' and public.is_admin()));
create policy "notifications insert" on public.notifications for insert to authenticated
  with check ("createdBy" = auth.uid()::text and "readBy" = '{}' and not pushed
    and (("userId" <> '' and audience = '') or ("userId" = '' and audience = 'admins')));

-- Team tasks. The creator is the reviewer. PMs/admins create for anyone; team leaders only for
-- their own team; members can't create. Sub-tasks by whoever runs the parent.
create policy "tasks read" on public.tasks for select to authenticated
  using (public.can_see_task("teamIds", "assigneeIds", "createdBy"));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.is_active() and "createdBy" = auth.uid()::text
    and (public.manages_all() or (public.my_role() = 'leader' and public.my_team() <> '' and "teamIds" = array[public.my_team()]))
    and (tasks."parentId" = '' or exists (
      select 1 from public.tasks p where p.id = tasks."parentId"
        and (public.manages_all() or p."createdBy" = auth.uid()::text or auth.uid()::text = any (p."assigneeIds")))));
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_active() and public.can_see_task("teamIds", "assigneeIds", "createdBy"));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (public.manages_all() or "createdBy" = auth.uid()::text);

-- Everyone who sees the task sees its logs (and you always see your own); people delete their own
create policy "logs read" on public.work_logs for select to authenticated
  using ("userId" = auth.uid()::text or public.can_see_task_id("taskId"));
create policy "logs insert" on public.work_logs for insert to authenticated
  with check (public.is_active() and "userId" = auth.uid()::text and exists (
    select 1 from public.tasks t where t.id = work_logs."taskId" and not t.archived
      and (public.manages_all() or auth.uid()::text = any (t."assigneeIds") or t."createdBy" = auth.uid()::text)));
create policy "logs delete" on public.work_logs for delete to authenticated
  using (public.manages_all() or "userId" = auth.uid()::text);

-- History of the task, written by whoever made the change; never edited
create policy "activity read" on public.task_activity for select to authenticated
  using (public.can_see_task_id("taskId"));
create policy "activity insert" on public.task_activity for insert to authenticated
  with check (public.is_active() and by = auth.uid()::text and public.can_see_task_id("taskId"));

/* ===================================================================== realtime */

alter publication supabase_realtime add table public.notifications, public.tasks, public.work_logs, public.task_activity;

/* ===================================================================== push + reminders */

-- Settings for the push trigger (not exposed through the API); push_function_url is set per project
create schema if not exists private;
create table private.settings (key text primary key, value text not null);
revoke all on schema private from anon, authenticated, public;

-- Every new notification is pushed to the recipients' devices by the send-push Edge Function.
-- Only the id is sent: the function re-reads the row and pushes each notification once ("pushed").
create or replace function private.push_notification() returns trigger
language plpgsql security definer set search_path = public, private, extensions as $$
declare
  fn_url text := (select value from private.settings where key = 'push_function_url');
begin
  if fn_url is null then return new; end if;
  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end $$;
create trigger push_notification after insert on public.notifications
  for each row execute function private.push_notification();

-- Reminds every active person to export their production report on the day it's due
-- (the 30th, or the month's last day in shorter months), Cairo time
create or replace function private.production_report_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Cairo')::date;
  due date := least(date_trunc('month', today)::date + 29, (date_trunc('month', today) + interval '1 month - 1 day')::date);
begin
  if today <> due then return; end if;
  insert into public.notifications ("userId", audience, title, body, link, icon, "createdBy")
  select "userId"::text, '', 'Production report due today',
         'Export your ' || to_char(today, 'FMMonth YYYY') || ' production report (Word and Excel) from the dashboard.',
         '/dashboard', 'pi pi-file-word', 'system'
    from public.users where active;
end $$;

-- 08:00 UTC = 10:00/11:00 in Cairo, on the last days of each month; the function acts only on the due day
select cron.schedule('production-report-reminder', '0 8 28-31 * *', 'select private.production_report_reminder()');
