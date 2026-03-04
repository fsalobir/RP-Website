-- Ne plus gérer les types « refusée » : trigger n'insère que accepted ; suppression des refusés en base.

-- 1. Supprimer les données refusées (ordre pour respecter les FK)
DELETE FROM public.discord_dispatch_snippet_pools WHERE outcome = 'refused';

DELETE FROM public.discord_dispatch_templates
WHERE dispatch_type_id IN (SELECT id FROM public.discord_dispatch_types WHERE outcome = 'refused');

DELETE FROM public.discord_dispatch_types WHERE outcome = 'refused';

-- 2. Modifier le trigger : n'insérer que la ligne « acceptée » et un template
DROP TRIGGER IF EXISTS sync_discord_dispatch_types_trigger ON public.state_action_types;

CREATE OR REPLACE FUNCTION public.sync_discord_dispatch_types_on_state_action_type_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id_acc uuid;
BEGIN
  INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
  VALUES (NEW.key || '_accepted', NEW.label_fr || ' acceptée', true, NEW.sort_order * 2, NEW.id, 'accepted', 'international')
  RETURNING id INTO id_acc;
  INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
  VALUES (id_acc, 'Brève — acceptation', 'Selon nos sources, {country_name} et {target_country_name} : {action_label} menée à son terme. {impact_magnitude_bold} {date}', '2e7d32', '[]', 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_discord_dispatch_types_trigger
  AFTER INSERT ON public.state_action_types
  FOR EACH ROW EXECUTE PROCEDURE public.sync_discord_dispatch_types_on_state_action_type_insert();
