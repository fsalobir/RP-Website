-- Fonction helper gravité (une expression). Une seule instruction par fichier pour le CLI.

-- Pas de mot END dans le corps (le parser distant le traite comme délimiteur).
CREATE OR REPLACE FUNCTION public.cron_gravity_factor(c numeric, ga boolean, gp numeric, av numeric, cv numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
SELECT c * ((1 - (ga::int)) * 1 + (ga::int) * GREATEST(0.1, LEAST(2, 1 + (gp/100.0) * ((av-cv)/NULLIF(av,0)*(1+sign(c))/2 + (cv-av)/NULLIF(av,0)*(1-sign(c))/2))))
$$;
