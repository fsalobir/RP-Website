-- 0007_storage_buckets.sql
-- Buckets Storage + policies nécessaires aux uploads d'icônes.

begin;

-- Bacs de base (utilisés par l'appli)
insert into storage.buckets (id, name, public)
values
  ('flags', 'flags', true),
  ('unit-icons', 'unit-icons', true),
  ('avantages', 'avantages', true)
on conflict (id) do nothing;

-- Permissions lecture publique (via getPublicUrl)
drop policy if exists "flags public read" on storage.objects;
drop policy if exists "unit-icons public read" on storage.objects;
drop policy if exists "avantages public read" on storage.objects;

create policy "flags public read"
on storage.objects
for select
to public
using (bucket_id = 'flags');

create policy "unit-icons public read"
on storage.objects
for select
to public
using (bucket_id = 'unit-icons');

create policy "avantages public read"
on storage.objects
for select
to public
using (bucket_id = 'avantages');

-- Upload / modification par les MJ
drop policy if exists "unit-icons mj insert" on storage.objects;
drop policy if exists "unit-icons mj update" on storage.objects;
drop policy if exists "unit-icons mj delete" on storage.objects;

create policy "unit-icons mj insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'unit-icons' and public.is_mj() = true);

create policy "unit-icons mj update"
on storage.objects
for update
to authenticated
using (bucket_id = 'unit-icons' and public.is_mj() = true)
with check (bucket_id = 'unit-icons' and public.is_mj() = true);

create policy "unit-icons mj delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'unit-icons' and public.is_mj() = true);

-- Note : l'upload d'icônes d'avantages / flags est géré via des composants
-- admin côté client. On applique les mêmes règles MJ par sécurité.
drop policy if exists "flags mj insert" on storage.objects;
drop policy if exists "flags mj update" on storage.objects;
drop policy if exists "flags mj delete" on storage.objects;
drop policy if exists "avantages mj insert" on storage.objects;
drop policy if exists "avantages mj update" on storage.objects;
drop policy if exists "avantages mj delete" on storage.objects;

create policy "flags mj insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'flags' and public.is_mj() = true);

create policy "flags mj update"
on storage.objects
for update
to authenticated
using (bucket_id = 'flags' and public.is_mj() = true)
with check (bucket_id = 'flags' and public.is_mj() = true);

create policy "flags mj delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'flags' and public.is_mj() = true);

create policy "avantages mj insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'avantages' and public.is_mj() = true);

create policy "avantages mj update"
on storage.objects
for update
to authenticated
using (bucket_id = 'avantages' and public.is_mj() = true)
with check (bucket_id = 'avantages' and public.is_mj() = true);

create policy "avantages mj delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'avantages' and public.is_mj() = true);

commit;

