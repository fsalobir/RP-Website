-- Pools de snippets Discord dédiés pour les types d'action qui n'en avaient pas.
-- Espionnage, sabotage, escarmouche_militaire, conflit_arme, guerre_ouverte,
-- accord_commercial_politique, cooperation_militaire, alliance, effort_fortifications, investissements.

-- =============================================================================
-- ESPIONNAGE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Opération de renseignement : {country_name} cible {target_country_name}",
  "Espionnage : {country_name} infiltre les réseaux de {target_country_name}",
  "Renseignement : {country_name} renforce sa veille sur {target_country_name}",
  "Mission secrète : {country_name} perce les défenses de {target_country_name}",
  "Intelligence : {country_name} obtient des informations sur {target_country_name}",
  "Infiltration réussie : {country_name} espionne {target_country_name}",
  "Opération clandestine : {country_name} et {target_country_name}",
  "Veille stratégique : {country_name} surveille {target_country_name}",
  "Sources secrètes : {country_name} obtient des renseignements sur {target_country_name}",
  "Espionnage : opération de {country_name} sur {target_country_name} couronnée de succès",
  "Renseignement militaire : {country_name} cible {target_country_name}",
  "Opération d''intelligence : {country_name} réussit contre {target_country_name}",
  "Agents en place : {country_name} récolte des données sur {target_country_name}",
  "Services secrets : {country_name} pénètre les réseaux de {target_country_name}",
  "Mission accomplie : {country_name} espionne {target_country_name} avec succès"
]'::jsonb FROM public.state_action_types WHERE key = 'espionnage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "Les services de renseignement de {country_name} ont mené une opération fructueuse contre {target_country_name}. Les informations récoltées renforcent la connaissance du dispositif adverse.",
  "Opération clandestine réussie : {country_name} a infiltré les réseaux de {target_country_name}. Les analystes traitent les données obtenues.",
  "Selon nos sources, {country_name} a conduit une opération d''espionnage contre {target_country_name}. Les renseignements obtenus sont jugés significatifs.",
  "Les agents de {country_name} ont percé les défenses de {target_country_name}. Le niveau de connaissance sur la cible progresse.",
  "Mission secrète accomplie : {country_name} renforce sa veille stratégique sur {target_country_name}. La cible n''a pas été alertée.",
  "{country_name} a obtenu des renseignements sur {target_country_name}. L''opération a été menée avec discrétion. Les données sont en cours d''analyse.",
  "Opération de renseignement de {country_name} contre {target_country_name} menée à son terme. Les services secrets confirment le succès de la mission.",
  "Les services de {country_name} ont collecté des informations sur {target_country_name}. L''opération n''a pas été détectée selon les premières analyses.",
  "Infiltration réussie de {country_name} dans les réseaux de {target_country_name}. Les renseignements récoltés sont en cours de traitement.",
  "Espionnage : {country_name} a mené une opération discrète contre {target_country_name}. Le niveau d''intelligence sur la cible augmente.",
  "{country_name} renforce sa connaissance du dispositif de {target_country_name}. Les sources en place ont fourni des informations précieuses.",
  "Opération réussie : les agents de {country_name} ont collecté des données sur {target_country_name}. Situation à suivre.",
  "Les renseignements obtenus par {country_name} sur {target_country_name} sont jugés exploitables. L''opération a été conduite sans alerte.",
  "Mission clandestine : {country_name} a espionné {target_country_name} avec succès. Les analystes exploitent les données récoltées.",
  "Opération d''intelligence menée par {country_name} contre {target_country_name}. Les informations récupérées enrichissent le dossier stratégique."
]'::jsonb FROM public.state_action_types WHERE key = 'espionnage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Espionnage raté : {country_name} échoue contre {target_country_name}",
  "Opération compromise : {country_name} et {target_country_name}",
  "Échec du renseignement : {country_name} contre {target_country_name}",
  "Mission avortée : {country_name} ne perce pas les défenses de {target_country_name}",
  "Agents grillés : {country_name} et {target_country_name}",
  "Infiltration sans résultat : {country_name} et {target_country_name}",
  "Opération manquée : {country_name} contre {target_country_name}",
  "Renseignement : échec de {country_name} sur {target_country_name}",
  "Espionnage sans effet : {country_name} et {target_country_name}",
  "Veille compromise : {country_name} et {target_country_name}",
  "Services secrets : {country_name} échoue contre {target_country_name}",
  "Mission ratée : {country_name} ne parvient pas à espionner {target_country_name}",
  "Opération clandestine avortée : {country_name} et {target_country_name}",
  "Échec d''infiltration : {country_name} contre {target_country_name}",
  "Tentative d''espionnage sans suite : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'espionnage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "L''opération d''espionnage de {country_name} contre {target_country_name} a échoué. {dice_success_label}. Aucune information exploitable n''a été obtenue.",
  "Les agents de {country_name} n''ont pas réussi à infiltrer {target_country_name}. {dice_success_label}. La mission est considérée comme compromise.",
  "Tentative de renseignement infructueuse : {country_name} contre {target_country_name}. {dice_success_label}. Les services secrets revoient leur approche.",
  "{country_name} a échoué à espionner {target_country_name}. {dice_success_label}. Le niveau de connaissance sur la cible reste inchangé.",
  "Mission avortée : les agents de {country_name} n''ont pas pu collecter de données sur {target_country_name}. {dice_success_label}.",
  "L''opération clandestine de {country_name} contre {target_country_name} n''a pas abouti. {dice_success_label}. Aucun renseignement exploitable.",
  "Échec de l''infiltration : {country_name} contre {target_country_name}. {dice_success_label}. Les analystes ne disposent pas de nouvelles données.",
  "Les services de {country_name} n''ont pas réussi leur opération contre {target_country_name}. {dice_success_label}. La mission est reportée.",
  "Opération de renseignement ratée : {country_name} contre {target_country_name}. {dice_success_label}. Pas de nouvelles informations.",
  "Tentative d''espionnage sans résultat de {country_name} contre {target_country_name}. {dice_success_label}. Le dossier stratégique reste inchangé.",
  "{country_name} n''a pas réussi à percer les défenses de {target_country_name}. {dice_success_label}. L''opération est un échec.",
  "Mission compromise : {country_name} contre {target_country_name}. {dice_success_label}. Les agents se replient.",
  "Renseignement : échec de {country_name} sur {target_country_name}. {dice_success_label}. Aucune donnée récoltée.",
  "Les réseaux de {target_country_name} ont résisté à l''infiltration de {country_name}. {dice_success_label}. Pas d''avancée sur le dossier.",
  "Opération d''intelligence avortée : {country_name} contre {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'espionnage';

-- =============================================================================
-- SABOTAGE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Sabotage : {country_name} frappe les infrastructures de {target_country_name}",
  "Opération de sabotage : {country_name} cible {target_country_name}",
  "Acte de sabotage confirmé contre {target_country_name}",
  "Sabotage réussi : {country_name} perturbe {target_country_name}",
  "Opération clandestine : {country_name} sabote {target_country_name}",
  "Destruction secrète : {country_name} frappe {target_country_name}",
  "Sabotage : {country_name} endommage les capacités de {target_country_name}",
  "Infrastructures visées : {country_name} mène un sabotage contre {target_country_name}",
  "Opération réussie : {country_name} sabote des installations de {target_country_name}",
  "Dégâts confirmés : sabotage de {country_name} contre {target_country_name}",
  "Action clandestine : {country_name} frappe {target_country_name} en secret",
  "Sabotage stratégique : {country_name} contre {target_country_name}",
  "Mission accomplie : {country_name} sabote {target_country_name}",
  "Perturbation : {country_name} atteint les capacités de {target_country_name}",
  "Opération de déstabilisation : {country_name} contre {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'sabotage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "Les agents de {country_name} ont mené un sabotage contre {target_country_name}. Les dégâts sont confirmés. La cible n''a pas identifié l''auteur.",
  "Opération de sabotage réussie de {country_name} contre {target_country_name}. Des infrastructures stratégiques ont été endommagées.",
  "Sabotage confirmé : {country_name} a frappé les installations de {target_country_name}. L''opération a été conduite avec discrétion.",
  "Les services de {country_name} ont mené une opération de destruction contre {target_country_name}. Les capacités de la cible sont affectées.",
  "{country_name} a saboté des installations de {target_country_name}. L''ampleur des dégâts est en cours d''évaluation.",
  "Opération clandestine : {country_name} a frappé {target_country_name} en secret. Les conséquences sont significatives.",
  "Les infrastructures de {target_country_name} ont été endommagées par une opération de {country_name}. Pas de revendication officielle.",
  "Sabotage stratégique de {country_name} contre {target_country_name}. Les analystes évaluent l''impact sur les capacités de la cible.",
  "{country_name} a perturbé les infrastructures de {target_country_name} par un acte de sabotage. L''opération n''a pas été détectée.",
  "Les dégâts causés par {country_name} sur les installations de {target_country_name} sont confirmés. Situation à suivre.",
  "Action clandestine de {country_name} contre {target_country_name}. Les infrastructures ciblées sont hors service.",
  "Mission de sabotage accomplie : {country_name} affaiblit les capacités de {target_country_name}.",
  "Opération secrète : {country_name} a frappé {target_country_name}. Les conséquences se feront sentir.",
  "Sabotage de {country_name} contre {target_country_name}. L''opération a atteint ses objectifs selon les premières évaluations.",
  "Les agents de {country_name} ont causé des dégâts aux installations de {target_country_name}. L''impact est jugé notable."
]'::jsonb FROM public.state_action_types WHERE key = 'sabotage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Sabotage raté : {country_name} échoue contre {target_country_name}",
  "Opération de sabotage avortée : {country_name} et {target_country_name}",
  "Échec du sabotage : {country_name} contre {target_country_name}",
  "Tentative sans effet : {country_name} et {target_country_name}",
  "Sabotage manqué : {country_name} contre {target_country_name}",
  "Opération compromise : {country_name} ne parvient pas à frapper {target_country_name}",
  "Mission avortée : sabotage de {country_name} contre {target_country_name}",
  "Pas de dégâts : {country_name} et {target_country_name}",
  "Tentative de sabotage sans suite : {country_name} et {target_country_name}",
  "Échec de l''opération clandestine : {country_name} contre {target_country_name}",
  "Sabotage raté : aucune perturbation pour {target_country_name}",
  "Opération ratée : {country_name} et {target_country_name}",
  "Mission échouée : sabotage de {country_name} contre {target_country_name}",
  "Tentative avortée : {country_name} ne sabote pas {target_country_name}",
  "Sabotage sans résultat : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'sabotage';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La tentative de sabotage de {country_name} contre {target_country_name} a échoué. {dice_success_label}. Aucun dégât n''a été causé.",
  "Les agents de {country_name} n''ont pas réussi à saboter les installations de {target_country_name}. {dice_success_label}. L''opération est un échec.",
  "Opération de sabotage avortée : {country_name} contre {target_country_name}. {dice_success_label}. Pas de dégâts constatés.",
  "{country_name} a échoué à frapper les infrastructures de {target_country_name}. {dice_success_label}. Les capacités de la cible sont intactes.",
  "Tentative de sabotage sans effet : {country_name} contre {target_country_name}. {dice_success_label}. Les agents se replient.",
  "Mission de sabotage ratée de {country_name} contre {target_country_name}. {dice_success_label}. Aucune perturbation enregistrée.",
  "L''opération clandestine de {country_name} contre {target_country_name} a été compromise. {dice_success_label}. Pas d''impact.",
  "Sabotage manqué : {country_name} n''a pas atteint ses objectifs contre {target_country_name}. {dice_success_label}.",
  "Les infrastructures de {target_country_name} sont intactes malgré la tentative de {country_name}. {dice_success_label}.",
  "Échec du sabotage : {country_name} contre {target_country_name}. {dice_success_label}. Les services revoient leur stratégie.",
  "Tentative de sabotage infructueuse de {country_name} contre {target_country_name}. {dice_success_label}. Situation inchangée.",
  "Opération de destruction ratée : {country_name} contre {target_country_name}. {dice_success_label}.",
  "{country_name} n''a pas réussi à endommager les capacités de {target_country_name}. {dice_success_label}. Pas de conséquence.",
  "Sabotage sans résultat de {country_name} contre {target_country_name}. {dice_success_label}. Les analystes en tirent les leçons.",
  "Mission compromise : {country_name} échoue à saboter {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'sabotage';

-- =============================================================================
-- ESCARMOUCHE MILITAIRE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Escarmouche : {country_name} engage {target_country_name}",
  "Incident militaire : {country_name} et {target_country_name} s''affrontent",
  "Engagement limité : {country_name} frappe {target_country_name}",
  "Escarmouche aux frontières : {country_name} et {target_country_name}",
  "Affrontement : {country_name} et {target_country_name} en confrontation armée",
  "Tensions armées : {country_name} engage {target_country_name}",
  "Accrochage militaire entre {country_name} et {target_country_name}",
  "Combat limité : {country_name} et {target_country_name}",
  "Escarmouche : coups de feu entre {country_name} et {target_country_name}",
  "Confrontation : {country_name} et {target_country_name} aux prises",
  "Incident armé : {country_name} et {target_country_name}",
  "Engagement militaire : {country_name} contre {target_country_name}",
  "Escalade : escarmouche entre {country_name} et {target_country_name}",
  "Accrochage : {country_name} et {target_country_name} en zone de friction",
  "Opération limitée : {country_name} engage {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'escarmouche_militaire';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "Un engagement militaire limité a eu lieu entre {country_name} et {target_country_name}. Les relations se dégradent de {impact_magnitude_bold}. Les observateurs s''inquiètent d''une escalade.",
  "Escarmouche confirmée entre {country_name} et {target_country_name}. L''impact sur les relations est évalué à {impact_magnitude_bold}. Les chancelleries appellent au calme.",
  "{country_name} a engagé {target_country_name} dans un accrochage armé. La dégradation des relations est de {impact_magnitude_bold}. Situation tendue.",
  "Incident militaire entre {country_name} et {target_country_name}. Les relations se détériorent de {impact_magnitude_bold}. Les deux capitales se rejettent la faute.",
  "Affrontement limité : {country_name} et {target_country_name}. L''impact sur les relations bilatérales est {impact_magnitude_bold}. Les médias suivent la situation.",
  "Accrochage armé entre {country_name} et {target_country_name}. Dégradation des relations de {impact_magnitude_bold}. Les analystes craignent une escalade.",
  "Escarmouche aux frontières : {country_name} et {target_country_name}. Impact : {impact_magnitude_bold}. Les organisations internationales appellent à la retenue.",
  "Engagement militaire entre {country_name} et {target_country_name}. Les relations se refroidissent de {impact_magnitude_bold}. Communiqués attendus.",
  "Tensions armées entre {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les observateurs restent en alerte.",
  "{country_name} et {target_country_name} se sont affrontés. Dégradation de {impact_magnitude_bold} des relations. Suivi à prévoir.",
  "Combat limité entre {country_name} et {target_country_name}. L''effet sur les relations : {impact_magnitude_bold}. Les commentateurs soulignent les risques.",
  "Incident aux frontières : {country_name} et {target_country_name}. Impact : {impact_magnitude_bold}. La communauté internationale réagit.",
  "Accrochage : {country_name} et {target_country_name} en zone de friction. Dégradation de {impact_magnitude_bold}.",
  "Escarmouche entre {country_name} et {target_country_name}. Les relations se dégradent : {impact_magnitude_bold}. Les deux parties restent mobilisées.",
  "Engagement limité mais conséquent entre {country_name} et {target_country_name}. Impact : {impact_magnitude_bold}."
]'::jsonb FROM public.state_action_types WHERE key = 'escarmouche_militaire';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Escarmouche sans conséquence : {country_name} et {target_country_name}",
  "Incident maîtrisé entre {country_name} et {target_country_name}",
  "Escarmouche sans effet : {country_name} et {target_country_name}",
  "Pas d''escalade : {country_name} et {target_country_name} restent stables",
  "Accrochage sans impact : {country_name} et {target_country_name}",
  "Incident désamorcé : {country_name} et {target_country_name}",
  "Tentative d''engagement sans suite : {country_name} et {target_country_name}",
  "Pas de dégradation : escarmouche entre {country_name} et {target_country_name}",
  "Incident sans conséquence : {country_name} et {target_country_name}",
  "Escarmouche avortée : {country_name} et {target_country_name}",
  "Confrontation sans effet : {country_name} et {target_country_name}",
  "Accrochage désamorcé : {country_name} et {target_country_name}",
  "Tension maîtrisée : {country_name} et {target_country_name}",
  "Engagement avorté : {country_name} et {target_country_name}",
  "Escarmouche sans résultat entre {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'escarmouche_militaire';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "L''escarmouche entre {country_name} et {target_country_name} n''a pas eu de conséquences mesurables. {dice_success_label}. Les relations restent inchangées.",
  "Incident maîtrisé entre {country_name} et {target_country_name}. {dice_success_label}. Aucune dégradation notable des relations.",
  "{country_name} a tenté un engagement contre {target_country_name} mais sans effet. {dice_success_label}. La situation reste stable.",
  "Accrochage sans impact entre {country_name} et {target_country_name}. {dice_success_label}. Les observateurs notent l''absence d''escalade.",
  "L''escarmouche entre {country_name} et {target_country_name} a été désamorcée. {dice_success_label}. Pas de changement des relations.",
  "Engagement limité sans conséquence entre {country_name} et {target_country_name}. {dice_success_label}. Les deux parties se retirent.",
  "Pas de dégradation notable suite à l''escarmouche entre {country_name} et {target_country_name}. {dice_success_label}.",
  "Incident maîtrisé : {country_name} et {target_country_name}. {dice_success_label}. Les relations restent au même niveau.",
  "Accrochage désamorcé entre {country_name} et {target_country_name}. {dice_success_label}. Pas d''escalade.",
  "L''engagement entre {country_name} et {target_country_name} n''a pas eu les effets escomptés. {dice_success_label}.",
  "Escarmouche sans résultat entre {country_name} et {target_country_name}. {dice_success_label}. Situation inchangée.",
  "Confrontation avortée entre {country_name} et {target_country_name}. {dice_success_label}. Les deux capitales gardent le statu quo.",
  "L''incident entre {country_name} et {target_country_name} n''a pas dégénéré. {dice_success_label}.",
  "Pas d''impact mesurable suite à l''accrochage entre {country_name} et {target_country_name}. {dice_success_label}.",
  "Tension maîtrisée : {country_name} et {target_country_name}. {dice_success_label}. Les relations ne bougent pas."
]'::jsonb FROM public.state_action_types WHERE key = 'escarmouche_militaire';

-- =============================================================================
-- CONFLIT ARMÉ
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Conflit armé : {country_name} lance une offensive contre {target_country_name}",
  "Guerre limitée : {country_name} frappe {target_country_name}",
  "Hostilités : {country_name} et {target_country_name} en conflit ouvert",
  "Offensive : {country_name} engage ses forces contre {target_country_name}",
  "Conflit : {country_name} et {target_country_name} aux armes",
  "Opérations militaires : {country_name} contre {target_country_name}",
  "Affrontement majeur : {country_name} et {target_country_name}",
  "Conflit armé entre {country_name} et {target_country_name}",
  "Hostilités déclarées : {country_name} frappe {target_country_name}",
  "Guerre : {country_name} lance des opérations contre {target_country_name}",
  "Offensive militaire : {country_name} et {target_country_name}",
  "Engagement majeur : {country_name} et {target_country_name} en conflit",
  "Combats : {country_name} et {target_country_name} s''affrontent",
  "Conflit déclaré entre {country_name} et {target_country_name}",
  "Escalade armée : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'conflit_arme';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} a lancé une offensive contre {target_country_name}. Les relations se dégradent fortement : {impact_magnitude_bold}. La communauté internationale réagit.",
  "Conflit armé entre {country_name} et {target_country_name}. L''impact sur les relations est évalué à {impact_magnitude_bold}. Les combats ont fait des dégâts.",
  "Hostilités confirmées entre {country_name} et {target_country_name}. Dégradation des relations de {impact_magnitude_bold}. Les organisations appellent au cessez-le-feu.",
  "Les forces de {country_name} ont engagé {target_country_name}. L''impact sur les relations bilatérales est {impact_magnitude_bold}. Escalade en cours.",
  "Opérations militaires de {country_name} contre {target_country_name}. Les relations chutent de {impact_magnitude_bold}. Les médias couvrent le conflit.",
  "Conflit armé : {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Les observateurs craignent une extension.",
  "Offensive de {country_name} contre {target_country_name}. Dégradation massive des relations : {impact_magnitude_bold}. Les deux capitales mobilisent.",
  "Affrontement majeur entre {country_name} et {target_country_name}. Impact : {impact_magnitude_bold}. La situation est jugée critique.",
  "{country_name} engage {target_country_name} dans un conflit armé. Les relations se détériorent de {impact_magnitude_bold}.",
  "Hostilités : {country_name} et {target_country_name} au combat. Dégradation : {impact_magnitude_bold}. Appels au calme de la communauté internationale.",
  "Les combats entre {country_name} et {target_country_name} font rage. Impact : {impact_magnitude_bold}. Les analystes évaluent les conséquences.",
  "Guerre limitée entre {country_name} et {target_country_name}. L''effet sur les relations : {impact_magnitude_bold}. Suivi en continu.",
  "Conflit : {country_name} et {target_country_name}. La dégradation des relations atteint {impact_magnitude_bold}. Les chancelleries interviennent.",
  "Escalade armée entre {country_name} et {target_country_name}. L''impact est {impact_magnitude_bold}. Réactions internationales attendues.",
  "Offensive militaire de {country_name} contre {target_country_name}. Impact : {impact_magnitude_bold}. La situation reste volatile."
]'::jsonb FROM public.state_action_types WHERE key = 'conflit_arme';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Conflit avorté : {country_name} et {target_country_name}",
  "Offensive sans effet : {country_name} contre {target_country_name}",
  "Hostilités désamorcées : {country_name} et {target_country_name}",
  "Engagement repoussé : {country_name} et {target_country_name}",
  "Tentative d''offensive avortée : {country_name} contre {target_country_name}",
  "Pas d''escalade : conflit entre {country_name} et {target_country_name} sans suite",
  "Opérations sans résultat : {country_name} contre {target_country_name}",
  "Conflit avorté entre {country_name} et {target_country_name}",
  "Offensive repoussée : {country_name} et {target_country_name}",
  "Pas de dégradation : {country_name} et {target_country_name}",
  "Tentative militaire sans suite : {country_name} et {target_country_name}",
  "Engagement sans conséquence : {country_name} et {target_country_name}",
  "Opérations avortées : {country_name} contre {target_country_name}",
  "Conflit sans résultat : {country_name} et {target_country_name}",
  "Escalade évitée : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'conflit_arme';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "L''offensive de {country_name} contre {target_country_name} n''a pas eu les effets escomptés. {dice_success_label}. Les relations restent inchangées.",
  "Le conflit entre {country_name} et {target_country_name} n''a pas dégénéré. {dice_success_label}. Aucune dégradation notable.",
  "{country_name} a tenté une offensive contre {target_country_name} mais sans résultat. {dice_success_label}. Les forces se replient.",
  "Engagement militaire sans conséquence entre {country_name} et {target_country_name}. {dice_success_label}. La situation reste stable.",
  "L''opération de {country_name} contre {target_country_name} a été repoussée. {dice_success_label}. Pas d''impact sur les relations.",
  "Hostilités désamorcées entre {country_name} et {target_country_name}. {dice_success_label}. Aucune escalade enregistrée.",
  "Tentative d''offensive avortée de {country_name} contre {target_country_name}. {dice_success_label}. Les deux parties se retirent.",
  "Conflit avorté : {country_name} et {target_country_name}. {dice_success_label}. Les relations ne bougent pas.",
  "L''engagement de {country_name} contre {target_country_name} s''est soldé par un échec. {dice_success_label}.",
  "Pas de dégradation suite au conflit entre {country_name} et {target_country_name}. {dice_success_label}. La situation est figée.",
  "Les opérations de {country_name} contre {target_country_name} ont été sans résultat. {dice_success_label}. Les analystes commentent.",
  "Offensive repoussée : {country_name} contre {target_country_name}. {dice_success_label}. Les relations restent stables.",
  "Conflit sans effet mesurable entre {country_name} et {target_country_name}. {dice_success_label}.",
  "Escalade évitée entre {country_name} et {target_country_name}. {dice_success_label}. Pas de changement des relations.",
  "Tentative militaire infructueuse de {country_name} contre {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'conflit_arme';

-- =============================================================================
-- GUERRE OUVERTE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "GUERRE : {country_name} déclare la guerre à {target_country_name}",
  "Guerre ouverte : {country_name} et {target_country_name} en conflit total",
  "Déclaration de guerre : {country_name} contre {target_country_name}",
  "Offensive totale : {country_name} attaque {target_country_name}",
  "État de guerre entre {country_name} et {target_country_name}",
  "Conflit majeur : {country_name} et {target_country_name} en guerre",
  "Guerre déclarée : {country_name} engage toutes ses forces contre {target_country_name}",
  "Hostilités totales : {country_name} et {target_country_name}",
  "Rupture totale : {country_name} et {target_country_name} en guerre ouverte",
  "Assaut général : {country_name} contre {target_country_name}",
  "Guerre : {country_name} mobilise contre {target_country_name}",
  "Conflit total entre {country_name} et {target_country_name}",
  "Déclaration de guerre officielle : {country_name} et {target_country_name}",
  "Offensive majeure : {country_name} frappe {target_country_name}",
  "État de guerre : les hostilités font rage entre {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'guerre_ouverte';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} a déclaré la guerre à {target_country_name}. Les relations s''effondrent : {impact_magnitude_bold}. La communauté internationale est en état d''alerte.",
  "Guerre ouverte entre {country_name} et {target_country_name}. L''impact sur les relations est dévastateur : {impact_magnitude_bold}. Mobilisation générale en cours.",
  "Les hostilités font rage entre {country_name} et {target_country_name}. Dégradation des relations : {impact_magnitude_bold}. Les populations civiles sont affectées.",
  "Déclaration de guerre : {country_name} contre {target_country_name}. L''effondrement des relations est de {impact_magnitude_bold}. Réactions internationales immédiates.",
  "Offensive totale de {country_name} contre {target_country_name}. Les relations s''effondrent de {impact_magnitude_bold}. Les organisations appellent à la paix.",
  "État de guerre entre {country_name} et {target_country_name}. Impact : {impact_magnitude_bold}. Les combats s''intensifient sur plusieurs fronts.",
  "Conflit majeur : {country_name} et {target_country_name} en guerre. Dégradation : {impact_magnitude_bold}. Les chancelleries tentent une médiation.",
  "Rupture totale entre {country_name} et {target_country_name}. L''impact est {impact_magnitude_bold}. Les conséquences sont jugées catastrophiques.",
  "Guerre déclarée : {country_name} engage toutes ses forces contre {target_country_name}. Impact : {impact_magnitude_bold}. La situation est critique.",
  "Les combats entre {country_name} et {target_country_name} font rage. Effondrement des relations : {impact_magnitude_bold}. Le monde retient son souffle.",
  "Hostilités totales entre {country_name} et {target_country_name}. L''impact est évalué à {impact_magnitude_bold}. Appels à la paix de toutes parts.",
  "Assaut général de {country_name} contre {target_country_name}. Les relations chutent de {impact_magnitude_bold}. Mobilisations en chaîne.",
  "Guerre ouverte : {country_name} et {target_country_name}. Dégradation massive : {impact_magnitude_bold}. Les observateurs sont alarmés.",
  "Conflit total : {country_name} et {target_country_name}. L''impact sur les relations atteint {impact_magnitude_bold}. Les alliances sont testées.",
  "Déclaration de guerre officielle de {country_name} à {target_country_name}. Impact : {impact_magnitude_bold}. Les conséquences seront durables."
]'::jsonb FROM public.state_action_types WHERE key = 'guerre_ouverte';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'title', '[
  "Guerre avortée : {country_name} et {target_country_name} sans escalade",
  "Offensive repoussée : {country_name} contre {target_country_name}",
  "Pas de conflit total : {country_name} et {target_country_name}",
  "Hostilités désamorcées : {country_name} et {target_country_name}",
  "Guerre évitée : {country_name} et {target_country_name}",
  "Tentative de guerre sans suite : {country_name} et {target_country_name}",
  "Escalade maîtrisée : {country_name} et {target_country_name}",
  "Offensive ratée : {country_name} contre {target_country_name}",
  "Conflit avorté : {country_name} et {target_country_name}",
  "Pas de guerre : {country_name} et {target_country_name} restent au statu quo",
  "Tentative sans effet : {country_name} et {target_country_name}",
  "Guerre ouverte avortée : {country_name} et {target_country_name}",
  "Offensive sans résultat : {country_name} contre {target_country_name}",
  "Hostilités sans conséquence : {country_name} et {target_country_name}",
  "Pas de rupture totale : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'guerre_ouverte';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'failure', 'description', '[
  "La tentative de guerre de {country_name} contre {target_country_name} n''a pas abouti. {dice_success_label}. Les relations restent inchangées.",
  "L''offensive de {country_name} contre {target_country_name} a été repoussée. {dice_success_label}. Aucune dégradation notable.",
  "{country_name} n''a pas réussi à engager {target_country_name} dans un conflit total. {dice_success_label}. Le statu quo perdure.",
  "Hostilités désamorcées entre {country_name} et {target_country_name}. {dice_success_label}. Les organisations poussent un soupir de soulagement.",
  "Guerre évitée : {country_name} et {target_country_name}. {dice_success_label}. Les deux parties se retirent sans escalade.",
  "L''escalade entre {country_name} et {target_country_name} a été maîtrisée. {dice_success_label}. Pas de changement des relations.",
  "Tentative de conflit avorté entre {country_name} et {target_country_name}. {dice_success_label}. La communauté internationale intervient.",
  "Offensive ratée de {country_name} contre {target_country_name}. {dice_success_label}. Les forces se replient.",
  "Guerre ouverte avortée : {country_name} et {target_country_name}. {dice_success_label}. Les relations restent stables.",
  "Pas de rupture totale entre {country_name} et {target_country_name}. {dice_success_label}. L''escalade a été évitée.",
  "L''offensive de {country_name} n''a pas eu les effets escomptés contre {target_country_name}. {dice_success_label}.",
  "Conflit avorté entre {country_name} et {target_country_name}. {dice_success_label}. Les analystes commentent le retournement.",
  "Hostilités sans conséquence entre {country_name} et {target_country_name}. {dice_success_label}. Situation figée.",
  "Pas de guerre : {country_name} et {target_country_name}. {dice_success_label}. Les deux capitales gardent leurs positions.",
  "Tentative de guerre infructueuse de {country_name} contre {target_country_name}. {dice_success_label}."
]'::jsonb FROM public.state_action_types WHERE key = 'guerre_ouverte';

-- =============================================================================
-- ACCORD COMMERCIAL OU POLITIQUE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Accord signé : {country_name} et {target_country_name} concluent un partenariat",
  "Coopération : {country_name} et {target_country_name} renforcent leurs échanges",
  "Accord commercial : {country_name} et {target_country_name}",
  "Partenariat : {country_name} et {target_country_name} signent un accord",
  "Diplomatie : {country_name} et {target_country_name} trouvent un accord",
  "Entente : {country_name} et {target_country_name} scellent une coopération",
  "Accord politique entre {country_name} et {target_country_name}",
  "Signature d''un accord : {country_name} et {target_country_name}",
  "Rapprochement économique : {country_name} et {target_country_name}",
  "Accord bilatéral : {country_name} et {target_country_name}",
  "Partenariat renforcé entre {country_name} et {target_country_name}",
  "Coopération économique : {country_name} et {target_country_name}",
  "Traité signé : {country_name} et {target_country_name}",
  "Accord conclu : {country_name} et {target_country_name} officialisent",
  "Entente bilatérale entre {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'accord_commercial_politique';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} et {target_country_name} ont signé un accord commercial et politique. Les observateurs saluent cette avancée. Les échanges entre les deux nations devraient se renforcer.",
  "Accord bilatéral conclu entre {country_name} et {target_country_name}. Les deux parties se disent satisfaites des termes négociés.",
  "Coopération renforcée : {country_name} et {target_country_name} officialisent leur partenariat. Les marchés réagissent positivement.",
  "{country_name} et {target_country_name} scellent un accord. Les chancelleries confirment les engagements pris par les deux parties.",
  "Signature d''un accord : {country_name} et {target_country_name} renforcent leurs liens. Les analystes commentent les retombées attendues.",
  "Entente confirmée entre {country_name} et {target_country_name}. Les conditions de l''accord sont jugées favorables aux deux parties.",
  "Partenariat officialisé entre {country_name} et {target_country_name}. Les échanges économiques et politiques devraient progresser.",
  "Accord commercial et politique entre {country_name} et {target_country_name}. Les deux capitales se félicitent de cette avancée.",
  "{country_name} et {target_country_name} concluent un accord. Les observateurs soulignent l''importance de ce rapprochement.",
  "Traité signé entre {country_name} et {target_country_name}. Les deux nations renforcent leur coopération dans plusieurs domaines.",
  "Diplomatie réussie : {country_name} et {target_country_name} trouvent un terrain d''entente. Les marchés accueillent favorablement la nouvelle.",
  "Accord bilatéral : {country_name} et {target_country_name}. Les engagements pris devraient renforcer les liens entre les deux nations.",
  "{country_name} et {target_country_name} officialisent un partenariat. Les deux parties se déclarent satisfaites.",
  "Coopération : {country_name} et {target_country_name} signent un accord. Les retombées économiques sont attendues.",
  "Entente entre {country_name} et {target_country_name}. Les négociations ont abouti à un accord jugé équilibré."
]'::jsonb FROM public.state_action_types WHERE key = 'accord_commercial_politique';

-- =============================================================================
-- COOPÉRATION MILITAIRE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Coopération militaire : {country_name} et {target_country_name} renforcent leur défense",
  "Accord de défense : {country_name} et {target_country_name}",
  "Partenariat militaire entre {country_name} et {target_country_name}",
  "Coopération : {country_name} et {target_country_name} unissent leurs forces",
  "Accord stratégique : {country_name} et {target_country_name}",
  "Défense commune : {country_name} et {target_country_name} coopèrent",
  "Rapprochement militaire : {country_name} et {target_country_name}",
  "Exercices conjoints : {country_name} et {target_country_name}",
  "Partenariat de défense entre {country_name} et {target_country_name}",
  "Coopération stratégique : {country_name} et {target_country_name}",
  "Alliance de défense : {country_name} et {target_country_name}",
  "Accord militaire signé : {country_name} et {target_country_name}",
  "Renforcement militaire : {country_name} et {target_country_name} coopèrent",
  "Pacte de défense : {country_name} et {target_country_name}",
  "Forces unies : {country_name} et {target_country_name}"
]'::jsonb FROM public.state_action_types WHERE key = 'cooperation_militaire';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} et {target_country_name} ont signé un accord de coopération militaire. Les deux nations renforcent leur défense commune.",
  "Coopération militaire officielle entre {country_name} et {target_country_name}. Les forces armées des deux pays mèneront des exercices conjoints.",
  "Partenariat de défense entre {country_name} et {target_country_name}. Les deux parties s''engagent à renforcer leur coopération stratégique.",
  "{country_name} et {target_country_name} officialisent leur rapprochement militaire. Les observateurs notent l''importance de ce partenariat.",
  "Accord de défense signé entre {country_name} et {target_country_name}. Les capacités militaires conjointes devraient s''en trouver renforcées.",
  "Coopération stratégique : {country_name} et {target_country_name} unissent leurs efforts de défense. Les analystes commentent.",
  "Pacte de défense entre {country_name} et {target_country_name}. Les deux nations coordonneront leurs efforts militaires.",
  "Rapprochement militaire entre {country_name} et {target_country_name}. Des exercices conjoints sont prévus.",
  "{country_name} et {target_country_name} renforcent leur coopération militaire. La communauté internationale observe.",
  "Accord stratégique : {country_name} et {target_country_name} s''engagent dans une coopération de défense approfondie.",
  "Partenariat militaire officialisé entre {country_name} et {target_country_name}. Les termes de l''accord sont confirmés.",
  "Forces unies : {country_name} et {target_country_name} scellent un accord militaire. Les deux capitales se disent satisfaites.",
  "Alliance de défense entre {country_name} et {target_country_name}. Les deux nations coordonnent désormais leurs stratégies.",
  "Coopération militaire : {country_name} et {target_country_name}. L''accord prévoit des transferts de compétences et des exercices.",
  "Défense commune : {country_name} et {target_country_name} signent un accord historique."
]'::jsonb FROM public.state_action_types WHERE key = 'cooperation_militaire';

-- =============================================================================
-- ALLIANCE
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Alliance : {country_name} et {target_country_name} scellent un pacte",
  "Pacte d''alliance entre {country_name} et {target_country_name}",
  "Alliance officielle : {country_name} et {target_country_name}",
  "Traité d''alliance : {country_name} et {target_country_name}",
  "Union stratégique : {country_name} et {target_country_name}",
  "Alliance historique entre {country_name} et {target_country_name}",
  "Pacte signé : {country_name} et {target_country_name} s''allient",
  "Alliance militaire et politique : {country_name} et {target_country_name}",
  "Engagement mutuel : {country_name} et {target_country_name}",
  "Alliance : {country_name} et {target_country_name} unissent leurs destins",
  "Traité d''alliance signé entre {country_name} et {target_country_name}",
  "Coalition : {country_name} et {target_country_name} forment une alliance",
  "Pacte stratégique : {country_name} et {target_country_name}",
  "Alliance officielle scellée : {country_name} et {target_country_name}",
  "Bloc : {country_name} et {target_country_name} s''allient officiellement"
]'::jsonb FROM public.state_action_types WHERE key = 'alliance';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} et {target_country_name} ont scellé une alliance officielle. Les deux nations s''engagent à se défendre mutuellement. La communauté internationale prend acte.",
  "Alliance signée entre {country_name} et {target_country_name}. Ce pacte renforce la position des deux nations sur la scène internationale.",
  "Pacte d''alliance entre {country_name} et {target_country_name}. Les deux capitales s''engagent dans une coopération totale.",
  "{country_name} et {target_country_name} officialisent leur alliance. Les observateurs analysent les conséquences géopolitiques.",
  "Traité d''alliance entre {country_name} et {target_country_name}. Les deux nations unissent leurs forces sur le plan politique et militaire.",
  "Alliance historique : {country_name} et {target_country_name} scellent un accord d''envergure. Les médias relaient l''événement.",
  "{country_name} et {target_country_name} forment une coalition. Les engagements mutuels sont confirmés par les deux parties.",
  "Union stratégique entre {country_name} et {target_country_name}. Les deux nations coordonneront leurs politiques étrangères.",
  "Pacte signé : {country_name} et {target_country_name} s''allient. Les analystes commentent l''impact sur l''équilibre régional.",
  "Alliance militaire et politique : {country_name} et {target_country_name}. Les deux parties se disent déterminées.",
  "{country_name} et {target_country_name} signent un traité d''alliance. Les conséquences sont jugées significatives.",
  "Bloc formé : {country_name} et {target_country_name} s''allient officiellement. La scène internationale est redéfinie.",
  "Engagement mutuel entre {country_name} et {target_country_name}. Les termes de l''alliance sont rendus publics.",
  "Coalition : {country_name} et {target_country_name} signent un pacte d''alliance. Les observateurs suivent de près.",
  "Alliance officielle scellée : {country_name} et {target_country_name}. Les deux nations entrent dans une nouvelle ère de coopération."
]'::jsonb FROM public.state_action_types WHERE key = 'alliance';

-- =============================================================================
-- EFFORT DE FORTIFICATIONS (pas de cible, texte centré sur le pays)
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Fortifications : {country_name} renforce ses défenses",
  "Effort de défense : {country_name} consolide ses positions",
  "Travaux de fortification en cours : {country_name}",
  "Renforcement défensif : {country_name} investit dans ses infrastructures",
  "Fortifications renforcées : {country_name} se prépare",
  "Défense : {country_name} consolide ses lignes",
  "Travaux stratégiques : {country_name} renforce ses positions",
  "Effort de fortification de {country_name} en cours",
  "Préparation défensive : {country_name} investit massivement",
  "Infrastructures militaires : {country_name} consolide ses défenses",
  "Renforcement : {country_name} érige de nouvelles fortifications",
  "Défense nationale : {country_name} renforce ses positions",
  "Fortification : {country_name} consolide son dispositif",
  "Effort défensif majeur de {country_name}",
  "Travaux de défense : {country_name} renforce ses infrastructures"
]'::jsonb FROM public.state_action_types WHERE key = 'effort_fortifications';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} a lancé un vaste programme de fortifications. Les infrastructures défensives sont en cours de renforcement.",
  "Effort de fortification de {country_name} : les positions stratégiques sont consolidées. Les observateurs prennent note.",
  "Les défenses de {country_name} sont renforcées. Les travaux de fortification progressent selon le calendrier prévu.",
  "{country_name} investit dans ses infrastructures défensives. Les fortifications sont jugées significatives par les analystes.",
  "Travaux de fortification en cours : {country_name} consolide ses lignes de défense. La sécurité nationale est renforcée.",
  "Renforcement défensif : {country_name} érige de nouvelles fortifications. Les voisins observent avec attention.",
  "{country_name} consolide ses positions défensives. L''effort de fortification est salué par les experts militaires.",
  "Effort de défense de {country_name} : les infrastructures militaires sont modernisées. La communauté internationale prend acte.",
  "Les fortifications de {country_name} progressent. Le dispositif défensif est jugé renforcé par les analystes.",
  "{country_name} renforce ses défenses avec un programme de fortifications ambitieux. Suivi en cours.",
  "Préparation défensive de {country_name} : les positions stratégiques sont consolidées. Les médias couvrent les travaux.",
  "Infrastructures militaires de {country_name} : les fortifications sont renforcées. L''effort est jugé notable.",
  "{country_name} investit dans sa défense. Les nouvelles fortifications renforcent le dispositif existant.",
  "Effort défensif de {country_name} : les travaux de fortification sont en bonne voie. Les experts commentent.",
  "Renforcement des défenses de {country_name}. Le programme de fortification est en cours de réalisation."
]'::jsonb FROM public.state_action_types WHERE key = 'effort_fortifications';

-- =============================================================================
-- INVESTISSEMENTS (pas de cible, texte centré sur le pays)
-- =============================================================================

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'title', '[
  "Investissements : {country_name} renforce son économie",
  "Plan d''investissement de {country_name} validé",
  "Économie : {country_name} lance un programme d''investissements",
  "Développement : {country_name} investit dans ses infrastructures",
  "Croissance : {country_name} met en oeuvre un plan d''investissement",
  "Investissements stratégiques de {country_name}",
  "Programme économique : {country_name} consolide ses acquis",
  "Plan de relance : {country_name} investit massivement",
  "Économie renforcée : {country_name} lance des investissements",
  "Développement national : {country_name} investit",
  "Infrastructures : {country_name} lance un programme ambitieux",
  "Plan d''investissement de {country_name} en cours",
  "Relance économique : {country_name} investit dans l''avenir",
  "Croissance : programme d''investissements de {country_name}",
  "Économie : {country_name} renforce ses capacités"
]'::jsonb FROM public.state_action_types WHERE key = 'investissements';

INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, phrases)
SELECT id, 'accepted', 'success', 'description', '[
  "{country_name} a lancé un programme d''investissements pour renforcer son économie. Les analystes saluent cette initiative.",
  "Plan d''investissement validé pour {country_name}. Les infrastructures et les capacités économiques seront renforcées.",
  "{country_name} investit massivement dans ses infrastructures. Le programme est jugé ambitieux par les observateurs.",
  "Investissements stratégiques de {country_name} : les capacités économiques et industrielles sont consolidées.",
  "Programme d''investissement de {country_name} en cours. Les retombées économiques sont attendues à moyen terme.",
  "{country_name} renforce son économie avec un plan d''investissements significatif. Les marchés réagissent positivement.",
  "Développement national : {country_name} lance un programme d''investissements. Les secteurs clés sont ciblés.",
  "Relance économique de {country_name} : les investissements progressent selon le calendrier prévu.",
  "{country_name} consolide ses acquis économiques avec un programme d''investissements. Les analystes commentent.",
  "Plan de relance : {country_name} investit dans ses infrastructures et son économie. Les observateurs prennent note.",
  "Les investissements de {country_name} sont en cours de déploiement. Les secteurs stratégiques sont prioritaires.",
  "{country_name} mise sur l''investissement pour renforcer sa position économique. Les médias relaient l''annonce.",
  "Programme d''investissements de {country_name} : les capacités du pays sont renforcées. Suivi attendu.",
  "Croissance : {country_name} met en oeuvre un plan d''investissements jugé ambitieux par les experts.",
  "Économie de {country_name} : les investissements lancés devraient porter leurs fruits. Les marchés sont attentifs."
]'::jsonb FROM public.state_action_types WHERE key = 'investissements';
