begin;

create table if not exists public.map_display_config_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  version int not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_map_display_config_audit_created_at
  on public.map_display_config_audit(created_at desc);

alter table public.map_display_config_audit enable row level security;

drop policy if exists map_display_config_audit_mj_all on public.map_display_config_audit;
create policy map_display_config_audit_mj_all
on public.map_display_config_audit
for all
using (public.is_mj())
with check (public.is_mj());

commit;

