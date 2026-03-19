-- Routes entre villes : entité à part entière, 3 tiers (local, regional, national).

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city_a_id uuid not null references public.cities (id) on delete cascade,
  city_b_id uuid not null references public.cities (id) on delete cascade,
  tier text not null check (tier in ('local', 'regional', 'national')),
  distance_km numeric,
  attrs jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_city_a_ne_city_b check (city_a_id <> city_b_id)
);

create unique index if not exists idx_routes_unique_pair on public.routes (least(city_a_id, city_b_id), greatest(city_a_id, city_b_id));
create index if not exists idx_routes_city_a on public.routes (city_a_id);
create index if not exists idx_routes_city_b on public.routes (city_b_id);

alter table public.routes enable row level security;

drop policy if exists mj_all_routes on public.routes;
create policy mj_all_routes
on public.routes
for all
using (public.is_mj())
with check (public.is_mj());

drop policy if exists routes_authenticated_select on public.routes;
create policy routes_authenticated_select
on public.routes
for select
using (auth.role() = 'authenticated');

-- Lecture publique pour la carte
drop policy if exists routes_public_select on public.routes;
create policy routes_public_select on public.routes
for select to anon
using (true);
