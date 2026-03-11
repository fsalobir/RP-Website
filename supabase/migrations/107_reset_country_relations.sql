-- Reset global des relations diplomatiques à 0 (pré-config admins).
UPDATE public.country_relations
SET value = 0, updated_at = now();
