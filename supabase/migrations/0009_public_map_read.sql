-- Lecture publique de la carte : anon peut lire les données nécessaires à l’affichage
-- de la carte (régions, provinces, villes, POI visibles). La carte MJ reste autoritaire ;
-- ces policies permettent à la carte publique de refléter les mêmes données.

-- map_base_regions : géométries des régions (carte)
drop policy if exists map_base_regions_public_select on public.map_base_regions;
create policy map_base_regions_public_select on public.map_base_regions
for select to anon
using (true);

-- province_base_regions : liaison région → province (qui contrôle quoi)
drop policy if exists province_base_regions_public_select on public.province_base_regions;
create policy province_base_regions_public_select on public.province_base_regions
for select to anon
using (true);

-- provinces : noms, royaume (affichage carte publique)
drop policy if exists provinces_public_select on public.provinces;
create policy provinces_public_select on public.provinces
for select to anon
using (true);

-- cities : villes sur la carte
drop policy if exists cities_public_select on public.cities;
create policy cities_public_select on public.cities
for select to anon
using (true);

-- poi : points d’intérêt visibles sur la carte (on filtre is_visible côté app)
drop policy if exists poi_public_select on public.poi;
create policy poi_public_select on public.poi
for select to anon
using (true);
