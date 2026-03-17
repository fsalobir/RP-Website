-- Enregistrement des jobs pg_cron : passage de jour (6h UTC) et génération events IA (toutes les heures).
-- Prérequis : activer l'extension pg_cron dans Supabase (Database → Extensions) avant d'appliquer cette migration,
-- sinon les jobs ne seront pas planifiés. En cas d'activation ultérieure de pg_cron, relancer supabase db push.

-- Note tests locaux/CI : on tente d'activer pg_cron automatiquement. Si pg_cron n'est pas disponible
-- (ex. image Postgres sans support), on skip la planification pour ne pas bloquer `db reset`.
DO $plpgsql$
BEGIN
  -- Si pg_cron n'est pas disponible, on n'échoue pas la migration.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron indisponible, planification des jobs ignorée';
    RETURN;
  END;

  -- (Ré)enregistrer les jobs idempotemment.
  BEGIN
    PERFORM cron.unschedule('daily-country-update');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'daily-country-update',
    '0 6 * * *',
    $cron$SELECT public.run_daily_country_update()$cron$
  );

  BEGIN
    PERFORM cron.unschedule('ai-events-generation');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'ai-events-generation',
    '0 * * * *',
    $cron$SELECT public.run_ai_events_cron()$cron$
  );
END
$plpgsql$;