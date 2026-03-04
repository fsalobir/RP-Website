-- Pools de snippets spécifiques par type d'action d'État (insulte, ouverture, prise d'influence, demande d'up).
-- Cohérence sémantique : insulte = dégradation/tension, ouverture = rapprochement, prise d'influence = emprise, demande_up = sollicitation.

-- Insulte diplomatique (impact négatif sur les relations)
INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Tension diplomatique : {country_name} et {target_country_name} en dispute",
  "Refroidissement des relations entre {country_name} et {target_country_name}",
  "Dégradation : {country_name} et {target_country_name} en conflit verbal",
  "Crise diplomatique entre {country_name} et {target_country_name}",
  "Relations dégradées : {country_name} et {target_country_name} se durcissent",
  "Incident : {country_name} et {target_country_name} en désaccord public",
  "Escalade verbale entre {country_name} et {target_country_name}",
  "Refroidissement : {country_name} et {target_country_name} en tension",
  "{action_label} : {country_name} et {target_country_name} en froid",
  "Tensions : {country_name} et {target_country_name} échangent des griefs",
  "Détérioration des relations entre {country_name} et {target_country_name}",
  "Confrontation diplomatique : {country_name} et {target_country_name}",
  "Relations tendues : {country_name} et {target_country_name} en désaccord",
  "Incident diplomatique entre {country_name} et {target_country_name}",
  "Dégradation des liens : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'insulte_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "La dégradation des relations entre {country_name} et {target_country_name} est actée. L''impact est évalué à {impact_magnitude_bold}. Les chancelleries prennent acte.",
  "Selon nos sources, les relations entre {country_name} et {target_country_name} se sont dégradées. Magnitude : {impact_magnitude_bold}. Les observateurs s''inquiètent.",
  "{country_name} et {target_country_name} enregistrent un refroidissement de leurs relations. L''impact mesuré est {impact_magnitude_bold}. Communiqué attendu.",
  "Tension confirmée entre {country_name} et {target_country_name}. La dégradation est évaluée à {impact_magnitude_bold}. Les deux capitales se renvoient la responsabilité.",
  "Les relations entre {country_name} et {target_country_name} ont nettement baissé. L''effet est {impact_magnitude_bold}. Les médias relaient la crise.",
  "Dégradation des relations : {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les analystes commentent.",
  "Refroidissement entre {country_name} et {target_country_name}. L''impact sur les indicateurs est {impact_magnitude_bold}. Suivi à prévoir.",
  "La démarche de {country_name} envers {target_country_name} a conduit à une baisse des relations. Magnitude : {impact_magnitude_bold}.",
  "{country_name} et {target_country_name} voient leurs relations se détériorer. L''impact est {impact_magnitude_bold}. Les observateurs restent attentifs.",
  "Incident diplomatique entre {country_name} et {target_country_name}. La dégradation est évaluée à {impact_magnitude_bold}. Réactions en cours.",
  "Relations en baisse entre {country_name} et {target_country_name}. L''effet mesuré est {impact_magnitude_bold}. Pas de commentaire officiel pour l''instant.",
  "Confrontation verbale : {country_name} et {target_country_name}. L''impact est {impact_magnitude_bold}. Les commentateurs soulignent les enjeux.",
  "Tension diplomatique entre {country_name} et {target_country_name}. Dégradation évaluée à {impact_magnitude_bold}. Situation à suivre.",
  "Les liens entre {country_name} et {target_country_name} se refroidissent. L''impact : {impact_magnitude_bold}.",
  "Détérioration confirmée entre {country_name} et {target_country_name}. Magnitude de l''impact : {impact_magnitude_bold}."
]'::jsonb FROM public.state_action_types WHERE key = 'insulte_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Tentative sans effet : {country_name} et {target_country_name}",
  "Pas d''impact mesurable entre {country_name} et {target_country_name}",
  "Échec de la démarche : {country_name} envers {target_country_name}",
  "Tentative avortée : {country_name} et {target_country_name} sans conséquence",
  "Sans suite : {action_label} de {country_name} envers {target_country_name}",
  "Jet manqué : {country_name} et {target_country_name} restent stables",
  "Tentative sans résultat entre {country_name} et {target_country_name}",
  "Pas de dégradation : {country_name} et {target_country_name} inchangés",
  "Démarche sans effet : {country_name} vers {target_country_name}",
  "Échec : {country_name} et {target_country_name} sans changement",
  "Tentative sans impact entre {country_name} et {target_country_name}",
  "Relations stables : {country_name} et {target_country_name}",
  "Sans effet mesurable : {country_name} et {target_country_name}",
  "Tentative ratée : {country_name} et {target_country_name}",
  "Pas d''escalade : {country_name} et {target_country_name} en statu quo"
]'::jsonb FROM public.state_action_types WHERE key = 'insulte_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La démarche de {country_name} envers {target_country_name} n''a pas eu d''effet mesurable. {dice_success_label}. Les relations restent inchangées.",
  "Tentative infructueuse entre {country_name} et {target_country_name}. {dice_success_label}. Aucune dégradation enregistrée.",
  "{country_name} et {target_country_name} : la tentative n''a pas porté ses fruits. {dice_success_label}. Pas d''impact sur les indicateurs.",
  "La démarche de {country_name} à l''égard de {target_country_name} est restée sans suite. {dice_success_label}. Les observateurs notent l''absence d''effet.",
  "Tentative sans effet de {country_name} envers {target_country_name}. {dice_success_label}. Les relations restent au même niveau.",
  "Pas d''impact mesurable entre {country_name} et {target_country_name}. {dice_success_label}. Les chancelleries restent sur leur position.",
  "{country_name} n''a pas réussi à dégrader les relations avec {target_country_name}. {dice_success_label}. Situation inchangée.",
  "La tentative de {country_name} envers {target_country_name} n''a pas abouti. {dice_success_label}. Aucune évolution notable.",
  "Démarche sans conséquence : {country_name} et {target_country_name}. {dice_success_label}. Les analystes restent prudents.",
  "Tentative avortée entre {country_name} et {target_country_name}. {dice_success_label}. Pas de changement des relations.",
  "{country_name} et {target_country_name} : échec de la tentative. {dice_success_label}. Les deux capitales gardent le statu quo.",
  "Sans effet : la démarche de {country_name} envers {target_country_name}. {dice_success_label}.",
  "Tentative ratée : {country_name} et {target_country_name}. {dice_success_label}. Aucune dégradation enregistrée.",
  "La relation entre {country_name} et {target_country_name} reste stable. {dice_success_label}. Pas d''impact.",
  "Échec de la tentative entre {country_name} et {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'insulte_diplomatique';

-- Ouverture diplomatique (impact positif)
INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Rapprochement : {country_name} et {target_country_name} en dialogue",
  "Ouverture diplomatique entre {country_name} et {target_country_name}",
  "Négociations abouties : {country_name} et {target_country_name}",
  "Détente : {country_name} et {target_country_name} apaisent les tensions",
  "Succès diplomatique : {country_name} et {target_country_name} trouvent un terrain d''entente",
  "Entente : {country_name} et {target_country_name} renouent le dialogue",
  "Accord : {country_name} et {target_country_name} scellent une coopération",
  "Dialogue fructueux entre {country_name} et {target_country_name}",
  "Initiative réussie : {country_name} vers {target_country_name}",
  "Coopération : {country_name} et {target_country_name} renforcent leurs échanges",
  "Résultat positif : {country_name} et {target_country_name} en progression",
  "Partenariat : {country_name} et {target_country_name} convergent",
  "Ouverture : {country_name} et {target_country_name} renouent",
  "Succès : {action_label} de {country_name} envers {target_country_name} porte ses fruits",
  "Mission accomplie : {country_name} et {target_country_name} renforcent les liens"
]'::jsonb FROM public.state_action_types WHERE key = 'ouverture_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "L''amélioration des relations entre {country_name} et {target_country_name} est actée. L''impact est évalué à {impact_magnitude_bold}. Les observateurs saluent cette avancée.",
  "Selon nos sources, {country_name} et {target_country_name} ont conclu un rapprochement. Magnitude : {impact_magnitude_bold}. Les chancelleries prennent note.",
  "{country_name} et {target_country_name} renforcent leur dialogue. L''impact mesuré est {impact_magnitude_bold}. Suivi attendu dans les prochains jours.",
  "Les relations entre {country_name} et {target_country_name} s''améliorent. L''effet est évalué à {impact_magnitude_bold}. Les deux parties se disent satisfaites.",
  "Rapprochement confirmé entre {country_name} et {target_country_name}. L''impact enregistré est {impact_magnitude_bold}. Les médias relaient l''information.",
  "La démarche de {country_name} envers {target_country_name} a porté ses fruits. L''impact est {impact_magnitude_bold}. Les analystes restent attentifs.",
  "Dialogue fructueux entre {country_name} et {target_country_name}. L''effet sur les relations est {impact_magnitude_bold}. Communiqué attendu.",
  "Les négociations entre {country_name} et {target_country_name} ont abouti. Magnitude de l''impact : {impact_magnitude_bold}. Les observateurs commentent.",
  "Coopération renforcée : {country_name} et {target_country_name} affichent des progrès. L''impact est {impact_magnitude_bold}.",
  "{country_name} et {target_country_name} scellent un rapprochement. L''impact est évalué à {impact_magnitude_bold}. Les deux capitales se félicitent.",
  "Succès diplomatique pour {country_name} envers {target_country_name}. L''effet mesuré est {impact_magnitude_bold}. Les commentateurs soulignent l''importance de la démarche.",
  "Entente confirmée entre {country_name} et {target_country_name}. L''impact sur les relations est {impact_magnitude_bold}. Réactions positives selon les cercles.",
  "Détente entre {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les analystes restent prudents.",
  "Partenariat renforcé : {country_name} et {target_country_name} enregistrent une avancée. Magnitude : {impact_magnitude_bold}.",
  "Résultat positif pour {country_name} et {target_country_name}. L''effet sur les relations est {impact_magnitude_bold}. Suivi à prévoir."
]'::jsonb FROM public.state_action_types WHERE key = 'ouverture_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Tentative de rapprochement sans suite : {country_name} et {target_country_name}",
  "Dialogue en panne entre {country_name} et {target_country_name}",
  "Ouverture sans effet : {country_name} et {target_country_name}",
  "Rapprochement manqué entre {country_name} et {target_country_name}",
  "Tentative avortée : {country_name} et {target_country_name} restent à distance",
  "Échec du dialogue : {country_name} et {target_country_name}",
  "Initiative sans suite : {country_name} vers {target_country_name}",
  "Pas d''entente : {country_name} et {target_country_name}",
  "Tentative sans résultat : {country_name} et {target_country_name}",
  "Dialogue en attente entre {country_name} et {target_country_name}",
  "Rapprochement reporté : {country_name} et {target_country_name}",
  "Sans accord : {country_name} et {target_country_name} ne convergent pas",
  "Tentative ratée : {action_label} de {country_name} envers {target_country_name}",
  "Échec : {country_name} et {target_country_name} sans avancée",
  "Pas de rapprochement : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'ouverture_diplomatique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La tentative de rapprochement entre {country_name} et {target_country_name} n''a pas abouti. {dice_success_label}. Les relations restent inchangées.",
  "Tentative infructueuse de {country_name} envers {target_country_name}. {dice_success_label}. Les chancelleries restent sur leur position.",
  "{country_name} et {target_country_name} n''ont pas trouvé d''entente. {dice_success_label}. Aucune amélioration enregistrée.",
  "Le dialogue entre {country_name} et {target_country_name} est resté en panne. {dice_success_label}. Pas d''impact sur les relations.",
  "Initiative sans suite : {country_name} vers {target_country_name}. {dice_success_label}. Les analystes soulignent les blocages.",
  "Rapprochement manqué entre {country_name} et {target_country_name}. {dice_success_label}. Pas d''évolution des indicateurs.",
  "{country_name} n''a pas réussi à faire avancer le dialogue avec {target_country_name}. {dice_success_label}. Les médias relaient l''impasse.",
  "Échec du rapprochement entre {country_name} et {target_country_name}. {dice_success_label}. Les relations restent au même niveau.",
  "Tentative sans effet de {country_name} à l''égard de {target_country_name}. {dice_success_label}. Aucune évolution attendue.",
  "Les pourparlers entre {country_name} et {target_country_name} n''ont pas porté leurs fruits. {dice_success_label}. Situation figée.",
  "{country_name} et {target_country_name} restent en attente. {dice_success_label}. Les observateurs attendent une nouvelle initiative.",
  "Ouverture sans suite : {country_name} et {target_country_name}. {dice_success_label}. Pas d''impact sur les relations.",
  "Dialogue en panne entre {country_name} et {target_country_name}. {dice_success_label}. Les commentateurs restent prudents.",
  "Échec confirmé pour {country_name} envers {target_country_name}. {dice_success_label}. Aucun rapprochement notable.",
  "Tentative ratée : {country_name} et {target_country_name}. {dice_success_label}. Les deux capitales gardent leurs positions."
]'::jsonb FROM public.state_action_types WHERE key = 'ouverture_diplomatique';

-- Prise d'influence
INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Prise d''influence : {country_name} renforce son emprise sur {target_country_name}",
  "Influence : {country_name} et {target_country_name} en progression",
  "Emprise renforcée : {country_name} étend son influence sur {target_country_name}",
  "Sphère d''influence : {country_name} et {target_country_name}",
  "Succès : {country_name} renforce son influence sur {target_country_name}",
  "Influence accrue entre {country_name} et {target_country_name}",
  "Pénétration : {country_name} et {target_country_name} en phase d''influence",
  "Avancée : {country_name} consolide sa position envers {target_country_name}",
  "Réseaux : {country_name} et {target_country_name} renforcent leurs liens d''influence",
  "Pouvoir d''influence : {country_name} et {target_country_name}",
  "{action_label} : {country_name} renforce son emprise sur {target_country_name}",
  "Influence renforcée : {country_name} et {target_country_name}",
  "Consolidation : {country_name} étend son influence sur {target_country_name}",
  "Partenariat d''influence : {country_name} et {target_country_name}",
  "Mission accomplie : {country_name} et {target_country_name} — influence en hausse"
]'::jsonb FROM public.state_action_types WHERE key = 'prise_influence';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} renforce son influence sur {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les observateurs prennent note.",
  "Selon nos sources, l''influence de {country_name} sur {target_country_name} a progressé. Magnitude : {impact_magnitude_bold}. Les chancelleries analysent la situation.",
  "La prise d''influence de {country_name} envers {target_country_name} a porté ses fruits. L''effet mesuré est {impact_magnitude_bold}. Suivi attendu.",
  "Emprise renforcée entre {country_name} et {target_country_name}. L''impact sur les indicateurs est {impact_magnitude_bold}. Les deux capitales réagissent.",
  "L''influence de {country_name} sur {target_country_name} s''est accrue. L''impact est évalué à {impact_magnitude_bold}. Les médias relaient.",
  "Pénétration réussie : {country_name} et {target_country_name}. L''effet est {impact_magnitude_bold}. Les analystes commentent.",
  "{country_name} consolide sa position d''influence sur {target_country_name}. Magnitude : {impact_magnitude_bold}. Communiqué attendu.",
  "Réseaux d''influence : {country_name} et {target_country_name} enregistrent une avancée. L''impact est {impact_magnitude_bold}.",
  "La démarche de {country_name} envers {target_country_name} a renforcé son emprise. L''impact mesuré est {impact_magnitude_bold}. Les observateurs restent attentifs.",
  "Influence en hausse entre {country_name} et {target_country_name}. L''effet est évalué à {impact_magnitude_bold}. Situation à suivre.",
  "{country_name} et {target_country_name} : l''influence progresse. L''impact : {impact_magnitude_bold}. Les commentateurs soulignent les enjeux.",
  "Prise d''influence confirmée : {country_name} sur {target_country_name}. Magnitude de l''impact : {impact_magnitude_bold}.",
  "Consolidation de l''emprise de {country_name} sur {target_country_name}. L''impact est {impact_magnitude_bold}. Réactions en cours.",
  "Sphère d''influence élargie : {country_name} et {target_country_name}. L''effet mesuré est {impact_magnitude_bold}.",
  "Avancée enregistrée : {country_name} renforce son influence sur {target_country_name}. L''impact : {impact_magnitude_bold}."
]'::jsonb FROM public.state_action_types WHERE key = 'prise_influence';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Tentative d''influence sans effet : {country_name} et {target_country_name}",
  "Échec de la prise d''influence : {country_name} envers {target_country_name}",
  "Influence stable : {country_name} et {target_country_name}",
  "Tentative avortée : {country_name} et {target_country_name} sans changement",
  "Pas d''emprise : {country_name} et {target_country_name} inchangés",
  "Tentative sans suite : {action_label} de {country_name} envers {target_country_name}",
  "Échec : {country_name} et {target_country_name} — influence stable",
  "Sans impact : {country_name} et {target_country_name}",
  "Tentative ratée : {country_name} et {target_country_name}",
  "Influence en stand-by : {country_name} et {target_country_name}",
  "Pas de progression : {country_name} et {target_country_name}",
  "Tentative sans résultat entre {country_name} et {target_country_name}",
  "Démarche sans effet : {country_name} vers {target_country_name}",
  "Sans emprise renforcée : {country_name} et {target_country_name}",
  "Échec de pénétration : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'prise_influence';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La tentative d''influence de {country_name} sur {target_country_name} n''a pas porté ses fruits. {dice_success_label}. L''emprise reste inchangée.",
  "Tentative infructueuse entre {country_name} et {target_country_name}. {dice_success_label}. Aucune progression de l''influence.",
  "{country_name} et {target_country_name} : la prise d''influence n''a pas abouti. {dice_success_label}. Pas d''impact mesurable.",
  "La démarche de {country_name} à l''égard de {target_country_name} est restée sans effet. {dice_success_label}. Les observateurs notent l''échec.",
  "Tentative sans suite : {country_name} vers {target_country_name}. {dice_success_label}. Les indicateurs d''influence sont stables.",
  "Pas d''impact sur l''influence entre {country_name} et {target_country_name}. {dice_success_label}. Les chancelleries restent sur leur position.",
  "{country_name} n''a pas réussi à renforcer son emprise sur {target_country_name}. {dice_success_label}. Situation inchangée.",
  "La tentative de prise d''influence de {country_name} envers {target_country_name} a échoué. {dice_success_label}. Aucune évolution notable.",
  "Démarche sans conséquence : {country_name} et {target_country_name}. {dice_success_label}. Les analystes restent prudents.",
  "Tentative avortée entre {country_name} et {target_country_name}. {dice_success_label}. Pas de changement de l''influence.",
  "{country_name} et {target_country_name} : échec de la prise d''influence. {dice_success_label}. Les deux capitales gardent le statu quo.",
  "Sans effet : la démarche de {country_name} envers {target_country_name}. {dice_success_label}.",
  "Tentative ratée : {country_name} et {target_country_name}. {dice_success_label}. L''influence reste stable.",
  "La relation d''influence entre {country_name} et {target_country_name} reste inchangée. {dice_success_label}. Pas d''impact.",
  "Échec de la tentative d''influence entre {country_name} et {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'prise_influence';

-- Demande d'up
INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Demande d''up : {country_name} sollicite {target_country_name}",
  "Sollicitation : {country_name} et {target_country_name} en négociation",
  "Demande acceptée : {country_name} envers {target_country_name}",
  "Up en cours : {country_name} et {target_country_name}",
  "Succès : {country_name} obtient une avancée avec {target_country_name}",
  "Demande aboutie : {country_name} et {target_country_name}",
  "{action_label} : {country_name} sollicite {target_country_name} avec succès",
  "Négociation réussie : {country_name} et {target_country_name}",
  "Accord : {country_name} et {target_country_name} sur une demande d''up",
  "Demande traitée : {country_name} et {target_country_name}",
  "Avancée : {country_name} et {target_country_name} en progression",
  "Sollicitation acceptée entre {country_name} et {target_country_name}",
  "Demande d''up validée : {country_name} et {target_country_name}",
  "Mission accomplie : {country_name} et {target_country_name} — demande d''up",
  "Résultat positif : {country_name} et {target_country_name} sur la demande"
]'::jsonb FROM public.state_action_types WHERE key = 'demande_up';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "La demande de {country_name} envers {target_country_name} a été traitée avec succès. L''impact est évalué à {impact_magnitude_bold}. Les observateurs prennent note.",
  "Selon nos sources, {country_name} a obtenu gain de cause auprès de {target_country_name}. Magnitude : {impact_magnitude_bold}. Les chancelleries confirment.",
  "{country_name} et {target_country_name} enregistrent une avancée sur la demande. L''effet mesuré est {impact_magnitude_bold}. Suivi attendu.",
  "La sollicitation de {country_name} envers {target_country_name} a abouti. L''impact est évalué à {impact_magnitude_bold}. Les deux parties se disent satisfaites.",
  "Demande d''up traitée entre {country_name} et {target_country_name}. L''impact enregistré est {impact_magnitude_bold}. Les médias relaient.",
  "La démarche de {country_name} envers {target_country_name} a porté ses fruits. L''impact est {impact_magnitude_bold}. Les analystes commentent.",
  "Négociation réussie : {country_name} et {target_country_name}. L''effet sur les indicateurs est {impact_magnitude_bold}. Communiqué attendu.",
  "La demande de {country_name} auprès de {target_country_name} a été acceptée. Magnitude : {impact_magnitude_bold}. Les observateurs restent attentifs.",
  "Avancée confirmée entre {country_name} et {target_country_name}. L''impact est {impact_magnitude_bold}. Situation à suivre.",
  "{country_name} et {target_country_name} scellent un accord sur la demande. L''impact : {impact_magnitude_bold}. Les deux capitales se félicitent.",
  "Sollicitation aboutie : {country_name} et {target_country_name}. L''effet mesuré est {impact_magnitude_bold}. Les commentateurs soulignent l''enjeu.",
  "Demande d''up validée entre {country_name} et {target_country_name}. L''impact sur la relation est {impact_magnitude_bold}.",
  "Résultat positif pour {country_name} envers {target_country_name}. Magnitude de l''impact : {impact_magnitude_bold}.",
  "La demande de {country_name} a été traitée avec {target_country_name}. L''impact est {impact_magnitude_bold}. Réactions en cours.",
  "Mission accomplie : {country_name} et {target_country_name}. L''effet sur la demande est {impact_magnitude_bold}."
]'::jsonb FROM public.state_action_types WHERE key = 'demande_up';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Demande sans suite : {country_name} et {target_country_name}",
  "Échec de la demande : {country_name} envers {target_country_name}",
  "Sollicitation refusée ou sans effet : {country_name} et {target_country_name}",
  "Demande d''up reportée : {country_name} et {target_country_name}",
  "Tentative avortée : {country_name} et {target_country_name} sans avancée",
  "Pas d''accord : {country_name} et {target_country_name}",
  "Demande en attente : {country_name} et {target_country_name}",
  "Échec : {action_label} de {country_name} envers {target_country_name}",
  "Sans suite : {country_name} et {target_country_name}",
  "Demande sans résultat : {country_name} et {target_country_name}",
  "Tentative ratée : {country_name} et {target_country_name}",
  "Pas d''avancée : {country_name} et {target_country_name}",
  "Demande rejetée ou sans effet : {country_name} et {target_country_name}",
  "Sollicitation en panne : {country_name} et {target_country_name}",
  "Échec de la sollicitation : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'demande_up';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La demande de {country_name} envers {target_country_name} n''a pas abouti. {dice_success_label}. Pas d''avancée enregistrée.",
  "Tentative infructueuse entre {country_name} et {target_country_name}. {dice_success_label}. La demande reste en attente.",
  "{country_name} et {target_country_name} : la sollicitation n''a pas porté ses fruits. {dice_success_label}. Aucun impact mesurable.",
  "La demande de {country_name} auprès de {target_country_name} est restée sans suite. {dice_success_label}. Les observateurs notent l''échec.",
  "Demande sans effet : {country_name} vers {target_country_name}. {dice_success_label}. Les analystes soulignent les blocages.",
  "Pas d''accord entre {country_name} et {target_country_name}. {dice_success_label}. Pas d''évolution sur la demande.",
  "{country_name} n''a pas obtenu gain de cause auprès de {target_country_name}. {dice_success_label}. Situation inchangée.",
  "Échec de la demande entre {country_name} et {target_country_name}. {dice_success_label}. Les relations restent au même niveau.",
  "Tentative sans effet de {country_name} à l''égard de {target_country_name}. {dice_success_label}. Aucune avancée attendue.",
  "La sollicitation entre {country_name} et {target_country_name} n''a pas abouti. {dice_success_label}. Situation figée.",
  "{country_name} et {target_country_name} restent en désaccord sur la demande. {dice_success_label}. Les observateurs attendent une nouvelle initiative.",
  "Demande sans suite : {country_name} et {target_country_name}. {dice_success_label}. Pas d''impact.",
  "Sollicitation en panne entre {country_name} et {target_country_name}. {dice_success_label}. Les commentateurs restent prudents.",
  "Échec confirmé pour {country_name} envers {target_country_name}. {dice_success_label}. La demande ne sera pas traitée pour l''instant.",
  "Tentative ratée : {country_name} et {target_country_name}. {dice_success_label}. Les deux capitales gardent leurs positions."
]'::jsonb FROM public.state_action_types WHERE key = 'demande_up';
