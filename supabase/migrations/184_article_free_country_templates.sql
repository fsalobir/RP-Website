UPDATE public.action_automation_configs AS config
SET fact_blueprints = CASE action_type.key
  WHEN 'insulte_diplomatique' THEN '[
    ["{auteur} prépare une note officielle volontairement offensante ; {cible} en est le destinataire.", "Le texte attaque directement la position défendue par {cible} et assume un ton de confrontation.", "{auteur} rend la note publique après sa transmission."],
    ["Lors d’un échange diplomatique public réunissant les deux pays, {auteur} choisit la provocation.", "{cible} devient la cible directe du propos, qui rompt avec les usages de courtoisie suivis jusque-là.", "{auteur} maintient son propos au lieu de le retirer."]
  ]'::jsonb
  WHEN 'ouverture_diplomatique' THEN '[
    ["{auteur} et {cible} préparent la réouverture d’un canal de contact officiel.", "La proposition porte sur des échanges directs entre leurs représentants, sans accord politique préalable.", "Les deux pays doivent encore fixer la suite concrète de ce contact."],
    ["{auteur} propose de reprendre des discussions interrompues ; {cible} doit encore répondre.", "La démarche reste exploratoire et ne contient ni traité ni engagement sectoriel.", "La réponse détermine si le canal officiel peut fonctionner."]
  ]'::jsonb
  WHEN 'alliance' THEN '[
    ["{auteur} et {cible} ouvrent une réunion finale consacrée à la formation de leur alliance.", "Le texte soumis aux deux parties se limite aux engagements prévus par l’action.", "Aucun déploiement militaire n’est annoncé avec cette décision."],
    ["{auteur} et {cible} rendent publique leur volonté de former une alliance.", "La décision ne crée ni commandement commun ni base militaire en dehors des faits prévus.", "Les modalités futures restent à définir séparément."]
  ]'::jsonb
  WHEN 'cooperation_militaire' THEN '[
    ["{auteur} et {cible} lancent un programme limité de coopération militaire.", "Le programme porte sur des échanges professionnels et ne prévoit aucun stationnement permanent.", "Les deux pays distinguent cette coopération d’une alliance de défense."],
    ["{auteur} et {cible} arrêtent le principe d’une coopération militaire ciblée.", "La démarche ne comprend ni transfert d’arme ni garantie d’intervention.", "Son périmètre reste celui fixé par l’action."]
  ]'::jsonb
  WHEN 'prise_influence' THEN '[
    ["{auteur} cherche à accroître son influence bilatérale ; {cible} est le destinataire de l’initiative.", "La démarche utilise les canaux officiels déjà disponibles entre les deux pays.", "Elle ne confère à {auteur} ni contrôle territorial ni droit militaire."],
    ["{auteur} intensifie son travail d’influence bilatérale ; {cible} en constitue le terrain politique.", "L’initiative porte sur les décisions bilatérales sans modifier le gouvernement de {cible}.", "Aucun traité ni accès militaire n’en découle automatiquement."]
  ]'::jsonb
  WHEN 'espionnage' THEN '[
    ["{auteur} engage une tentative clandestine de collecte d’informations ; {cible} en est la cible.", "L’opération recherche uniquement l’objectif de renseignement prévu par l’action.", "L’identité des personnes impliquées et la méthode employée ne sont pas rendues publiques."],
    ["{auteur} lance une opération de renseignement ; {cible} détient les informations recherchées.", "Son périmètre reste limité à la cible prévue.", "Aucun dommage matériel ni arrestation n’est établi par l’action."]
  ]'::jsonb
  WHEN 'sabotage' THEN '[
    ["{auteur} engage la tentative de sabotage prévue ; {cible} en est la cible.", "L’opération se limite à l’objectif désigné par l’action.", "Aucune victime, destruction ou méthode supplémentaire n’est établie."],
    ["{auteur} lance une opération destinée à perturber une capacité précise ; {cible} en est la cible.", "La tentative n’a pas d’autre objectif que celui prévu.", "Les faits ne permettent pas d’annoncer de dégâts au-delà du résultat mécanique."]
  ]'::jsonb
  ELSE config.fact_blueprints
END
FROM public.state_action_types AS action_type
WHERE action_type.id = config.action_type_id
  AND action_type.key IN (
    'insulte_diplomatique',
    'ouverture_diplomatique',
    'alliance',
    'cooperation_militaire',
    'prise_influence',
    'espionnage',
    'sabotage'
  );
