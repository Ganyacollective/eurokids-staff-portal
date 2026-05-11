-- ============================================================
-- Teacher-portal migration — 2026-05-11
-- ------------------------------------------------------------
-- Adds two tables that the teacher-facing static page consults:
--   * teacher_links     : maps a Supabase Auth user → employee record
--   * leave_requests    : the submission queue HR triages
--
-- Permissive RLS — any authenticated user can read their own data
-- and submit their own leave requests; the HR account (matched by
-- email address) is granted unfettered access for triage.
-- ============================================================

-- ---------- HR predicate ----------------------------------------------------
-- Treats both 'hr@eurokidsjmdenclave.org' and 'admin@eurokidsjmdenclave.org'
-- as HR. Edit the IN-list below if you ever rename the HR account.
create or replace function public.is_hr_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select email in ('hr@eurokidsjmdenclave.org', 'admin@eurokidsjmdenclave.org')
       from auth.users where id = auth.uid()),
    false
  );
$$;

-- ---------- teacher_links ---------------------------------------------------
create table if not exists public.teacher_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  employee_id   text not null,
  display_name  text not null,
  department    text,
  designation   text,
  created_at    timestamptz not null default now()
);

create index if not exists teacher_links_employee_id_idx on public.teacher_links(employee_id);

alter table public.teacher_links enable row level security;

drop policy if exists "teacher_links self read"  on public.teacher_links;
drop policy if exists "teacher_links hr all"     on public.teacher_links;

create policy "teacher_links self read"
  on public.teacher_links
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "teacher_links hr all"
  on public.teacher_links
  for all
  to authenticated
  using (public.is_hr_user())
  with check (public.is_hr_user());

-- ---------- leave_requests --------------------------------------------------
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  employee_id     text not null,
  leave_type      text not null check (leave_type in ('CL', 'EL', 'LWP')),
  start_date      date not null,
  end_date        date not null,
  total_days      numeric(4,1) not null default 1 check (total_days > 0),
  reason          text,
  status          text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewer_note   text,
  applied_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users(id)
);

create index if not exists leave_requests_user_id_idx     on public.leave_requests(user_id);
create index if not exists leave_requests_employee_id_idx on public.leave_requests(employee_id);
create index if not exists leave_requests_status_idx      on public.leave_requests(status);

alter table public.leave_requests enable row level security;

drop policy if exists "leave_requests self read"   on public.leave_requests;
drop policy if exists "leave_requests self insert" on public.leave_requests;
drop policy if exists "leave_requests hr all"      on public.leave_requests;

create policy "leave_requests self read"
  on public.leave_requests
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "leave_requests self insert"
  on public.leave_requests
  for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'Pending');

create policy "leave_requests hr all"
  on public.leave_requests
  for all
  to authenticated
  using (public.is_hr_user())
  with check (public.is_hr_user());

-- ---------- portal_state — tighten to HR only -------------------------------
-- The legacy policy admitted any authenticated user (including teachers) to
-- read & write the HR blob. Replace with HR-only access.
drop policy if exists "portal_state read"  on public.portal_state;
drop policy if exists "portal_state write" on public.portal_state;

create policy "portal_state hr read"
  on public.portal_state
  for select
  to authenticated
  using (public.is_hr_user());

create policy "portal_state hr write"
  on public.portal_state
  for all
  to authenticated
  using (public.is_hr_user())
  with check (public.is_hr_user());
