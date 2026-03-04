-- Remplacer "Décision ministérielle" par un style brève de presse pour tous les templates Discord.
-- Met à jour les templates existants et le trigger pour les futurs types.

-- 1) Mise à jour des templates existants (acceptée)
UPDATE public.discord_dispatch_templates t
SET
  label_fr = 'Brève — acceptation',
  body_template = 'Selon nos sources, {country_name} et {target_country_name} : {action_label} menée à son terme. {impact_magnitude_bold} {date}'
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.outcome = 'accepted';

-- 2) Mise à jour des templates existants (refusée)
UPDATE public.discord_dispatch_templates t
SET
  label_fr = 'Brève — refus',
  body_template = 'Rejet de la demande de {country_name} (« {action_label} »). {refusal_message} {date}'
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.outcome = 'refused';

-- 3) Trigger : nouveaux types d'action d'État créent des templates en style brève
CREATE OR REPLACE FUNCTION public.sync_discord_dispatch_types_on_state_action_type_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id_acc uuid;
  id_ref uuid;
BEGIN
  INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
  VALUES (NEW.key || '_accepted', NEW.label_fr || ' acceptée', true, NEW.sort_order * 2, NEW.id, 'accepted', 'international')
  RETURNING id INTO id_acc;
  INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
  VALUES (NEW.key || '_refused', NEW.label_fr || ' refusée', true, NEW.sort_order * 2 + 1, NEW.id, 'refused', 'international')
  RETURNING id INTO id_ref;
  INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
  VALUES (id_acc, 'Brève — acceptation', 'Selon nos sources, {country_name} et {target_country_name} : {action_label} menée à son terme. {impact_magnitude_bold} {date}', '2e7d32', '[]', 0);
  INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
  VALUES (id_ref, 'Brève — refus', 'Rejet de la demande de {country_name} (« {action_label} »). {refusal_message} {date}', 'c62828', '[]', 0);
  RETURN NEW;
END;
$$;
