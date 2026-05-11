-- Eurokids Staff Portal — Database Schema
-- Apply via Supabase SQL Editor on a fresh project.

-- ============================================================
-- 1. Enums
-- ============================================================
create type user_role as enum ('admin', 'teacher');
create type employee_dept as enum ('Teacher', 'Support Staff', 'Admin', 'C Suite');
create type leave_type as enum ('CL', 'EL', 'LWP', 'Maternity', 'Bereavement', 'Other');
create type leave_status as enum ('Pending', 'Approved', 'Rejected', 'Cancelled');
create type day_status as enum (
  'FullDay',          -- Present full day, on time
  'HalfDay',          -- Half day worked
  'Late',             -- Present but late (1 strike applied)
  'HalfLWP',          -- > 1.5 hrs late = ½ day LWP
  'LWP',              -- Leave Without Pay
  'CasualLeave',      -- Approved CL
  'EarnedLeave',      -- Approved EL
  'Holiday',          -- Mandatory holiday
  'OptionalHoliday',  -- Optional holiday teacher elected
  'Vacation',         -- School vacation block
  'WeekOff',          -- Sunday or off Saturday
  'ForgotPunch'       -- Punched in but not out (or vice versa) — counted as Present
);
create type anomaly_kind as enum (
  'missing_schedule',
  'zero_punches',
  'name_mismatch',
  'punch_on_holiday',
  'forgot_punch',
  'excess_late_strikes',
  'unmatched_leave_application',
  'sandwich_violation'
);
create type anomaly_status as enum ('open', 'resolved', 'ignored');

-- ============================================================
-- 2. Profiles (extends auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'teacher',
  full_name text not null,
  phone text unique,
  employee_id uuid, -- linked below once employees table exists
  created_at timestamptz not null default now()
);
create index profiles_role_idx on profiles(role);

-- ============================================================
-- 3. Employees registry — single source of truth for names + rates
-- ============================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  -- Name MUST match exactly how PetPooja writes it (incl. trailing spaces)
  name_petpooja text not null unique,
  -- Friendly display name for the UI
  display_name text not null,
  petpooja_employee_code text, -- "TR 1", "HR 2", etc
  petpooja_employee_id bigint, -- internal numeric id from PetPooja
  department employee_dept not null,
  designation text not null,
  -- Reporting time, in minutes from midnight (e.g. 8:30 AM = 510)
  reporting_minutes int not null default 540, -- 9:00 AM default
  monthly_salary numeric(10,2),
  per_day_rate numeric(10,2) generated always as (
    case when monthly_salary is null then null else monthly_salary / 26 end
  ) stored,
  phone text,
  email text,
  joined_date date,
  left_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_active_idx on employees(is_active);
create index employees_dept_idx on employees(department);

-- now profiles can reference employees
alter table profiles
  add constraint profiles_employee_fk foreign key (employee_id) references employees(id) on delete set null;

-- ============================================================
-- 4. Holidays & Vacations
-- ============================================================
create table holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  is_mandatory boolean not null default true, -- false = teacher-elected optional
  academic_year text not null, -- e.g. '2026-27'
  notes text,
  created_at timestamptz not null default now()
);
create index holidays_ay_idx on holidays(academic_year);

create table vacations (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  name text not null,             -- 'Diwali', 'Christmas', 'Summer break'
  academic_year text not null,
  notes text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index vacations_dates_idx on vacations(start_date, end_date);

-- Teacher's elected optional holidays (each teacher picks 5/year)
create table optional_holiday_elections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  holiday_id uuid not null references holidays(id) on delete cascade,
  unique (employee_id, holiday_id)
);

-- ============================================================
-- 5. Leave Applications
-- ============================================================
create table leave_applications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type leave_type not null,
  start_date date not null,
  end_date date not null,
  total_days numeric(4,1) not null,
  reason text,
  status leave_status not null default 'Pending',
  applied_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  reviewer_note text,
  attachment_url text,
  check (end_date >= start_date)
);
create index leave_apps_emp_dates_idx on leave_applications(employee_id, start_date, end_date);
create index leave_apps_status_idx on leave_applications(status);

-- ============================================================
-- 6. Monthly attendance — raw imports
-- ============================================================
create table attendance_raw_imports (
  id uuid primary key default gen_random_uuid(),
  month date not null,            -- always day=1, e.g. 2026-04-01
  source text not null,           -- 'petpooja_excel' | 'petpooja_api'
  imported_by uuid references profiles(id),
  imported_at timestamptz not null default now(),
  row_count int not null,
  notes text,
  unique(month, source)
);

create table attendance_raw_rows (
  id bigserial primary key,
  import_id uuid not null references attendance_raw_imports(id) on delete cascade,
  -- Raw fields exactly as PetPooja gave them
  petpooja_emp_code text,
  raw_name text not null,         -- as appeared in PetPooja
  raw_dept text,
  raw_designation text,
  attendance_date date not null,
  first_punch text,               -- "08:17 AM" or null
  last_punch text,
  working_hours text,
  break_hours text,
  petpooja_status text,
  leave_name text,
  holiday_name text
);
create index att_raw_date_idx on attendance_raw_rows(attendance_date);
create index att_raw_name_idx on attendance_raw_rows(raw_name);

-- ============================================================
-- 7. Reconciled attendance — one row per (employee, date)
-- ============================================================
create table reconciled_attendance (
  id bigserial primary key,
  month date not null,
  employee_id uuid references employees(id) on delete cascade, -- null if name unmatched
  raw_row_id bigint references attendance_raw_rows(id) on delete cascade,
  attendance_date date not null,
  day_of_week smallint not null,  -- 0=Sun, 6=Sat
  scheduled_minutes int,           -- override applied for Saturdays
  punch_in_minutes int,
  punch_out_minutes int,
  late_minutes int,                -- punch_in - scheduled (negative if early)
  is_late_strike boolean not null default false,
  status day_status not null,
  matched_leave_id uuid references leave_applications(id),
  matched_holiday_id uuid references holidays(id),
  matched_vacation_id uuid references vacations(id),
  notes text,
  computed_at timestamptz not null default now(),
  unique(month, employee_id, attendance_date)
);
create index recon_month_emp_idx on reconciled_attendance(month, employee_id);

-- ============================================================
-- 8. Anomalies — actionable inbox for the admin
-- ============================================================
create table anomalies (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  kind anomaly_kind not null,
  employee_id uuid references employees(id),
  raw_row_id bigint references attendance_raw_rows(id),
  description text not null,
  status anomaly_status not null default 'open',
  resolution_action text,            -- 'mark_present' | 'apply_lwp' | 'apply_cl' | 'add_to_schedules' | etc
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index anomalies_month_status_idx on anomalies(month, status);

-- ============================================================
-- 9. Cuts decisions — audit trail of every salary deduction
-- ============================================================
create table cuts_decisions (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  computed_cuts numeric(4,1) not null,   -- what the engine produced
  applied_cuts numeric(4,1) not null,    -- what HR actually applied (may differ)
  delta numeric(4,1) generated always as (computed_cuts - applied_cuts) stored,
  reason text,                            -- why HR adjusted
  decided_by uuid references profiles(id),
  decided_at timestamptz not null default now(),
  unique (month, employee_id)
);
create index cuts_dec_month_idx on cuts_decisions(month);

-- ============================================================
-- 10. Salary sheets
-- ============================================================
create table salary_sheets (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,        -- one sheet per month
  generated_at timestamptz not null default now(),
  generated_by uuid references profiles(id),
  is_locked boolean not null default false, -- once disbursed
  locked_at timestamptz,
  locked_by uuid references profiles(id),
  total_gross numeric(12,2),
  total_cuts numeric(12,2),
  total_net numeric(12,2),
  notes text
);

create table salary_sheet_lines (
  id bigserial primary key,
  sheet_id uuid not null references salary_sheets(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  monthly_salary numeric(10,2) not null,
  per_day_rate numeric(10,2) not null,
  full_days numeric(4,1) not null default 0,
  late_strikes int not null default 0,
  half_lwp_days numeric(4,1) not null default 0,
  lwp_days numeric(4,1) not null default 0,
  cl_days numeric(4,1) not null default 0,
  el_days numeric(4,1) not null default 0,
  total_cut_days numeric(4,1) not null default 0,
  cut_amount numeric(10,2) not null default 0,
  net_payable numeric(10,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique(sheet_id, employee_id)
);

-- ============================================================
-- 11. Audit log — generic activity trail
-- ============================================================
create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action text not null,           -- 'employee.create' | 'leave.approve' | 'cuts.adjust' | etc
  entity_type text,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
create index audit_actor_idx on audit_log(actor_id, created_at desc);

-- ============================================================
-- 12. Row Level Security (RLS) — teacher self-service safety
-- ============================================================
alter table profiles enable row level security;
alter table employees enable row level security;
alter table holidays enable row level security;
alter table vacations enable row level security;
alter table leave_applications enable row level security;
alter table reconciled_attendance enable row level security;
alter table salary_sheet_lines enable row level security;

-- helper: is the current user an admin?
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Profiles: users see their own, admins see all
create policy "profiles_self_or_admin" on profiles
  for select using (auth.uid() = id or is_admin());
create policy "profiles_admin_write" on profiles
  for all using (is_admin()) with check (is_admin());

-- Employees: admins manage, teachers read their own employee row
create policy "employees_admin_all" on employees
  for all using (is_admin()) with check (is_admin());
create policy "employees_self_read" on employees
  for select using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.employee_id = employees.id)
  );

-- Holidays / vacations: everyone reads, only admins write
create policy "holidays_read_all" on holidays for select using (true);
create policy "holidays_admin_write" on holidays for insert with check (is_admin());
create policy "holidays_admin_update" on holidays for update using (is_admin());
create policy "holidays_admin_delete" on holidays for delete using (is_admin());

create policy "vacations_read_all" on vacations for select using (true);
create policy "vacations_admin_write" on vacations for insert with check (is_admin());
create policy "vacations_admin_update" on vacations for update using (is_admin());
create policy "vacations_admin_delete" on vacations for delete using (is_admin());

-- Leave applications: teachers manage their own, admins see all
create policy "leaves_self_or_admin_read" on leave_applications
  for select using (
    is_admin()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.employee_id = leave_applications.employee_id)
  );
create policy "leaves_self_insert" on leave_applications
  for insert with check (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.employee_id = leave_applications.employee_id)
  );
create policy "leaves_admin_update" on leave_applications
  for update using (is_admin()) with check (is_admin());

-- Reconciled attendance: self-read, admin all
create policy "recon_self_or_admin" on reconciled_attendance
  for select using (
    is_admin()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.employee_id = reconciled_attendance.employee_id)
  );
create policy "recon_admin_write" on reconciled_attendance
  for all using (is_admin()) with check (is_admin());

-- Salary sheet lines: self-read, admin all
create policy "salary_self_or_admin" on salary_sheet_lines
  for select using (
    is_admin()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.employee_id = salary_sheet_lines.employee_id)
  );
create policy "salary_admin_write" on salary_sheet_lines
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- 13. Seed data — Eurokids JMD Enclave specific
-- ============================================================
-- Seed employees from current Coda SCHEDULES table
-- (run once after schema apply; safe to re-run thanks to ON CONFLICT)
insert into employees (name_petpooja, display_name, department, designation, reporting_minutes, is_active) values
  ('Manisha Zurange', 'Manisha Zurange', 'Support Staff', 'Cleaner', 450, true),
  ('Aarti Yadav', 'Aarti Yadav', 'Support Staff', 'Cook', 660, true),
  ('Gudiya Yadav', 'Gudiya Yadav', 'Support Staff', 'Didi', 540, true),
  ('Baby Maushi', 'Baby Maushi', 'Support Staff', 'Daycare Didi', 600, true),
  ('Pooja Shrirame', 'Pooja Shrirame', 'Support Staff', 'Cleaner', 450, true),
  ('Malti Patil', 'Malti Patil', 'Support Staff', 'Cleaner', 450, true),
  ('Laxmi Palante', 'Laxmi Palante', 'Support Staff', 'Cleaner', 450, true),
  ('Ranjhana Nandu Ghule', 'Ranjhana Ghule', 'Support Staff', 'Cleaner', 450, true),
  ('Aarti Biradar', 'Aarti Biradar', 'Support Staff', 'Didi', 540, true),
  ('Kala Koli', 'Kala Koli', 'Support Staff', 'Didi', 540, true),
  ('Theresa Pillay', 'Theresa Pillay', 'Support Staff', 'Didi', 570, true),
  ('Anamika Singh', 'Anamika Singh', 'Teacher', 'Nursery Teacher', 495, true),
  ('Deepti S', 'Deepti S', 'Admin', 'Coordinator', 480, true),
  ('Sasmita Mishra', 'Sasmita Mishra', 'Teacher', 'Daycare Teacher', 660, true),
  ('Diya Anuj Advani', 'Diya Advani', 'Teacher', 'Daycare Teacher', 630, true),
  ('Sonia Nyayapathi', 'Sonia Nyayapathi', 'Teacher', 'Sr.Kg Teacher', 480, true),
  ('Evan Lunkad', 'Evan Lunkad', 'Teacher', 'Jr.Kg Teacher', 480, true),
  ('Firdousjaha Shaikh', 'Firdous Shaikh', 'Teacher', 'Nursery Teacher', 495, true),
  ('Pallavi Wadmare', 'Pallavi Wadmare', 'Teacher', 'Nursery Teacher', 495, true),
  ('Deepshiksha Tyagi', 'Deepshiksha Tyagi', 'Teacher', 'Playgroup Teacher', 540, true),
  ('Manisha Apte', 'Manisha Apte', 'Teacher', 'Nursery Teacher', 495, true),
  ('Sherebanu Patrawala', 'Sherebanu Patrawala', 'Teacher', 'Teacher', 495, true),
  ('Starr liu ', 'Starr Liu', 'Teacher', 'Playgroup Teacher', 540, true),
  ('Anuja Mule', 'Anuja Mule', 'Teacher', 'Nursery Teacher', 495, true)
on conflict (name_petpooja) do nothing;

-- Seed holidays for AY 2026-27
insert into holidays (date, name, is_mandatory, academic_year) values
  ('2026-05-01', 'Maharashtra Day', true, '2026-27'),
  ('2026-08-15', 'Independence Day', true, '2026-27'),
  ('2026-09-14', 'Ganesh Chaturthi', true, '2026-27'),
  ('2026-10-02', 'Gandhi Jayanti', true, '2026-27'),
  ('2027-01-26', 'Republic Day', true, '2026-27'),
  -- optional (teachers elect 5)
  ('2026-04-03', 'Good Friday', false, '2026-27'),
  ('2026-06-26', 'Muharram', false, '2026-27'),
  ('2026-08-26', 'Onam/Eid', false, '2026-27'),
  ('2026-08-28', 'Raksha Bandhan', false, '2026-27'),
  ('2026-09-18', 'Gauri Pooja', false, '2026-27'),
  ('2026-09-24', 'Anant Chaturdashi', false, '2026-27'),
  ('2026-10-20', 'Dusshera', false, '2026-27'),
  ('2027-01-14', 'Makar Sankranti', false, '2026-27'),
  ('2027-02-19', 'Chhatrapati Shivaji Jayanti', false, '2026-27'),
  ('2027-03-10', 'Ramzan', false, '2026-27'),
  ('2027-03-22', 'Holi', false, '2026-27')
on conflict (date) do nothing;

-- Seed vacations for AY 2026-27
insert into vacations (start_date, end_date, name, academic_year) values
  ('2026-04-01', '2026-04-05', 'Inter-AY break (AY 2025-26 → 2026-27)', '2026-27'),
  ('2026-05-02', '2026-05-31', 'Summer break May 2026', '2026-27'),
  ('2026-11-04', '2026-11-11', 'Diwali 2026', '2026-27'),
  ('2026-12-24', '2027-01-01', 'Christmas 2026-27', '2026-27')
on conflict do nothing;

-- ============================================================
-- 14. Updated-at triggers
-- ============================================================
create or replace function trigger_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_updated_at_employees
  before update on employees
  for each row execute function trigger_set_updated_at();
