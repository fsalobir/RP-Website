-- Villes (entités) : rattachées à une province, et donc au royaume propriétaire via province.realm_id.

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  province_id uuid not null references public.provinces (id) on delete cascade,
  name text not null,
  icon_key text,
  lon double precision not null,
  lat double precision not null,
  population numeric,
  attrs jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cities_realm_id on public.cities (realm_id);
create index if not exists idx_cities_province_id on public.cities (province_id);
create index if not exists idx_cities_lon_lat on public.cities (lon, lat);

alter table public.cities enable row level security;

-- MJ : full access (aligné avec le pattern de 0000)
drop policy if exists mj_all_cities on public.cities;
create policy mj_all_cities
on public.cities
for all
using (public.is_mj())
with check (public.is_mj());

-- Lecture : utilisateurs authentifiés (utile pour UI). Les invités n'ont pas accès par défaut.
drop policy if exists cities_authenticated_select on public.cities;
create policy cities_authenticated_select
on public.cities
for select
using (auth.role() = 'authenticated');

