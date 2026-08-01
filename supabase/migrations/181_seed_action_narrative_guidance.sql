UPDATE public.action_automation_configs AS config
SET narrative_guidance = CASE action_type.key
  WHEN 'insulte_diplomatique' THEN
    'Raconter un propos ou geste offensant de l’auteur envers la cible. Ne pas inverser l’auteur et la cible. Ne pas inventer rupture, sanction, expulsion ou annulation.'
  WHEN 'ouverture_diplomatique' THEN
    'Raconter l’ouverture ou la reprise d’un contact officiel. Ce n’est ni un accord, ni un traité, ni une alliance, ni une coopération sectorielle, ni un engagement concret.'
  WHEN 'prise_influence' THEN
    'Raconter uniquement la progression d’influence prévue. Ne pas inventer traité, contrôle territorial, propriété, accès militaire ou changement de gouvernement.'
  WHEN 'demande_up' THEN
    'Raconter le jalon précis décrit par l’intention et les sources. Ne pas transformer un essai, une demande ou un prototype en déploiement général.'
  WHEN 'escarmouche_militaire' THEN
    'Raconter un affrontement limité. Ne pas annoncer guerre ouverte, conquête, victoire stratégique, victime ou changement territorial sans fait explicite.'
  WHEN 'conflit_arme' THEN
    'Raconter le combat ou l’opération prévu sans l’élargir. Ne pas inventer déclaration de guerre, front supplémentaire, victime, dégât ou changement territorial.'
  WHEN 'guerre_ouverte' THEN
    'Raconter le déclenchement d’une guerre uniquement si le résultat est atteint. Ne pas inventer bataille, victime, destruction, occupation ou vainqueur absent des faits.'
  WHEN 'accord_commercial_politique' THEN
    'Raconter seulement l’accord et le périmètre explicitement fournis. Ne pas inventer monnaie commune, alliance, clause secrète, montant ou obligation supplémentaire.'
  WHEN 'cooperation_militaire' THEN
    'Raconter la coopération militaire explicitement prévue. Ne pas inventer alliance, base, stationnement permanent, transfert d’arme ou garantie de défense.'
  WHEN 'alliance' THEN
    'Raconter la formation de l’alliance seulement si le résultat est atteint. Ne pas inventer clause, commandement commun, intervention automatique, base ou déploiement.'
  WHEN 'espionnage' THEN
    'Respecter strictement l’attribution publique. Raconter seulement l’objectif obtenu ou la tentative empêchée, sans méthode, agent, victime ni donnée supplémentaire.'
  WHEN 'sabotage' THEN
    'Respecter strictement l’attribution publique. Raconter seulement l’effet explicitement établi ou la tentative empêchée, sans méthode, auteur public, victime ni dégât supplémentaire.'
  WHEN 'effort_fortifications' THEN
    'Raconter uniquement l’étude, le chantier ou le renforcement prévu. Ne pas inventer emplacement, capacité, arme, achèvement ou mise en service.'
  WHEN 'investissements' THEN
    'Raconter uniquement l’investissement ou les travaux prévus. Ne pas inventer montant, secteur, entreprise, calendrier, emploi ou achèvement absent des faits.'
  ELSE narrative_guidance
END
FROM public.state_action_types AS action_type
WHERE config.action_type_id = action_type.id
  AND config.narrative_guidance = '';
