-- POI visibles sur la carte: position + icône.

alter table public.poi
  add column if not exists lon double precision,
  add column if not exists lat double precision,
  add column if not exists icon_key text,
  add column if not exists is_visible boolean not null default true;

create index if not exists idx_poi_visible on public.poi (is_visible);
create index if not exists idx_poi_lon_lat on public.poi (lon, lat);

