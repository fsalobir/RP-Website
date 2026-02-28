-- Documenter que le cron lit toujours les paramètres à jour (aucun cache).
-- Lorsque les admins modifient les règles (rule_parameters, ex. mobilisation_config,
-- mobilisation_level_effects, taux de croissance, etc.) et enregistrent, la prochaine
-- exécution du cron utilisera ces nouvelles valeurs.

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot country_history, évolution score mobilisation, mise à jour pays (rule_parameters + country_effects + mobilisation + bonus budget), décrément country_effects. Tous les paramètres (rule_parameters : mobilisation_config, mobilisation_level_effects, taux de croissance, etc.) sont lus depuis la base à chaque exécution ; les modifications effectuées par les admins sont donc prises en compte à la prochaine mise à jour.';
