-- Provinces = régions de base (carte) + opérations MJ (merge/split/rename) + undo.
-- Source de vérité: province_base_regions (region_id unique).

create table if not exists public.map_base_regions (
  region_id text primary key,
  name text,
  admin text,
  iso_a2 text,
  created_at timestamptz not null default now()
);

create table if not exists public.province_base_regions (
  province_id uuid not null references public.provinces (id) on delete cascade,
  region_id text not null references public.map_base_regions (region_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (province_id, region_id),
  constraint province_base_regions_region_unique unique (region_id)
);

create index if not exists idx_province_base_regions_region on public.province_base_regions (region_id);
create index if not exists idx_province_base_regions_province on public.province_base_regions (province_id);

alter table public.provinces
  add column if not exists is_composite boolean not null default false,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create table if not exists public.province_map_ops (
  id uuid primary key default gen_random_uuid(),
  op_kind text not null check (op_kind in ('merge','split','rename','undo')),
  province_id uuid references public.provinces (id) on delete set null,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_province_map_ops_created_at on public.province_map_ops (created_at desc);
create index if not exists idx_province_map_ops_province on public.province_map_ops (province_id);

-- Backfill initial: chaque province map_ref devient une région de base.
-- On enregistre aussi la région de base dans map_base_regions (minimal).
insert into public.map_base_regions (region_id)
select distinct p.map_ref
from public.provinces p
where p.map_ref is not null and p.map_ref <> ''
on conflict (region_id) do nothing;

insert into public.province_base_regions (province_id, region_id)
select p.id, p.map_ref
from public.provinces p
where p.map_ref is not null and p.map_ref <> ''
on conflict (region_id) do nothing;

-- Sécurité: RLS (on continue à utiliser surtout le service_role côté server, mais on protège par défaut)
alter table public.map_base_regions enable row level security;
alter table public.province_base_regions enable row level security;
alter table public.province_map_ops enable row level security;

-- lecture: autoriser aux utilisateurs authentifiés (utile pour affichage), écriture: MJ uniquement via service_role/actions
drop policy if exists map_base_regions_select on public.map_base_regions;
create policy map_base_regions_select on public.map_base_regions
for select to authenticated
using (true);

drop policy if exists province_base_regions_select on public.province_base_regions;
create policy province_base_regions_select on public.province_base_regions
for select to authenticated
using (true);

drop policy if exists province_map_ops_select on public.province_map_ops;
create policy province_map_ops_select on public.province_map_ops
for select to authenticated
using (true);

