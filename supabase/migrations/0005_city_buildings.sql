-- Bâtiments d'une ville (socle). Évoluera vers des types, coûts, effets, files de construction, etc.

create table if not exists public.city_buildings (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  kind text not null,
  level int not null default 1 check (level >= 1),
  attrs jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_city_buildings_city_id on public.city_buildings (city_id);
create index if not exists idx_city_buildings_kind on public.city_buildings (kind);

alter table public.city_buildings enable row level security;

drop policy if exists mj_all_city_buildings on public.city_buildings;
create policy mj_all_city_buildings
on public.city_buildings
for all
using (public.is_mj())
with check (public.is_mj());

drop policy if exists city_buildings_authenticated_select on public.city_buildings;
create policy city_buildings_authenticated_select
on public.city_buildings
for select
using (auth.role() = 'authenticated');

