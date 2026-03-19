-- Lecture publique de la liste des royaumes (accueil) : anon et authentifié peuvent voir id, slug, name, is_npc.
-- Les politiques existantes (realms_owner_select, mj_all_realms) restent en vigueur ; celle-ci ajoute l’accès en lecture pour tous.
drop policy if exists realms_public_list on public.realms;
create policy realms_public_list
on public.realms
for select
using (true);
