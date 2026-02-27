-- Restreindre l’accès aux logs cron aux admins uniquement.

ALTER TABLE public.country_update_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Country update logs: lecture publique" ON public.country_update_logs;
DROP POLICY IF EXISTS "Country update logs: lecture par admin" ON public.country_update_logs;

CREATE POLICY "Country update logs: lecture par admin"
  ON public.country_update_logs
  FOR SELECT
  USING (public.is_admin());

