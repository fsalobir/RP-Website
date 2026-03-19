begin;

alter table public.realms
  add column if not exists color_hex text,
  add column if not exists banner_url text,
  add column if not exists summary text,
  add column if not exists leader_name text;

update public.realms
set color_hex = coalesce(
  color_hex,
  ('#' || substr(md5(id::text), 1, 6))
)
where color_hex is null;

create table if not exists public.realm_player_assignments (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (realm_id)
);

create index if not exists idx_realm_player_assignments_user_id on public.realm_player_assignments(user_id);
create index if not exists idx_realm_player_assignments_email on public.realm_player_assignments(email);

-- Backfill depuis realms.player_user_id
insert into public.realm_player_assignments (realm_id, user_id, email, display_name)
select r.id, r.player_user_id, null, r.name
from public.realms r
where r.player_user_id is not null
on conflict (realm_id) do update
set user_id = excluded.user_id,
    updated_at = now();

alter table public.realm_player_assignments enable row level security;

drop policy if exists realm_player_assignments_mj_all on public.realm_player_assignments;
create policy realm_player_assignments_mj_all
on public.realm_player_assignments
for all
using (public.is_mj())
with check (public.is_mj());

drop policy if exists realm_player_assignments_self_read on public.realm_player_assignments;
create policy realm_player_assignments_self_read
on public.realm_player_assignments
for select
to authenticated
using (user_id = auth.uid());

create table if not exists public.realm_audit_logs (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid references public.realms(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_realm_audit_logs_realm_id on public.realm_audit_logs(realm_id, created_at desc);

alter table public.realm_audit_logs enable row level security;

drop policy if exists realm_audit_logs_mj_all on public.realm_audit_logs;
create policy realm_audit_logs_mj_all
on public.realm_audit_logs
for all
using (public.is_mj())
with check (public.is_mj());

drop function if exists public.current_player_realm_ids();
create function public.current_player_realm_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(rpa.realm_id), '{}')
  from public.realm_player_assignments rpa
  where rpa.user_id = auth.uid()
$$;

commit;

