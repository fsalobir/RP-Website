-- Points de passage (waypoints) pour les routes : détours et points de branchement.
-- Une route peut avoir des waypoints ordonnés par seq ; une route "branche" peut avoir une extrémité = pathway_point.

create table if not exists public.route_pathway_points (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  seq integer not null,
  lat numeric not null,
  lon numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_pathway_points_route_id on public.route_pathway_points (route_id);

alter table public.route_pathway_points enable row level security;

drop policy if exists mj_all_route_pathway_points on public.route_pathway_points;
create policy mj_all_route_pathway_points
on public.route_pathway_points
for all
using (public.is_mj())
with check (public.is_mj());

drop policy if exists route_pathway_points_authenticated_select on public.route_pathway_points;
create policy route_pathway_points_authenticated_select
on public.route_pathway_points
for select
using (auth.role() = 'authenticated');

drop policy if exists route_pathway_points_public_select on public.route_pathway_points;
create policy route_pathway_points_public_select
on public.route_pathway_points
for select to anon
using (true);

-- Extension de routes : une extrémité peut être un pathway_point (embranchement) au lieu d'une ville.
alter table public.routes
  add column if not exists pathway_point_a_id uuid references public.route_pathway_points (id) on delete cascade,
  add column if not exists pathway_point_b_id uuid references public.route_pathway_points (id) on delete cascade;

-- Rendre city_a_id et city_b_id nullable pour permettre une extrémité = pathway_point
alter table public.routes
  alter column city_a_id drop not null,
  alter column city_b_id drop not null;

-- Contrainte : exactement une des deux pour chaque extrémité (ville ou pathway_point)
alter table public.routes
  drop constraint if exists routes_city_a_ne_city_b;

alter table public.routes
  add constraint routes_endpoint_a check (
    (city_a_id is not null and pathway_point_a_id is null) or (city_a_id is null and pathway_point_a_id is not null)
  ),
  add constraint routes_endpoint_b check (
    (city_b_id is not null and pathway_point_b_id is null) or (city_b_id is null and pathway_point_b_id is not null)
  ),
  add constraint routes_at_least_one_city check (city_a_id is not null or city_b_id is not null);

-- Index pour les routes qui partent ou arrivent sur un pathway_point
create index if not exists idx_routes_pathway_point_a on public.routes (pathway_point_a_id) where pathway_point_a_id is not null;
create index if not exists idx_routes_pathway_point_b on public.routes (pathway_point_b_id) where pathway_point_b_id is not null;

-- L'index unique sur (city_a, city_b) ne s'applique qu'aux routes ville-ville (pour éviter doublons)
drop index if exists public.idx_routes_unique_pair;
create unique index idx_routes_unique_pair on public.routes (least(city_a_id, city_b_id), greatest(city_a_id, city_b_id))
  where city_a_id is not null and city_b_id is not null;
