-- 0000_initial_fantasy_schema.sql
-- Schéma initial Fantasy (Hard Fork) : Royaumes / Provinces / Ressources dynamiques / Ticks / Diplomatie / Transactions / Militaire / Personnages / Objets / Effets / Visibilité.
-- IMPORTANT (RLS) :
-- - Les MJ (public.mj_admins) ont tous les droits.
-- - Les joueurs n’ont accès qu’à leur Royaume (realms.player_user_id = auth.uid()) et aux données rattachées à ce royaume.
-- - Le brouillard de guerre est strict : l’accès aux données “exactes” d’autrui est refusé par défaut ; les révélations passeront par visibility_grants / intel_reports.

begin;

-- Extensions nécessaires (UUID, crypt, etc.)
create extension if not exists pgcrypto;

-- =========================
-- Helpers Auth / Rôles
-- =========================

create table if not exists public.mj_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_mj()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.mj_admins a
    where a.user_id = auth.uid()
  );
$$;

-- =========================
-- Noyau : Royaumes / Provinces
-- =========================

create table if not exists public.realms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  player_user_id uuid unique references auth.users (id) on delete set null,
  is_npc boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provinces (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  name text not null,
  -- Référence vers le plateau tactique externe (ID/clé libre)
  map_ref text,
  attrs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (realm_id, name)
);

create index if not exists idx_provinces_realm_id on public.provinces (realm_id);

-- =========================
-- Ressources dynamiques
-- =========================

create table if not exists public.resource_kinds (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fr text not null,
  unit_label_fr text,
  decimals int not null default 0 check (decimals >= 0 and decimals <= 6),
  is_hidden_by_default boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.province_resources (
  province_id uuid not null references public.provinces (id) on delete cascade,
  resource_kind_id uuid not null references public.resource_kinds (id) on delete restrict,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (province_id, resource_kind_id)
);

create table if not exists public.realm_resources (
  realm_id uuid not null references public.realms (id) on delete cascade,
  resource_kind_id uuid not null references public.resource_kinds (id) on delete restrict,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (realm_id, resource_kind_id)
);

-- =========================
-- Ticks + Historique
-- =========================

create table if not exists public.tick_config (
  id int primary key default 1,
  paused boolean not null default true,
  -- Durée “variable” : laisser le MJ choisir une convention
  tick_length_days int,
  tick_mode text,
  edge_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint tick_config_singleton check (id = 1)
);

create table if not exists public.tick_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  triggered_by text not null default 'edge' check (triggered_by in ('edge', 'mj', 'system')),
  notes text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_tick_runs_started_at on public.tick_runs (started_at desc);

create table if not exists public.realm_history (
  id uuid primary key default gen_random_uuid(),
  tick_run_id uuid not null references public.tick_runs (id) on delete cascade,
  realm_id uuid not null references public.realms (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tick_run_id, realm_id)
);

create table if not exists public.province_history (
  id uuid primary key default gen_random_uuid(),
  tick_run_id uuid not null references public.tick_runs (id) on delete cascade,
  province_id uuid not null references public.provinces (id) on delete cascade,
  realm_id uuid not null references public.realms (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tick_run_id, province_id)
);

create index if not exists idx_realm_history_realm_tick on public.realm_history (realm_id, created_at desc);
create index if not exists idx_province_history_province_tick on public.province_history (province_id, created_at desc);

create table if not exists public.tick_resource_changes (
  id uuid primary key default gen_random_uuid(),
  tick_run_id uuid references public.tick_runs (id) on delete set null,
  realm_id uuid references public.realms (id) on delete set null,
  province_id uuid references public.provinces (id) on delete set null,
  resource_kind_id uuid references public.resource_kinds (id) on delete restrict,
  delta numeric not null,
  reason text,
  source_type text,
  source_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tick_resource_changes_tick on public.tick_resource_changes (tick_run_id);
create index if not exists idx_tick_resource_changes_realm on public.tick_resource_changes (realm_id);
create index if not exists idx_tick_resource_changes_province on public.tick_resource_changes (province_id);

-- =========================
-- Diplomatie
-- =========================

create table if not exists public.diplomatic_relations (
  id uuid primary key default gen_random_uuid(),
  realm_a_id uuid not null references public.realms (id) on delete cascade,
  realm_b_id uuid not null references public.realms (id) on delete cascade,
  relation_kind text not null check (relation_kind in ('alliance', 'war', 'vassalage', 'truce', 'non_aggression', 'trade_pact', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive', 'proposed', 'broken')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  terms jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  -- ordre canonique
  constraint diplomatic_relations_canonical check (realm_a_id < realm_b_id),
  unique (realm_a_id, realm_b_id, relation_kind)
);

create index if not exists idx_diplomatic_relations_a on public.diplomatic_relations (realm_a_id);
create index if not exists idx_diplomatic_relations_b on public.diplomatic_relations (realm_b_id);

-- =========================
-- Transactions
-- =========================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  from_realm_id uuid references public.realms (id) on delete set null,
  to_realm_id uuid references public.realms (id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'executed', 'cancelled', 'refused')),
  created_by_user_id uuid references auth.users (id) on delete set null,
  executed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_from on public.transactions (from_realm_id);
create index if not exists idx_transactions_to on public.transactions (to_realm_id);

create table if not exists public.transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  line_kind text not null check (line_kind in ('resource', 'item', 'other')),
  resource_kind_id uuid references public.resource_kinds (id) on delete restrict,
  amount numeric,
  item_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_lines_resource_check check (
    (line_kind <> 'resource') or (resource_kind_id is not null and amount is not null)
  )
);

create index if not exists idx_transaction_lines_tx on public.transaction_lines (transaction_id);

-- =========================
-- Races / Provinces / POI
-- =========================

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fr text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.province_races (
  province_id uuid not null references public.provinces (id) on delete cascade,
  race_id uuid not null references public.races (id) on delete restrict,
  -- soit un pourcentage (0..100), soit un compteur ; stocker les deux si besoin
  share_pct numeric,
  count numeric,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (province_id, race_id)
);

create table if not exists public.poi (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces (id) on delete cascade,
  kind text not null,
  name text not null,
  attrs jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_poi_province on public.poi (province_id);

-- =========================
-- Personnages / Objets / Trésor
-- =========================

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  province_id uuid references public.provinces (id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'dead', 'missing', 'retired', 'other')),
  attrs jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_characters_realm on public.characters (realm_id);
create index if not exists idx_characters_province on public.characters (province_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  equipped_by_character_id uuid references public.characters (id) on delete set null,
  name text not null,
  attrs jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_realm on public.items (realm_id);
create index if not exists idx_items_equipped on public.items (equipped_by_character_id);

-- =========================
-- Militaire
-- =========================

create table if not exists public.military_unit_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  branch text not null,
  label_fr text not null,
  stats jsonb not null default '{}'::jsonb,
  unlock_requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.realm_armies (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms (id) on delete cascade,
  name text not null,
  composition jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_realm_armies_realm on public.realm_armies (realm_id);

create table if not exists public.realm_army_units (
  realm_army_id uuid not null references public.realm_armies (id) on delete cascade,
  unit_type_id uuid not null references public.military_unit_types (id) on delete restrict,
  count int not null default 0 check (count >= 0),
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_army_id, unit_type_id)
);

-- =========================
-- Moteur d’effets (polymorphe)
-- =========================

create table if not exists public.effects (
  id uuid primary key default gen_random_uuid(),
  effect_kind text not null,
  value numeric not null,
  duration_kind text not null default 'days' check (duration_kind in ('days', 'updates', 'permanent')),
  duration_remaining int,
  source_label text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  -- ciblage polymorphe
  target_type text not null check (target_type in ('realm', 'province', 'character', 'race', 'item', 'poi')),
  target_id uuid not null,
  target_subkey text,
  scope jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_effects_target on public.effects (target_type, target_id);
create index if not exists idx_effects_kind on public.effects (effect_kind);

-- =========================
-- Visibilité / Espionnage
-- =========================

create table if not exists public.visibility_grants (
  id uuid primary key default gen_random_uuid(),
  viewer_realm_id uuid not null references public.realms (id) on delete cascade,
  subject_type text not null check (subject_type in ('realm', 'province', 'character', 'race', 'item', 'poi')),
  subject_id uuid not null,
  visibility_level text not null default 'summary' check (visibility_level in ('none', 'summary', 'details', 'exact')),
  allowed_fields jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  granted_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_visibility_grants_viewer on public.visibility_grants (viewer_realm_id);
create index if not exists idx_visibility_grants_subject on public.visibility_grants (subject_type, subject_id);

create table if not exists public.intel_requests (
  id uuid primary key default gen_random_uuid(),
  requester_realm_id uuid not null references public.realms (id) on delete cascade,
  target_type text not null check (target_type in ('realm', 'province', 'character', 'race', 'item', 'poi')),
  target_id uuid not null,
  request_kind text not null,
  requested_fields jsonb not null default '{}'::jsonb,
  dice jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intel_reports (
  id uuid primary key default gen_random_uuid(),
  intel_request_id uuid not null references public.intel_requests (id) on delete cascade,
  mj_user_id uuid references auth.users (id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================
-- RLS : activation
-- =========================

alter table public.mj_admins enable row level security;
alter table public.realms enable row level security;
alter table public.provinces enable row level security;
alter table public.resource_kinds enable row level security;
alter table public.province_resources enable row level security;
alter table public.realm_resources enable row level security;
alter table public.tick_config enable row level security;
alter table public.tick_runs enable row level security;
alter table public.realm_history enable row level security;
alter table public.province_history enable row level security;
alter table public.tick_resource_changes enable row level security;
alter table public.diplomatic_relations enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_lines enable row level security;
alter table public.races enable row level security;
alter table public.province_races enable row level security;
alter table public.poi enable row level security;
alter table public.characters enable row level security;
alter table public.items enable row level security;
alter table public.military_unit_types enable row level security;
alter table public.realm_armies enable row level security;
alter table public.realm_army_units enable row level security;
alter table public.effects enable row level security;
alter table public.visibility_grants enable row level security;
alter table public.intel_requests enable row level security;
alter table public.intel_reports enable row level security;

-- =========================
-- RLS : policies de base
-- =========================

-- MJ : full access (pattern générique)
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'mj_admins','realms','provinces','resource_kinds','province_resources','realm_resources',
        'tick_config','tick_runs','realm_history','province_history','tick_resource_changes',
        'diplomatic_relations','transactions','transaction_lines',
        'races','province_races','poi','characters','items',
        'military_unit_types','realm_armies','realm_army_units',
        'effects','visibility_grants','intel_requests','intel_reports'
      )
  loop
    execute format('drop policy if exists mj_all_%I on public.%I', r.tablename, r.tablename);
    execute format(
      'create policy mj_all_%I on public.%I for all using (public.is_mj()) with check (public.is_mj())',
      r.tablename, r.tablename
    );
  end loop;
end $$;

-- mj_admins : permettre à un MJ de lire la liste (utile UI MJ), mais pas d’auto-escalade par défaut.
drop policy if exists mj_admins_self_read on public.mj_admins;
create policy mj_admins_self_read
on public.mj_admins
for select
using (public.is_mj());

-- realms : propriétaire lit son royaume
drop policy if exists realms_owner_select on public.realms;
create policy realms_owner_select
on public.realms
for select
using (player_user_id = auth.uid());

-- realms : propriétaire peut mettre à jour quelques champs (optionnel). Pour un schéma initial, on autorise update complet sur son realm.
drop policy if exists realms_owner_update on public.realms;
create policy realms_owner_update
on public.realms
for update
using (player_user_id = auth.uid())
with check (player_user_id = auth.uid());

-- provinces : propriétaire via realm
drop policy if exists provinces_owner_select on public.provinces;
create policy provinces_owner_select
on public.provinces
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = provinces.realm_id
      and r.player_user_id = auth.uid()
  )
);

-- resources : accès propriétaire via province/realm
drop policy if exists province_resources_owner_select on public.province_resources;
create policy province_resources_owner_select
on public.province_resources
for select
using (
  exists (
    select 1
    from public.provinces p
    join public.realms r on r.id = p.realm_id
    where p.id = province_resources.province_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists realm_resources_owner_select on public.realm_resources;
create policy realm_resources_owner_select
on public.realm_resources
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = realm_resources.realm_id
      and r.player_user_id = auth.uid()
  )
);

-- resource_kinds : visible à tous les utilisateurs authentifiés (sinon impossible d’afficher des clés).
drop policy if exists resource_kinds_authenticated_select on public.resource_kinds;
create policy resource_kinds_authenticated_select
on public.resource_kinds
for select
using (auth.role() = 'authenticated');

-- ticks : lectures limitées au MJ (les joueurs liront via history/summary plus tard)
drop policy if exists tick_runs_owner_select on public.tick_runs;
create policy tick_runs_owner_select
on public.tick_runs
for select
using (public.is_mj());

drop policy if exists tick_config_owner_select on public.tick_config;
create policy tick_config_owner_select
on public.tick_config
for select
using (public.is_mj());

-- history : joueur lit uniquement l’historique de son realm / ses provinces
drop policy if exists realm_history_owner_select on public.realm_history;
create policy realm_history_owner_select
on public.realm_history
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = realm_history.realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists province_history_owner_select on public.province_history;
create policy province_history_owner_select
on public.province_history
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = province_history.realm_id
      and r.player_user_id = auth.uid()
  )
);

-- diplomatic_relations : si le joueur est partie prenante
drop policy if exists diplomatic_relations_party_select on public.diplomatic_relations;
create policy diplomatic_relations_party_select
on public.diplomatic_relations
for select
using (
  exists (
    select 1
    from public.realms r
    where r.player_user_id = auth.uid()
      and (r.id = diplomatic_relations.realm_a_id or r.id = diplomatic_relations.realm_b_id)
  )
);

-- transactions : si le joueur est partie prenante
drop policy if exists transactions_party_select on public.transactions;
create policy transactions_party_select
on public.transactions
for select
using (
  exists (
    select 1
    from public.realms r
    where r.player_user_id = auth.uid()
      and (r.id = transactions.from_realm_id or r.id = transactions.to_realm_id)
  )
);

drop policy if exists transaction_lines_party_select on public.transaction_lines;
create policy transaction_lines_party_select
on public.transaction_lines
for select
using (
  exists (
    select 1
    from public.transactions t
    join public.realms r on r.player_user_id = auth.uid()
    where t.id = transaction_lines.transaction_id
      and (r.id = t.from_realm_id or r.id = t.to_realm_id)
  )
);

-- races / poi / province_races / military_unit_types : lecture autorisée aux authentifiés (nécessaire UI), écriture MJ uniquement.
drop policy if exists races_authenticated_select on public.races;
create policy races_authenticated_select on public.races for select using (auth.role() = 'authenticated');

drop policy if exists poi_owner_select on public.poi;
create policy poi_owner_select
on public.poi
for select
using (
  exists (
    select 1
    from public.provinces p
    join public.realms r on r.id = p.realm_id
    where p.id = poi.province_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists province_races_owner_select on public.province_races;
create policy province_races_owner_select
on public.province_races
for select
using (
  exists (
    select 1
    from public.provinces p
    join public.realms r on r.id = p.realm_id
    where p.id = province_races.province_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists military_unit_types_authenticated_select on public.military_unit_types;
create policy military_unit_types_authenticated_select
on public.military_unit_types
for select
using (auth.role() = 'authenticated');

-- characters/items/armies : propriétaire via realm
drop policy if exists characters_owner_select on public.characters;
create policy characters_owner_select
on public.characters
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = characters.realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists items_owner_select on public.items;
create policy items_owner_select
on public.items
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = items.realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists realm_armies_owner_select on public.realm_armies;
create policy realm_armies_owner_select
on public.realm_armies
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = realm_armies.realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists realm_army_units_owner_select on public.realm_army_units;
create policy realm_army_units_owner_select
on public.realm_army_units
for select
using (
  exists (
    select 1
    from public.realm_armies a
    join public.realms r on r.id = a.realm_id
    where a.id = realm_army_units.realm_army_id
      and r.player_user_id = auth.uid()
  )
);

-- effects : par défaut, le joueur ne voit que les effets ciblant ses entités (realm/province/character/item/poi/race) qu’il possède.
drop policy if exists effects_owner_select on public.effects;
create policy effects_owner_select
on public.effects
for select
using (
  public.is_mj()
  or (
    target_type = 'realm'
    and exists (select 1 from public.realms r where r.id = effects.target_id and r.player_user_id = auth.uid())
  )
  or (
    target_type = 'province'
    and exists (
      select 1
      from public.provinces p
      join public.realms r on r.id = p.realm_id
      where p.id = effects.target_id and r.player_user_id = auth.uid()
    )
  )
  or (
    target_type = 'character'
    and exists (
      select 1
      from public.characters c
      join public.realms r on r.id = c.realm_id
      where c.id = effects.target_id and r.player_user_id = auth.uid()
    )
  )
  or (
    target_type = 'item'
    and exists (
      select 1
      from public.items i
      join public.realms r on r.id = i.realm_id
      where i.id = effects.target_id and r.player_user_id = auth.uid()
    )
  )
  or (
    target_type = 'poi'
    and exists (
      select 1
      from public.poi x
      join public.provinces p on p.id = x.province_id
      join public.realms r on r.id = p.realm_id
      where x.id = effects.target_id and r.player_user_id = auth.uid()
    )
  )
  -- race : visible seulement si race présente dans une province du royaume du joueur (option de base)
  or (
    target_type = 'race'
    and exists (
      select 1
      from public.province_races pr
      join public.provinces p on p.id = pr.province_id
      join public.realms r on r.id = p.realm_id
      where pr.race_id = effects.target_id and r.player_user_id = auth.uid()
    )
  )
);

-- visibility_grants / intel : joueur voit uniquement ce qu’il a demandé ou ce qui lui est accordé
drop policy if exists visibility_grants_viewer_select on public.visibility_grants;
create policy visibility_grants_viewer_select
on public.visibility_grants
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = visibility_grants.viewer_realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists intel_requests_requester_select on public.intel_requests;
create policy intel_requests_requester_select
on public.intel_requests
for select
using (
  exists (
    select 1
    from public.realms r
    where r.id = intel_requests.requester_realm_id
      and r.player_user_id = auth.uid()
  )
);

drop policy if exists intel_reports_requester_select on public.intel_reports;
create policy intel_reports_requester_select
on public.intel_reports
for select
using (
  exists (
    select 1
    from public.intel_requests req
    join public.realms r on r.id = req.requester_realm_id
    where req.id = intel_reports.intel_request_id
      and r.player_user_id = auth.uid()
  )
);

commit;

