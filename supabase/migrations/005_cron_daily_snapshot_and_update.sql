-- Logique du cron quotidien : snapshot dans country_history puis mise à jour des pays.
-- À exécuter une fois par jour (pg_cron ou Edge Function + cron externe).
--
-- Principe :
-- 1. On insère dans country_history un snapshot des valeurs ACTUELLES de chaque pays (date = aujourd'hui).
--    Ainsi le front pourra comparer "avant" (ce snapshot) et "après" (countries après UPDATE).
-- 2. On met à jour la table countries (population, gdp, etc.) selon rule_parameters.
--
-- Aucune "inscription" séparée : tout pays présent dans countries est inclus (INSERT ... SELECT FROM countries).
-- Quand tu ajoutes un pays en admin, il a déjà un id ; au prochain passage du cron, il aura une ligne dans country_history.

-- Exemple de fonction appelable par pg_cron (à adapter selon tes formules).
CREATE OR REPLACE FUNCTION public.run_daily_country_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  growth_rate numeric;
  gdp_rate numeric;
BEGIN
  -- 1) Snapshot : enregistrer l'état actuel dans country_history (date = aujourd'hui)
  --    ON CONFLICT : si le cron tourne 2 fois le même jour, on écrase le snapshot du jour.
  INSERT INTO public.country_history (
    country_id,
    date,
    population,
    gdp,
    militarism,
    industry,
    science,
    stability
  )
  SELECT
    c.id,
    current_date,
    c.population,
    c.gdp,
    c.militarism,
    c.industry,
    c.science,
    c.stability
  FROM public.countries c
  ON CONFLICT (country_id, date)
  DO UPDATE SET
    population = EXCLUDED.population,
    gdp = EXCLUDED.gdp,
    militarism = EXCLUDED.militarism,
    industry = EXCLUDED.industry,
    science = EXCLUDED.science,
    stability = EXCLUDED.stability;

  -- 2) Lire les paramètres (exemples ; adapter les clés à ta table rule_parameters)
  SELECT (value #>> '{}')::numeric INTO growth_rate
  FROM public.rule_parameters WHERE key = 'population_growth_base_rate' LIMIT 1;
  growth_rate := COALESCE(growth_rate, 0.001);

  SELECT (value #>> '{}')::numeric INTO gdp_rate
  FROM public.rule_parameters WHERE key = 'gdp_growth_base_rate' LIMIT 1;
  gdp_rate := COALESCE(gdp_rate, 0.0005);

  -- 3) Mettre à jour les pays (formules à affiner selon tes règles)
  UPDATE public.countries
  SET
    population = GREATEST(0, population + (population * growth_rate))::bigint,
    gdp = GREATEST(0, gdp + (gdp * gdp_rate)),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot dans country_history puis mise à jour population/PIB. À planifier (pg_cron ou externe).';

-- Optionnel : planifier avec pg_cron (si dispo sur ton projet Supabase)
-- SELECT cron.schedule('daily-country-update', '0 6 * * *', 'SELECT public.run_daily_country_update()');
