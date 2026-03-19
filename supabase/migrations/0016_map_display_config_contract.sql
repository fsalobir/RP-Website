-- Contrat strict de la config carte publiée (MJ -> Public)
-- Rétrocompat: si l'ancienne valeur plate existe, on l'enveloppe.

do $$
declare
  raw jsonb;
  cfg jsonb;
  has_config boolean;
begin
  select value into raw
  from public.rule_parameters
  where key = 'map_display_config';

  if raw is null then
    return;
  end if;

  has_config := (raw ? 'config') and jsonb_typeof(raw->'config') = 'object';
  cfg := case when has_config then raw->'config' else raw end;

  update public.rule_parameters
  set value = jsonb_build_object(
    'schemaVersion', coalesce((raw->>'schemaVersion')::int, 1),
    'version', coalesce((raw->>'version')::int, 1),
    'updatedAt', coalesce(raw->>'updatedAt', now()::text),
    'updatedBy', raw->>'updatedBy',
    'config', cfg
  ),
  updated_at = now()
  where key = 'map_display_config';
end $$;

