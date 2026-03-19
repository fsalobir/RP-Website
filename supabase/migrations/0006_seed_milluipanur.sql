-- Royaume de base (MVP) : Milluipanûr

insert into public.realms (slug, name, is_npc, settings)
values (
  'milluipanur',
  'Milluipanûr',
  true,
  jsonb_build_object(
    'color', '#C0C0C0',
    'flag_url', null,
    'race', '—',
    'leader', '—'
  )
)
on conflict (slug) do update
set
  name = excluded.name,
  is_npc = excluded.is_npc,
  settings = public.realms.settings || excluded.settings;

