create type public.workspace_member_status as enum ('active', 'invited');
create type public.task_status as enum ('open', 'done');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_date date not null default current_date,
  constraint profiles_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint profiles_email_not_blank check (length(trim(email)) > 0),
  constraint profiles_email_is_lowercase check (email = lower(email))
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_date date not null default current_date,
  constraint workspaces_name_not_blank check (length(trim(name)) > 0)
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  status public.workspace_member_status not null default 'invited',
  created_date date not null default current_date,
  constraint workspace_members_name_not_blank check (length(trim(name)) > 0),
  constraint workspace_members_email_not_blank check (length(trim(email)) > 0),
  constraint workspace_members_email_is_lowercase check (email = lower(email)),
  constraint workspace_members_active_profile check (
    (status = 'active' and profile_id is not null)
    or (status = 'invited' and profile_id is null)
  )
);

create unique index workspace_members_workspace_email_key
  on public.workspace_members (workspace_id, email);

create unique index workspace_members_workspace_profile_key
  on public.workspace_members (workspace_id, profile_id)
  where profile_id is not null;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_name text not null,
  email text not null,
  invited_date date not null default current_date,
  constraint workspace_invitations_workspace_name_not_blank check (length(trim(workspace_name)) > 0),
  constraint workspace_invitations_email_not_blank check (length(trim(email)) > 0),
  constraint workspace_invitations_email_is_lowercase check (email = lower(email))
);

create unique index workspace_invitations_workspace_email_key
  on public.workspace_invitations (workspace_id, email);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  notes text not null default '',
  status public.task_status not null default 'open',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_date date not null default current_date,
  updated_date date,
  constraint tasks_title_not_blank check (length(trim(title)) > 0)
);

create index tasks_workspace_status_idx
  on public.tasks (workspace_id, status, created_date);

create function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create function public.current_user_created_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces
    where workspaces.id = target_workspace_id
      and workspaces.created_by_profile_id = auth.uid()
  );
$$;

create function public.current_user_is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = target_workspace_id
      and workspace_members.profile_id = auth.uid()
      and workspace_members.status = 'active'
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.tasks enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Active members can read workspaces"
on public.workspaces
for select
to authenticated
using (public.current_user_is_workspace_member(id));

create policy "Users can create workspaces for themselves"
on public.workspaces
for insert
to authenticated
with check (created_by_profile_id = auth.uid());

create policy "Active members can update workspaces"
on public.workspaces
for update
to authenticated
using (public.current_user_is_workspace_member(id))
with check (public.current_user_is_workspace_member(id));

create policy "Creators can delete workspaces"
on public.workspaces
for delete
to authenticated
using (created_by_profile_id = auth.uid());

create policy "Relevant users can read workspace members"
on public.workspace_members
for select
to authenticated
using (
  public.current_user_is_workspace_member(workspace_id)
  or profile_id = auth.uid()
  or (status = 'invited' and email = public.current_user_email())
);

create policy "Members can add workspace members"
on public.workspace_members
for insert
to authenticated
with check (
  public.current_user_is_workspace_member(workspace_id)
  or public.current_user_created_workspace(workspace_id)
);

create policy "Members can update workspace members"
on public.workspace_members
for update
to authenticated
using (
  public.current_user_is_workspace_member(workspace_id)
  or email = public.current_user_email()
)
with check (
  public.current_user_is_workspace_member(workspace_id)
  or (profile_id = auth.uid() and email = public.current_user_email())
);

create policy "Relevant users can remove workspace members"
on public.workspace_members
for delete
to authenticated
using (
  public.current_user_is_workspace_member(workspace_id)
  or (status = 'invited' and email = public.current_user_email())
);

create policy "Relevant users can read workspace invitations"
on public.workspace_invitations
for select
to authenticated
using (
  public.current_user_is_workspace_member(workspace_id)
  or email = public.current_user_email()
);

create policy "Members can create workspace invitations"
on public.workspace_invitations
for insert
to authenticated
with check (
  public.current_user_is_workspace_member(workspace_id)
  or public.current_user_created_workspace(workspace_id)
);

create policy "Relevant users can delete workspace invitations"
on public.workspace_invitations
for delete
to authenticated
using (
  public.current_user_is_workspace_member(workspace_id)
  or email = public.current_user_email()
);

create policy "Members can read tasks"
on public.tasks
for select
to authenticated
using (public.current_user_is_workspace_member(workspace_id));

create policy "Members can create tasks"
on public.tasks
for insert
to authenticated
with check (
  public.current_user_is_workspace_member(workspace_id)
  and (created_by_profile_id is null or created_by_profile_id = auth.uid())
);

create policy "Members can update tasks"
on public.tasks
for update
to authenticated
using (public.current_user_is_workspace_member(workspace_id))
with check (
  public.current_user_is_workspace_member(workspace_id)
  and (created_by_profile_id is null or created_by_profile_id = auth.uid())
);

create policy "Members can delete tasks"
on public.tasks
for delete
to authenticated
using (public.current_user_is_workspace_member(workspace_id));

revoke execute on function public.current_user_email() from public, anon;
revoke execute on function public.current_user_created_workspace(uuid) from public, anon;
revoke execute on function public.current_user_is_workspace_member(uuid) from public, anon;

grant usage on schema public to authenticated;
grant usage on type public.workspace_member_status to authenticated;
grant usage on type public.task_status to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.current_user_created_workspace(uuid) to authenticated;
grant execute on function public.current_user_is_workspace_member(uuid) to authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update, delete on public.workspace_invitations to service_role;
grant select, insert, update, delete on public.tasks to service_role;
