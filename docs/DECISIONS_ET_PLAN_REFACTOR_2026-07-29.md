# Fates of Nations — décisions et plan de refactor

Date : 29 juillet 2026  
Statut : décisions produit validées, Discord reporté

## 1. Décisions produit validées

### Confidentialité et droits

1. Les données adverses sensibles sont protégées dans la base : armée exacte, budget, État-major, renseignement et actions secrètes.
2. Le renseignement révèle progressivement l’armée, le budget et l’État-major.
3. Un score unique de 0 à 100 existe par couple observateur/cible.
4. Paliers communs : 0 rien ; 1–49 général ; 50–99 détaillé ; 100 exact.
5. La publication Discord est reportée dans une refonte séparée.
6. Le joueur envoie uniquement des choix ; le serveur vérifie et applique chaque modification.
7. Un joueur contrôle un seul pays et un pays possède un seul joueur.
8. Le joueur peut modifier nom, régime et drapeau avec validation des textes et fichiers.

### Rythme du monde

9. Le passage de jour est automatique, avec déclenchement manuel sécurisé pour le MJ.
10. La pause bloque le tick, l’IA, les événements différés et les expirations.
11. Après une panne, le MJ choisit combien de jours rattraper.
12. Une décision reçue pendant un tick est appliquée au jour suivant.

### Actions d’État

13. Le coût est réservé dès l’envoi.
14. Un refus de la cible ne rembourse pas le coût.
15. Un jet de succès raté consomme le coût et n’applique aucun effet.
16. Le moteur produit le résultat ; une correction MJ reste possible si elle est motivée et tracée.
17. Les actions sans mécanique permanente restent des tickets MJ structurés.
18. Une demande sans réponse expire après un délai défini.

### Contrôle territorial

19. Le total des parts de contrôle ne dépasse jamais 100 %.
20. Un nouveau gain retire proportionnellement des parts aux autres contrôleurs.
21. Occupation et annexion sont proposées par le système puis validées par le MJ.

### Budget et lois

22. `budget_fraction` définit réellement l’enveloppe budgétaire et alimente les calculs.
23. Le plafond de base est 100 %, mais des effets peuvent le modifier.
24. Un nouveau budget produit ses effets au tick suivant.
25. Le ministère d’État génère réellement des Actions d’État.
26. Une loi produit ses effets selon son score atteint, jamais selon sa cible.
27. Le joueur peut changer librement la cible d’une loi jusqu’au prochain tick.

### Armée, avantages et idéologie

28. Le joueur ne modifie pas directement ses unités ; la progression passe par l’État-major.
29. Changer de focus conserve la progression déjà acquise.
30. Les limites militaires sont informatives : elles ne bloquent ni ne pénalisent.
31. Les avantages sont automatiques et réversibles.
32. L’évolution idéologique est calculée et enregistrée chaque jour.
33. Toute idéologie dépassant son seuil applique ses effets.

### IA, administration et campagnes

34. L’IA suit les mêmes coûts, délais et conditions que les joueurs.
35. Les actions IA lourdes nécessitent une validation MJ.
36. Un rôle administrateur unique est conservé.
37. Corrections et ticks manuels exigent aperçu, motif et historique avant/après.
38. Une campagne est active ; les anciennes restent archivées en lecture seule.
39. Toutes les données actuelles sont conservées et migrées.
40. Les règles publiées font foi ; sécurité et corruption sont corrigées immédiatement, tout changement de gameplay exige une validation.

## 2. Précisions prises en charge pendant l’implémentation

Ces points ne changent pas l’architecture et ne nécessitent pas un nouvel entretien :

- Une expiration est traitée comme un refus : coût consommé, aucun effet.
- Après un jet raté, le MJ ne peut pas ajouter d’effet ; il peut seulement corriger une erreur technique, avec une trace.
- La pause interdit aussi le tick manuel. Une dérogation forcée exige une confirmation et une trace explicites.
- Le délai d’expiration reste une valeur de règle ajustable ; sa valeur initiale sera validée avec le monde de référence.
- La future matrice officielle des règles corrigera d’abord le wiki obsolète, puis deviendra la référence publiée.

## 3. Faits vérifiés qui imposent une correction

- Des données sensibles sont actuellement lisibles directement malgré leur masquage dans l’interface.
- Des joueurs peuvent modifier des valeurs de gameplay sans passer par une opération suffisamment étroite.
- Le passage de jour peut être déclenché deux fois et sa pause n’est pas fiable.
- Un refus de la cible rembourse actuellement le coût : la décision 14 change volontairement ce comportement.
- Un jet raté peut encore produire des conséquences : la décision 15 corrige ce comportement.
- Les demandes ciblées n’expirent pas.
- Le contrôle territorial peut dépasser 100 %.
- `budget_fraction` ne pilote pas toutes les formules annoncées.
- Le plafond budgétaire de la base bloque actuellement certains plafonds augmentés par effet.
- Le ministère d’État annonce un gain d’Actions d’État que le moteur ne produit pas correctement.
- L’évolution idéologique automatique n’est pas enregistrée.
- L’espionnage IA n’alimente pas le renseignement.
- Les limites militaires sont déjà essentiellement informatives ; la décision 30 confirme ce comportement.

## 4. Garanties techniques non négociables

- Une action, un tick ou une correction est appliqué exactement une fois.
- Une erreur annule l’opération complète au lieu de laisser un état partiel.
- Aucun visiteur ne peut modifier de donnée.
- Un joueur ne peut agir que pour son pays et uniquement par les commandes prévues.
- L’admin voit un aperçu avant toute opération globale ou destructive.
- Chaque correction conserve l’auteur, le motif, l’avant et l’après.
- Sauvegarde et retour arrière sont testés avant toute migration de production.
- Les mêmes données donnent les mêmes résultats sur l’accueil, les classements et la fiche pays.

## 5. Plan de refactor

### Phase 1 — Sauvegarder et sécuriser

- Sauvegarder la production et exporter un monde de test anonymisé.
- Comparer les migrations du dépôt avec les droits réellement présents en production.
- Faire tourner et déplacer le secret exposé.
- Fermer les fonctions publiques, écritures joueurs trop larges et fichiers sensibles.
- Protéger toutes les pages admin par un contrôle unique.
- Supprimer le bouton de renseignement de test.
- Mettre à jour les dépendances vulnérables.

**Validation :** tests visiteur, compte sans pays, joueur propriétaire, joueur adverse et admin.

### Phase 2 — Capturer le gameplay actuel

- Rejouer un tick complet sur le monde de référence.
- Capturer budget, lois, État-major, armée, actions, contrôle, avantages, idéologie, IA, Influence et Hard Power.
- Distinguer pour chaque différence : bug, faille, règle publiée ou changement volontaire validé.
- Conserver et migrer toutes les données existantes.

**Validation :** comparaison automatique avant/après, hors changements listés en section 6.

### Phase 3 — Fiabiliser le moteur

- Faire de PostgreSQL l’autorité unique du passage de jour.
- Ajouter un identifiant et un verrou empêchant tout double tick.
- Rendre automatiques et manuels les ticks sûrs et traçables.
- Appliquer la pause totale et le rattrapage choisi par le MJ.
- Reporter au jour suivant les choix reçus pendant un tick.
- Rendre atomiques réservation du coût, expiration, accord, refus, jets et conséquences.
- Unifier les trois processeurs d’événements dus.

**Validation :** tests de double clic, double tick, reprise après panne et erreur au milieu d’une opération.

### Phase 4 — Protéger les données et le renseignement

- Rendre privées les tables sensibles.
- Fournir des vues sécurisées selon le rôle et le score de renseignement.
- Étendre les paliers existants au budget et à l’État-major.
- Conserver la baisse quotidienne du score et le renouvellement des estimations.
- Valider toutes les modifications d’identité, de budget, de loi et de focus côté serveur.

**Validation :** aucune donnée exacte adverse n’est accessible en contournant l’interface.

### Phase 5 — Réconcilier les règles de gameplay

- Plafonner le contrôle à 100 % et redistribuer proportionnellement.
- Ajouter le circuit proposition puis validation pour occupation et annexion.
- Rendre `budget_fraction` réellement autoritaire.
- Autoriser les plafonds budgétaires modifiés par effet.
- Activer le gain d’Actions d’État du ministère d’État.
- Calculer les lois sur leur score atteint.
- Réserver la progression militaire à l’État-major et conserver les progrès de focus.
- Garder les limites militaires purement informatives.
- Rendre les avantages automatiques et réversibles.
- Enregistrer l’idéologie quotidienne et appliquer toutes les idéologies au-dessus du seuil.
- Soumettre l’IA aux mêmes règles, avec validation des actions lourdes.
- Conserver les actions incomplètes comme tickets MJ structurés et expirables.

**Validation :** un test ciblé pour chaque règle et chaque changement volontaire.

### Phase 6 — Administration, historique et simplification

- Ajouter aperçu, motif et historique avant/après aux outils MJ.
- Séparer campagne active et archives en lecture seule.
- Journaliser les ticks, leur durée, leur résultat et les corrections.
- Publier la matrice officielle des règles et aligner le wiki.
- Unifier Influence, Hard Power et les effets sur toutes les pages.
- Supprimer uniquement après preuve d’équivalence les doublons, écrans morts et dépendances inutiles.
- Livrer par petites migrations réversibles.
- Laisser Discord isolé jusqu’à sa refonte dédiée.

**Validation :** restauration testée, historique consultable et contrôle final mobile/accessibilité.

## 6. Changements volontaires à isoler

Ces changements doivent être livrés séparément des correctifs purement techniques :

1. Le renseignement révèle aussi le budget et l’État-major.
2. Le refus ou l’expiration d’une demande consomme son coût.
3. Un jet raté ne produit strictement aucun effet.
4. Les demandes ciblées expirent.
5. Le contrôle territorial est plafonné et redistribué.
6. Occupation et annexion nécessitent une validation MJ.
7. `budget_fraction` devient réellement déterminant.
8. Les effets peuvent relever le plafond budgétaire au-delà de 100 %.
9. Le ministère d’État génère réellement des Actions d’État.
10. Toute idéologie au-dessus de son seuil applique ses effets.
11. Les actions IA lourdes nécessitent une validation MJ.
12. Le renseignement IA suit les mêmes règles que celui des joueurs.

Chaque changement reçoit son propre test, sa comparaison avant/après et son accord de livraison.
