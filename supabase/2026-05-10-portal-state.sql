-- ============================================================
-- Cloud-portal migration — 2026-05-10
-- ------------------------------------------------------------
-- Adds a single jsonb-blob table that backs the static portal
-- (public/portal.html). Any authenticated user can read & write
-- the row; the app uses last-write-wins semantics deliberately.
-- ============================================================

create table if not exists public.portal_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.portal_state enable row level security;

-- Anyone signed in (the shared HR account) may read the blob.
drop policy if exists "portal_state read"  on public.portal_state;
create policy "portal_state read"
  on public.portal_state
  for select
  to authenticated
  using (true);

-- Anyone signed in may insert/update the blob (last-write-wins).
drop policy if exists "portal_state write" on public.portal_state;
create policy "portal_state write"
  on public.portal_state
  for all
  to authenticated
  using (true)
  with check (true);

-- Optional: keep updated_at honest even if a client forgets to set it.
create or replace function public.portal_state_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists portal_state_touch on public.portal_state;
create trigger portal_state_touch
  before insert or update on public.portal_state
  for each row execute function public.portal_state_touch_updated_at();
