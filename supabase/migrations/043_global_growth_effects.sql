-- Règles globales dynamiques : un seul paramètre (tableau d'effets) pour la croissance PIB/population.
-- Seed initial à partir des 10 clés existantes pour conserver le comportement actuel.

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'global_growth_effects',
  COALESCE(
    (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT 1 AS ord, jsonb_build_object(
        'effect_kind', 'gdp_growth_base',
        'effect_target', NULL,
        'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0.0005) FROM public.rule_parameters WHERE key = 'gdp_growth_base_rate' LIMIT 1), 0.0005)
      ) AS elem
      UNION ALL SELECT 2, jsonb_build_object('effect_kind', 'gdp_growth_per_stat', 'effect_target', 'militarism', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'gdp_growth_per_militarism' LIMIT 1), 0))
      UNION ALL SELECT 3, jsonb_build_object('effect_kind', 'gdp_growth_per_stat', 'effect_target', 'industry', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'gdp_growth_per_industry' LIMIT 1), 0))
      UNION ALL SELECT 4, jsonb_build_object('effect_kind', 'gdp_growth_per_stat', 'effect_target', 'science', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'gdp_growth_per_science' LIMIT 1), 0))
      UNION ALL SELECT 5, jsonb_build_object('effect_kind', 'gdp_growth_per_stat', 'effect_target', 'stability', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'gdp_growth_per_stability' LIMIT 1), 0))
      UNION ALL SELECT 6, jsonb_build_object('effect_kind', 'population_growth_base', 'effect_target', NULL, 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'population_growth_base_rate' LIMIT 1), 0.001))
      UNION ALL SELECT 7, jsonb_build_object('effect_kind', 'population_growth_per_stat', 'effect_target', 'militarism', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'population_growth_per_militarism' LIMIT 1), 0))
      UNION ALL SELECT 8, jsonb_build_object('effect_kind', 'population_growth_per_stat', 'effect_target', 'industry', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'population_growth_per_industry' LIMIT 1), 0))
      UNION ALL SELECT 9, jsonb_build_object('effect_kind', 'population_growth_per_stat', 'effect_target', 'science', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'population_growth_per_science' LIMIT 1), 0))
      UNION ALL SELECT 10, jsonb_build_object('effect_kind', 'population_growth_per_stat', 'effect_target', 'stability', 'value', COALESCE((SELECT public.parse_rule_numeric(value #>> '{}', 0) FROM public.rule_parameters WHERE key = 'population_growth_per_stability' LIMIT 1), 0))
    ) sub
    ),
    '[]'::jsonb
  ),
  'Effets de croissance appliqués à tous les pays (PIB, population). Modifiables dans Admin > Règles.',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'global_growth_effects');
