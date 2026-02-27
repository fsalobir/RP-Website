-- Normaliser les valeurs des effets de croissance : si stockées en % (|value| > 1), les convertir en décimal.
-- Ex. -95 (pour -95 %) → -0.95. Ainsi le cron et l'affichage utilisent la même convention.

UPDATE public.country_effects
SET value = value / 100.0
WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat', 'population_growth_base', 'population_growth_per_stat')
  AND ABS(value) > 1;

COMMENT ON COLUMN public.country_effects.value IS 'Pour croissance PIB/population : taux en décimal (ex. -0.95 = -95 %). Pour stat_delta : delta par mise à jour. Pour budget_* : selon le sous-type.';
