-- Une extrémité de route peut être une ville, un point sur une route (pathway_point) ou un POI (entité).

alter table public.routes
  add column if not exists poi_a_id uuid references public.poi (id) on delete set null,
  add column if not exists poi_b_id uuid references public.poi (id) on delete set null;

-- Remplacer les contraintes d'extrémité pour accepter ville OU pathway_point OU poi
alter table public.routes drop constraint if exists routes_endpoint_a;
alter table public.routes drop constraint if exists routes_endpoint_b;
alter table public.routes drop constraint if exists routes_at_least_one_city;

alter table public.routes
  add constraint routes_endpoint_a check (
    (city_a_id is not null and pathway_point_a_id is null and poi_a_id is null)
    or (city_a_id is null and pathway_point_a_id is not null and poi_a_id is null)
    or (city_a_id is null and pathway_point_a_id is null and poi_a_id is not null)
  ),
  add constraint routes_endpoint_b check (
    (city_b_id is not null and pathway_point_b_id is null and poi_b_id is null)
    or (city_b_id is null and pathway_point_b_id is not null and poi_b_id is null)
    or (city_b_id is null and pathway_point_b_id is null and poi_b_id is not null)
  );

create index if not exists idx_routes_poi_a on public.routes (poi_a_id) where poi_a_id is not null;
create index if not exists idx_routes_poi_b on public.routes (poi_b_id) where poi_b_id is not null;
