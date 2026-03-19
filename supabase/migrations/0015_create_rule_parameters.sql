-- Crée rule_parameters si absent (utilisé par les réglages carte MJ/public)
-- et ouvre la lecture publique en gardant l'écriture réservée MJ.

create table if not exists public.rule_parameters (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rule_parameters enable row level security;

drop policy if exists rule_parameters_public_select on public.rule_parameters;
create policy rule_parameters_public_select
on public.rule_parameters
for select
using (true);

drop policy if exists rule_parameters_mj_all on public.rule_parameters;
create policy rule_parameters_mj_all
on public.rule_parameters
for all
using (public.is_mj())
with check (public.is_mj());
