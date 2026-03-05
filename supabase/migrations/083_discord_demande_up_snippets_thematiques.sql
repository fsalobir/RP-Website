-- Demande d'up : snippets thématiques par up_kind (stat / tech / nombre / mixed).
-- Les phrases n'utilisent PAS target_country_name ni impact_magnitude_bold.

DO $$
DECLARE
  v_type_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM public.state_action_types WHERE key = 'demande_up' LIMIT 1;
  IF v_type_id IS NULL THEN
    RAISE NOTICE 'state_action_types.demande_up introuvable, migration ignorée.';
    RETURN;
  END IF;

  -- Supprimer l’ancienne contrainte UNIQUE (nom possiblement tronqué, 082 ne l’a pas supprimée)
  ALTER TABLE public.discord_dispatch_snippet_pools
    DROP CONSTRAINT IF EXISTS discord_dispatch_snippet_pools_state_action_type_id_outcome_dice_result_slot_key;
  ALTER TABLE public.discord_dispatch_snippet_pools
    DROP CONSTRAINT IF EXISTS discord_dispatch_snippet_pools_state_action_type_id_outcome_dic;
  ALTER TABLE public.discord_dispatch_snippet_pools
    DROP CONSTRAINT IF EXISTS discord_dispatch_snippet_pool_state_action_type_id_outcome__key;

  -- Supprimer les anciens pools demande_up (migration 080) pour éviter les incohérences
  DELETE FROM public.discord_dispatch_snippet_pools
  WHERE state_action_type_id = v_type_id AND outcome = 'accepted';

  -- -----------------------------
  -- Fallback générique (up_kind NULL)
  -- -----------------------------
  INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind, phrases) VALUES
    (v_type_id, 'accepted', 'success', 'title', NULL, '[
      "Développement : {country_name} annonce une avancée",
      "Mise à niveau : {country_name} renforce ses capacités",
      "Modernisation : {country_name} accélère ses investissements",
      "Programme de renforcement : {country_name} passe à l''étape suivante",
      "Capacités en hausse : {country_name} consolide ses moyens",
      "Avancée : {country_name} améliore ses capacités",
      "Plan de renforcement : {country_name} en progression",
      "Renforcement : {country_name} franchit un palier",
      "Évolution : {country_name} optimise ses ressources",
      "Investissements : {country_name} renforce son potentiel",
      "Développement interne : {country_name} se renforce",
      "Progrès : {country_name} améliore ses capacités",
      "Mise à niveau confirmée : {country_name}",
      "Capacités consolidées : {country_name}",
      "Programme abouti : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'success', 'description', NULL, '[
      "Les autorités de {country_name} annoncent une avancée. {up_summary}. Les observateurs prennent note.",
      "{country_name} enregistre un progrès notable. {up_summary}. Suivi attendu dans les prochains jours.",
      "Selon nos sources, {country_name} a renforcé ses capacités. {up_summary}. Les analystes commentent.",
      "{country_name} poursuit son développement interne. {up_summary}. Les médias relaient l''information.",
      "Une amélioration est confirmée pour {country_name}. {up_summary}. Les chancelleries prennent note.",
      "{country_name} consolide ses moyens. {up_summary}. Situation à suivre.",
      "Avancée confirmée pour {country_name}. {up_summary}. Réactions en cours.",
      "{country_name} franchit un palier de renforcement. {up_summary}. Les observateurs restent attentifs.",
      "Développement abouti : {country_name}. {up_summary}. Communiqué attendu.",
      "{country_name} annonce une optimisation de ses ressources. {up_summary}.",
      "Progrès interne pour {country_name}. {up_summary}.",
      "Renforcement confirmé : {country_name}. {up_summary}.",
      "{country_name} accélère ses investissements. {up_summary}.",
      "Évolution enregistrée pour {country_name}. {up_summary}.",
      "Mise à niveau actée pour {country_name}. {up_summary}." ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'title', NULL, '[
      "Développement sans suite : {country_name}",
      "Mise à niveau reportée : {country_name}",
      "Plan en suspens : {country_name} temporise",
      "Investissement sans effet : {country_name}",
      "Avancée avortée : {country_name}",
      "Renforcement interrompu : {country_name}",
      "Progrès attendu : {country_name} sans résultat",
      "Mise à niveau bloquée : {country_name}",
      "Développement retardé : {country_name}",
      "Programme au point mort : {country_name}",
      "Sans avancée : {country_name}",
      "Échec du renforcement : {country_name}",
      "Projet suspendu : {country_name}",
      "Capacités inchangées : {country_name}",
      "Progrès reporté : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'description', NULL, '[
      "La mise à niveau annoncée par {country_name} n''a pas produit d''effet mesurable. {dice_success_label}. {up_summary}.",
      "Tentative infructueuse de renforcement pour {country_name}. {dice_success_label}. {up_summary}.",
      "Le programme de {country_name} n''a pas abouti. {dice_success_label}. {up_summary}.",
      "Développement reporté pour {country_name}. {dice_success_label}. {up_summary}.",
      "Investissement sans résultat pour {country_name}. {dice_success_label}. {up_summary}.",
      "Avancée avortée : {country_name}. {dice_success_label}. {up_summary}.",
      "Renforcement interrompu pour {country_name}. {dice_success_label}. {up_summary}.",
      "{country_name} reste sans avancée. {dice_success_label}. {up_summary}.",
      "Programme bloqué pour {country_name}. {dice_success_label}. {up_summary}.",
      "Progrès non confirmé pour {country_name}. {dice_success_label}. {up_summary}.",
      "{country_name} n''a pas obtenu l''amélioration attendue. {dice_success_label}. {up_summary}.",
      "La mise à niveau de {country_name} est restée sans effet. {dice_success_label}. {up_summary}.",
      "Pas d''évolution notable pour {country_name}. {dice_success_label}. {up_summary}.",
      "Échec du programme de renforcement de {country_name}. {dice_success_label}. {up_summary}.",
      "La progression attendue pour {country_name} n''est pas au rendez-vous. {dice_success_label}. {up_summary}." ]'::jsonb);

  -- -----------------------------
  -- up_kind = stat
  -- -----------------------------
  INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind, phrases) VALUES
    (v_type_id, 'accepted', 'success', 'title', 'stat', '[
      "Hausse des indicateurs : {country_name}",
      "Renforcement interne : {country_name} améliore ses scores",
      "Développement : {country_name} consolide sa société",
      "Progrès : {country_name} gagne en performance",
      "Capacités nationales : {country_name} en amélioration",
      "Réformes : {country_name} franchit un palier",
      "Indicateurs en hausse : {country_name}",
      "Stabilité et performances : {country_name} progresse",
      "Évolution des scores : {country_name}",
      "Renforcement des capacités : {country_name}",
      "Amélioration interne : {country_name}",
      "Consolidation : {country_name} progresse",
      "Nouveaux progrès : {country_name}",
      "Réajustements : {country_name} optimise ses indicateurs",
      "Amélioration des scores : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'success', 'description', 'stat', '[
      "{country_name} annonce une amélioration de ses indicateurs nationaux. {up_summary}.", "Les autorités de {country_name} confirment un renforcement interne. {up_summary}.", "Progrès interne pour {country_name}. {up_summary}. Les observateurs prennent note.", "{country_name} consolide ses performances nationales. {up_summary}.", "Selon nos sources, {country_name} a amélioré ses scores. {up_summary}.", "{country_name} franchit un palier dans ses indicateurs. {up_summary}.", "Amélioration enregistrée pour {country_name}. {up_summary}.", "Les indicateurs de {country_name} sont revus à la hausse. {up_summary}.", "{country_name} optimise ses capacités internes. {up_summary}.", "Renforcement confirmé : {country_name}. {up_summary}.", "Réformes abouties : {country_name}. {up_summary}.", "{country_name} enregistre une progression sur ses scores. {up_summary}.", "Les performances nationales de {country_name} progressent. {up_summary}.", "Consolidation interne : {country_name}. {up_summary}.", "Évolution positive pour {country_name}. {up_summary}." ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'title', 'stat', '[
      "Indicateurs inchangés : {country_name}",
      "Réformes sans effet : {country_name}",
      "Progrès reporté : {country_name}",
      "Amélioration non confirmée : {country_name}",
      "Réajustements sans suite : {country_name}",
      "Renforcement interne avorté : {country_name}",
      "Scores stables : {country_name}",
      "Évolution bloquée : {country_name}",
      "Capacités inchangées : {country_name}",
      "Programme de réforme en suspens : {country_name}",
      "Sans progression : {country_name}",
      "Statu quo : {country_name}",
      "Réformes retardées : {country_name}",
      "Échec de consolidation : {country_name}",
      "Progrès non validé : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'description', 'stat', '[
      "La tentative d''amélioration des indicateurs de {country_name} n''a pas abouti. {dice_success_label}. {up_summary}.", "Réformes sans effet mesurable pour {country_name}. {dice_success_label}. {up_summary}.", "{country_name} reste sans progression confirmée. {dice_success_label}. {up_summary}.", "Amélioration non validée pour {country_name}. {dice_success_label}. {up_summary}.", "Les scores de {country_name} restent stables. {dice_success_label}. {up_summary}.", "Renforcement interne avorté : {country_name}. {dice_success_label}. {up_summary}.", "Évolution bloquée pour {country_name}. {dice_success_label}. {up_summary}.", "Programme de réforme en suspens pour {country_name}. {dice_success_label}. {up_summary}.", "{country_name} n''a pas obtenu l''amélioration attendue. {dice_success_label}. {up_summary}.", "Consolidation non confirmée : {country_name}. {dice_success_label}. {up_summary}.", "Pas d''évolution notable des indicateurs de {country_name}. {dice_success_label}. {up_summary}.", "La progression annoncée par {country_name} est restée sans effet. {dice_success_label}. {up_summary}.", "Réajustements sans résultat pour {country_name}. {dice_success_label}. {up_summary}.", "Échec de consolidation pour {country_name}. {dice_success_label}. {up_summary}.", "Progrès reporté pour {country_name}. {dice_success_label}. {up_summary}." ]'::jsonb);

  -- -----------------------------
  -- up_kind = tech
  -- -----------------------------
  INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind, phrases) VALUES
    (v_type_id, 'accepted', 'success', 'title', 'tech', '[
      "Modernisation : {country_name} investit dans la R&D militaire",
      "Avancée technologique : {country_name} accélère la modernisation",
      "Recherche et développement : {country_name} progresse",
      "Programme de modernisation : {country_name} en hausse",
      "Technologie : {country_name} franchit un palier",
      "R&D : {country_name} améliore ses capacités",
      "Modernisation de l''arsenal : {country_name}",
      "Avancée industrielle et technologique : {country_name}",
      "Capacités technologiques : {country_name} renforcées",
      "Innovations : {country_name} accélère",
      "Technologie militaire : {country_name} se modernise",
      "Programme de recherche : {country_name} intensifie ses efforts",
      "Modernisation confirmée : {country_name}",
      "R&D renforcée : {country_name}",
      "Progrès technologique : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'success', 'description', 'tech', '[
      "{country_name} enregistre une avancée technologique. {up_summary}.", "Selon nos sources, {country_name} renforce sa R&D militaire. {up_summary}.", "Modernisation confirmée pour {country_name}. {up_summary}. Les observateurs prennent note.", "{country_name} accélère ses programmes de modernisation. {up_summary}.", "Recherche et développement en hausse : {country_name}. {up_summary}.", "{country_name} améliore ses capacités technologiques. {up_summary}.", "Avancée enregistrée pour {country_name}. {up_summary}.", "Les efforts de R&D de {country_name} portent leurs fruits. {up_summary}.", "Modernisation de l''arsenal : {country_name}. {up_summary}.", "Innovations confirmées pour {country_name}. {up_summary}.", "{country_name} franchit un palier technologique. {up_summary}.", "Programme de recherche renforcé : {country_name}. {up_summary}.", "Progrès technologique pour {country_name}. {up_summary}.", "Capacités technologiques consolidées : {country_name}. {up_summary}.", "Modernisation actée pour {country_name}. {up_summary}." ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'title', 'tech', '[
      "Modernisation sans suite : {country_name}",
      "R&D au point mort : {country_name}",
      "Avancée technologique reportée : {country_name}",
      "Programme de recherche bloqué : {country_name}",
      "Modernisation interrompue : {country_name}",
      "Sans progrès technologique : {country_name}",
      "Innovations non confirmées : {country_name}",
      "R&D sans résultat : {country_name}",
      "Programme de modernisation en suspens : {country_name}",
      "Technologie stable : {country_name}",
      "Modernisation retardée : {country_name}",
      "Recherche sans effet : {country_name}",
      "Avancée avortée : {country_name}",
      "Sans modernisation : {country_name}",
      "Progrès non validé : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'description', 'tech', '[
      "Les efforts de modernisation de {country_name} n''ont pas abouti. {dice_success_label}. {up_summary}.", "R&D sans résultat mesurable pour {country_name}. {dice_success_label}. {up_summary}.", "Programme technologique bloqué : {country_name}. {dice_success_label}. {up_summary}.", "Avancée technologique reportée pour {country_name}. {dice_success_label}. {up_summary}.", "Modernisation interrompue : {country_name}. {dice_success_label}. {up_summary}.", "{country_name} reste sans progrès technologique confirmé. {dice_success_label}. {up_summary}.", "Innovations non validées pour {country_name}. {dice_success_label}. {up_summary}.", "Recherche sans effet pour {country_name}. {dice_success_label}. {up_summary}.", "Programme de modernisation en suspens pour {country_name}. {dice_success_label}. {up_summary}.", "Technologie stable : {country_name}. {dice_success_label}. {up_summary}.", "Modernisation retardée pour {country_name}. {dice_success_label}. {up_summary}.", "Progrès technologique non confirmé : {country_name}. {dice_success_label}. {up_summary}.", "Avancée avortée : {country_name}. {dice_success_label}. {up_summary}.", "Sans modernisation notable pour {country_name}. {dice_success_label}. {up_summary}.", "Les investissements R&D de {country_name} restent sans effet. {dice_success_label}. {up_summary}." ]'::jsonb);

  -- -----------------------------
  -- up_kind = nombre
  -- -----------------------------
  INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind, phrases) VALUES
    (v_type_id, 'accepted', 'success', 'title', 'nombre', '[
      "Production militaire : {country_name} renforce ses effectifs",
      "Renforcement de l''arsenal : {country_name} augmente ses capacités",
      "Chaînes de production : {country_name} accélère la montée en puissance",
      "Capacités renforcées : {country_name} étoffe son parc",
      "Arsenal en hausse : {country_name} augmente ses effectifs",
      "Montée en puissance : {country_name} renforce son arsenal",
      "Production accrue : {country_name} augmente ses moyens",
      "Renforcement : {country_name} étoffe ses capacités",
      "Capacités industrielles : {country_name} en progression",
      "Arsenal consolidé : {country_name}",
      "Effectifs en hausse : {country_name}",
      "Production confirmée : {country_name} renforce ses moyens",
      "Montée en cadence : {country_name} augmente ses capacités",
      "Renforcement des effectifs : {country_name}",
      "Arsenal renforcé : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'success', 'description', 'nombre', '[
      "{country_name} a renforcé son arsenal avec succès. {up_summary}.", "Selon nos sources, {country_name} augmente ses effectifs et capacités de production. {up_summary}.", "Renforcement confirmé pour {country_name}. {up_summary}. Les observateurs prennent note.", "{country_name} accélère la montée en puissance de ses moyens. {up_summary}.", "Production accrue : {country_name}. {up_summary}.", "Chaînes de production en hausse pour {country_name}. {up_summary}.", "Arsenal en progression : {country_name}. {up_summary}.", "{country_name} consolide ses capacités matérielles. {up_summary}.", "Effectifs renforcés pour {country_name}. {up_summary}.", "Montée en cadence confirmée : {country_name}. {up_summary}.", "Renforcement des capacités : {country_name}. {up_summary}.", "{country_name} étoffe son parc et ses effectifs. {up_summary}.", "Arsenal consolidé : {country_name}. {up_summary}.", "Capacités industrielles renforcées : {country_name}. {up_summary}.", "Production militaire confirmée : {country_name}. {up_summary}." ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'title', 'nombre', '[
      "Production sans suite : {country_name}",
      "Renforcement reporté : {country_name}",
      "Chaînes de production en panne : {country_name}",
      "Montée en puissance avortée : {country_name}",
      "Arsenal inchangé : {country_name}",
      "Effectifs stables : {country_name}",
      "Production interrompue : {country_name}",
      "Sans renforcement matériel : {country_name}",
      "Capacités industrielles stables : {country_name}",
      "Renforcement bloqué : {country_name}",
      "Production retardée : {country_name}",
      "Montée en cadence sans résultat : {country_name}",
      "Arsenal stable : {country_name}",
      "Effectifs inchangés : {country_name}",
      "Sans montée en puissance : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'description', 'nombre', '[
      "La montée en puissance de {country_name} n''a pas produit d''effet mesurable. {dice_success_label}. {up_summary}.", "Production sans résultat pour {country_name}. {dice_success_label}. {up_summary}.", "Renforcement matériel avorté : {country_name}. {dice_success_label}. {up_summary}.", "Chaînes de production en panne pour {country_name}. {dice_success_label}. {up_summary}.", "Arsenal inchangé : {country_name}. {dice_success_label}. {up_summary}.", "Effectifs stables : {country_name}. {dice_success_label}. {up_summary}.", "Production interrompue pour {country_name}. {dice_success_label}. {up_summary}.", "Sans renforcement matériel notable : {country_name}. {dice_success_label}. {up_summary}.", "Capacités industrielles stables pour {country_name}. {dice_success_label}. {up_summary}.", "Renforcement bloqué : {country_name}. {dice_success_label}. {up_summary}.", "Production retardée pour {country_name}. {dice_success_label}. {up_summary}.", "Montée en cadence sans résultat : {country_name}. {dice_success_label}. {up_summary}.", "Arsenal stable : {country_name}. {dice_success_label}. {up_summary}.", "Effectifs inchangés : {country_name}. {dice_success_label}. {up_summary}.", "Sans montée en puissance : {country_name}. {dice_success_label}. {up_summary}." ]'::jsonb);

  -- -----------------------------
  -- up_kind = mixed
  -- -----------------------------
  INSERT INTO public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind, phrases) VALUES
    (v_type_id, 'accepted', 'success', 'title', 'mixed', '[
      "Développement : {country_name} renforce plusieurs capacités",
      "Mise à niveau : {country_name} consolide ses moyens",
      "Programme de renforcement : {country_name} multiplie les avancées",
      "Modernisation : {country_name} en progression",
      "Capacités en hausse : {country_name} accélère",
      "Renforcement global : {country_name} franchit un palier",
      "Avancée multiple : {country_name} se renforce",
      "Investissements : {country_name} consolide plusieurs axes",
      "Développement interne : {country_name} progresse",
      "Programme abouti : {country_name} renforce ses moyens",
      "Renforcement confirmé : {country_name}",
      "Évolution : {country_name} améliore ses capacités",
      "Mise à niveau confirmée : {country_name}",
      "Progrès : {country_name} multiplie les améliorations",
      "Capacités consolidées : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'success', 'description', 'mixed', '[
      "{country_name} annonce une série d''améliorations. {up_summary}.", "Selon nos sources, {country_name} renforce plusieurs capacités à la fois. {up_summary}.", "Renforcement global confirmé pour {country_name}. {up_summary}. Les observateurs prennent note.", "{country_name} franchit un palier sur plusieurs axes. {up_summary}.", "Développement interne abouti pour {country_name}. {up_summary}.", "Modernisation et renforcement : {country_name}. {up_summary}.", "Avancée multiple enregistrée pour {country_name}. {up_summary}.", "Investissements confirmés pour {country_name}. {up_summary}.", "{country_name} consolide ses moyens sur plusieurs volets. {up_summary}.", "Programme de renforcement en progression : {country_name}. {up_summary}.", "{country_name} multiplie les améliorations. {up_summary}.", "Renforcement confirmé : {country_name}. {up_summary}.", "Évolution enregistrée : {country_name}. {up_summary}.", "Capacités consolidées : {country_name}. {up_summary}.", "Progrès interne pour {country_name}. {up_summary}." ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'title', 'mixed', '[
      "Programme sans suite : {country_name}",
      "Mise à niveau reportée : {country_name}",
      "Renforcement interrompu : {country_name}",
      "Investissements sans résultat : {country_name}",
      "Avancée avortée : {country_name}",
      "Progrès non confirmés : {country_name}",
      "Renforcement bloqué : {country_name}",
      "Sans avancée : {country_name}",
      "Programme au point mort : {country_name}",
      "Capacités inchangées : {country_name}",
      "Développement retardé : {country_name}",
      "Échec du programme : {country_name}",
      "Sans progrès : {country_name}",
      "Évolution bloquée : {country_name}",
      "Mise à niveau sans effet : {country_name}" ]'::jsonb),
    (v_type_id, 'accepted', 'failure', 'description', 'mixed', '[
      "Le programme de renforcement de {country_name} n''a pas abouti. {dice_success_label}. {up_summary}.", "Tentative infructueuse pour {country_name}. {dice_success_label}. {up_summary}.", "{country_name} reste sans progrès confirmé. {dice_success_label}. {up_summary}.", "Mise à niveau reportée pour {country_name}. {dice_success_label}. {up_summary}.", "Investissements sans résultat : {country_name}. {dice_success_label}. {up_summary}.", "Avancée avortée : {country_name}. {dice_success_label}. {up_summary}.", "Renforcement interrompu pour {country_name}. {dice_success_label}. {up_summary}.", "Programme au point mort : {country_name}. {dice_success_label}. {up_summary}.", "Capacités inchangées : {country_name}. {dice_success_label}. {up_summary}.", "Développement retardé pour {country_name}. {dice_success_label}. {up_summary}.", "Échec du programme : {country_name}. {dice_success_label}. {up_summary}.", "Sans progrès notable pour {country_name}. {dice_success_label}. {up_summary}.", "Évolution bloquée : {country_name}. {dice_success_label}. {up_summary}.", "Mise à niveau sans effet : {country_name}. {dice_success_label}. {up_summary}.", "Les améliorations attendues pour {country_name} restent sans effet. {dice_success_label}. {up_summary}." ]'::jsonb);
END $$;

