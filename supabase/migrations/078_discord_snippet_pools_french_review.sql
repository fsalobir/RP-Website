-- Revue des phrases des pools génériques (state_action_type_id NULL) pour un français plus naturel et cohérent.
-- Titres : formules courtes type brève. Descriptions : enchaînements fluides, magnitude intégrée naturellement.

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "Diplomatie : {country_name} et {target_country_name} renforcent leurs liens",
  "Rapprochement entre {country_name} et {target_country_name}",
  "Succès diplomatique : {country_name} et {target_country_name} trouvent un terrain d''entente",
  "Relations : {country_name} et {target_country_name} consolident leur partenariat",
  "Négociations abouties entre {country_name} et {target_country_name}",
  "Entente : {country_name} et {target_country_name} renouent le dialogue",
  "Accord : {country_name} et {target_country_name} scellent une coopération",
  "Détente : {country_name} et {target_country_name} apaisent les tensions",
  "Initiative réussie : {country_name} vers {target_country_name}",
  "Coopération : {country_name} et {target_country_name} renforcent leurs échanges",
  "Dialogue fructueux entre {country_name} et {target_country_name}",
  "Résultat positif : {country_name} et {target_country_name} en progression",
  "Partenariat : {country_name} et {target_country_name} convergent",
  "Ouverture : {country_name} et {target_country_name} renouent",
  "Succès : {action_label} de {country_name} envers {target_country_name} porte ses fruits",
  "Mission accomplie : {country_name} et {target_country_name} renforcent les liens"
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'accepted' AND dice_result = 'success' AND slot = 'title';

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "Selon nos sources, {country_name} et {target_country_name} ont conclu un accord. L''impact sur les relations est évalué à {impact_magnitude_bold}. Les observateurs saluent cette avancée.",
  "La démarche de {country_name} envers {target_country_name} a porté ses fruits. L''effet mesuré est {impact_magnitude_bold}. Les chancelleries prennent note.",
  "{country_name} et {target_country_name} renforcent leur coopération. L''impact sur les indicateurs est évalué à {impact_magnitude_bold}. Suivi attendu dans les prochains jours.",
  "Les relations entre {country_name} et {target_country_name} s''améliorent. Magnitude de l''impact : {impact_magnitude_bold}. Les deux parties se disent satisfaites.",
  "Initiative réussie de {country_name} à l''égard de {target_country_name}. L''impact enregistré est {impact_magnitude_bold}. Les médias relaient l''information.",
  "Rapprochement confirmé entre {country_name} et {target_country_name}. L''effet sur les relations est évalué à {impact_magnitude_bold}. Les analystes restent attentifs.",
  "{country_name} a obtenu un résultat positif avec {target_country_name}. L''impact mesuré est {impact_magnitude_bold}. Communiqué attendu.",
  "Dialogue fructueux entre {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les marchés réagissent avec modération.",
  "Les négociations entre {country_name} et {target_country_name} ont abouti. L''effet sur les relations est {impact_magnitude_bold}. Les observateurs commentent.",
  "Coopération renforcée : {country_name} et {target_country_name} affichent des progrès. Magnitude de l''impact : {impact_magnitude_bold}.",
  "{country_name} et {target_country_name} scellent un accord. L''impact est évalué à {impact_magnitude_bold}. Les deux capitales se félicitent.",
  "Succès diplomatique pour {country_name} envers {target_country_name}. L''effet mesuré est {impact_magnitude_bold}. Les commentateurs soulignent l''importance de la démarche.",
  "Entente confirmée entre {country_name} et {target_country_name}. L''impact sur les relations est {impact_magnitude_bold}. Réactions mitigées selon les cercles.",
  "Détente entre {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les analystes restent prudents.",
  "Partenariat renforcé : {country_name} et {target_country_name} enregistrent une avancée. Magnitude : {impact_magnitude_bold}.",
  "Résultat positif pour {country_name} et {target_country_name}. L''effet sur les relations est {impact_magnitude_bold}. Suivi à prévoir."
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'accepted' AND dice_result = 'success' AND slot = 'description';

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "Tentative avortée : {country_name} et {target_country_name} sans accord",
  "Échec du rapprochement entre {country_name} et {target_country_name}",
  "Initiative sans suite : {country_name} et {target_country_name} restent en désaccord",
  "Négociations infructueuses : {country_name} et {target_country_name} ne trouvent pas d''entente",
  "Jet manqué : {country_name} rate son approche envers {target_country_name}",
  "Tension maintenue : {country_name} et {target_country_name} sans avancée",
  "Échec diplomatique : {country_name} et {target_country_name} en impasse",
  "Tentative sans effet : {country_name} vers {target_country_name}",
  "Dialogue en panne entre {country_name} et {target_country_name}",
  "Résultat décevant : {country_name} et {target_country_name} ne convergent pas",
  "Initiative sans impact : {country_name} et {target_country_name}",
  "Échec : {action_label} de {country_name} envers {target_country_name} sans suite",
  "Pas d''accord : {country_name} et {target_country_name} restent à distance",
  "Tentative ratée : {country_name} et {target_country_name} sans résultat",
  "Rapprochement manqué entre {country_name} et {target_country_name}",
  "Sans effet : {country_name} et {target_country_name} en attente"
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'accepted' AND dice_result = 'failure' AND slot = 'title';

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "La démarche de {country_name} envers {target_country_name} n''a pas abouti. {dice_success_label}. Les observateurs notent l''absence d''impact mesurable.",
  "Tentative infructueuse entre {country_name} et {target_country_name}. {dice_success_label}. Les chancelleries restent sur leur position.",
  "{country_name} et {target_country_name} n''ont pas trouvé d''entente. {dice_success_label}. Aucun effet significatif sur les relations.",
  "Les négociations entre {country_name} et {target_country_name} ont échoué. {dice_success_label}. Les deux parties se retirent sans accord.",
  "Initiative sans suite : {country_name} vers {target_country_name}. {dice_success_label}. Les analystes soulignent les blocages.",
  "Rapprochement manqué entre {country_name} et {target_country_name}. {dice_success_label}. Pas d''impact enregistré sur les indicateurs.",
  "{country_name} a échoué à faire avancer le dialogue avec {target_country_name}. {dice_success_label}. Les médias relaient l''impasse.",
  "Échec du dialogue entre {country_name} et {target_country_name}. {dice_success_label}. Les relations restent inchangées.",
  "Tentative sans effet de {country_name} à l''égard de {target_country_name}. {dice_success_label}. Aucune évolution attendue.",
  "Les pourparlers entre {country_name} et {target_country_name} n''ont pas porté leurs fruits. {dice_success_label}. Situation figée.",
  "{country_name} et {target_country_name} restent en désaccord. {dice_success_label}. Les observateurs attendent une nouvelle initiative.",
  "Initiative avortée : {country_name} et {target_country_name}. {dice_success_label}. Pas d''impact sur les relations.",
  "Dialogue en panne entre {country_name} et {target_country_name}. {dice_success_label}. Les commentateurs restent prudents.",
  "Échec confirmé pour {country_name} envers {target_country_name}. {dice_success_label}. Aucun changement notable.",
  "Tentative ratée : {country_name} et {target_country_name}. {dice_success_label}. Les deux capitales gardent leurs positions.",
  "Résultat négatif : {country_name} et {target_country_name} sans avancée. {dice_success_label}."
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'accepted' AND dice_result = 'failure' AND slot = 'description';

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "Refus : la demande de {country_name} rejetée",
  "Demande refusée : {country_name} ne peut pas poursuivre",
  "Rejet : l''initiative de {country_name} n''est pas retenue",
  "Refus ministériel : {country_name} voit sa demande rejetée",
  "Décision négative pour {country_name}",
  "La demande de {country_name} (« {action_label} ») est refusée",
  "Rejet de la demande : {country_name} et {target_country_name} sans suite",
  "Refus officiel : {country_name} ne peut pas mener l''action",
  "Demande rejetée : {country_name} (« {action_label} ») sans accord",
  "Décision : refus pour la demande de {country_name}",
  "Rejet : {country_name} et {target_country_name} en attente",
  "Refus de l''autorité : la demande de {country_name} n''est pas acceptée",
  "Sans accord : {country_name} voit sa demande refusée",
  "Demande rejetée : {country_name} (« {action_label} »)",
  "Refus : {country_name} ne peut pas procéder",
  "Décision négative : la demande de {country_name} est rejetée"
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'refused' AND dice_result IS NULL AND slot = 'title';

UPDATE public.discord_dispatch_snippet_pools
SET phrases = '[
  "La demande de {country_name} (« {action_label} ») a été refusée. Motif invoqué : {refusal_message}. Les observateurs prennent acte.",
  "Refus officiel pour la demande de {country_name}. {refusal_message}. Les chancelleries ont été informées.",
  "{country_name} voit sa demande rejetée. Raison invoquée : {refusal_message}. Pas de suite prévue pour l''instant.",
  "La demande de {country_name} n''a pas été retenue. {refusal_message}. Les médias relaient la décision.",
  "Rejet de la demande de {country_name} (« {action_label} »). {refusal_message}. Les analystes commentent.",
  "Décision négative : la demande de {country_name} est refusée. {refusal_message}. Pas d''impact sur les relations pour l''instant.",
  "{country_name} ne peut pas poursuivre son initiative. Raison : {refusal_message}. Les deux parties restent en attente.",
  "Refus ministériel pour {country_name}. {refusal_message}. La demande concernait « {action_label} ». Suivi à prévoir.",
  "La demande de {country_name} (« {action_label} ») a été rejetée. {refusal_message}. Les observateurs notent la décision.",
  "Rejet officiel : {country_name} ne peut pas mener l''action. Motif : {refusal_message}. Communiqué diffusé.",
  "{country_name} voit sa demande refusée. {refusal_message}. Les commentateurs soulignent les enjeux.",
  "Demande rejetée pour {country_name}. Raison : {refusal_message}. Pas d''évolution attendue à court terme.",
  "Refus de la demande de {country_name} (« {action_label} »). {refusal_message}. Les capitales prennent note.",
  "Décision : la demande de {country_name} n''est pas acceptée. {refusal_message}. Les analystes restent attentifs.",
  "La demande de {country_name} a été rejetée. Motif : {refusal_message}. Situation inchangée.",
  "Refus pour {country_name}. {refusal_message}. La demande (« {action_label} ») ne sera pas exécutée."
]'::jsonb
WHERE state_action_type_id IS NULL AND outcome = 'refused' AND dice_result IS NULL AND slot = 'description';
