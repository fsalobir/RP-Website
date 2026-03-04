# Amendements au plan « Rapports ministériels — gradients et conjoncture »

## 1. Magnitude : « massif » au lieu de « catastrophique »

- Remplacer partout le niveau **catastrophique** par **massif** (libellé et constantes, ex. `MAGNITUDE_*_MASSIVE`).
- Les seuils restent les mêmes (dernier palier de magnitude, ex. taux ≥ 10 % ou delta ≥ 1,0) ; seul le nom change.

## 2. Logique 100 % pilotée par les données (effets ministères modifiables par l’admin)

L’admin peut modifier à tout moment les effets des ministères (ex. ajouter « Santé → PIB » en plus de « Santé → Population »). La logique des rapports **ne doit rien supposer en dur** sur quel ministère agit sur quel indicateur.

- **Source unique du lien ministère ↔ indicateur** : les champs `expected.inputs.budget_*_sources` (et donc la config des règles par ministère, `rule_parameters` + `getEffectsListForMinistry` / `getExpectedNextTick`). Si un ministère a un effet sur une stat, il apparaît dans le bon `budget_*_sources[ministryLabel]`.
- **Côté rapport** : ne jamais lister en dur les stats par ministère (ex. « Santé = population uniquement »). Utiliser uniquement :
  - `getEffectsPerMinistryFromInputs(inputs)` qui dérive la liste des (stat, label) par ministère en parcourant les `budget_*_sources` et en ne gardant que les paires (ministère, stat) effectivement présentes.
- Ainsi, si l’admin ajoute un effet « Santé → PIB », au prochain calcul `budget_gdp_sources` contiendra une entrée pour le ministère de la Santé, et `getEffectsPerMinistryFromInputs` inclura `gdp` pour ce ministère sans aucun changement de code dans le rapport.
- **Gradients, magnitude, conjoncture** : tous les calculs (financement, magnitude, ministry_own / external / total) doivent s’appuyer sur cette liste dynamique de stats par ministère et sur les valeurs lues dans `inputs` (pas de tableau ou mapping codé en dur ministère → stats).

En résumé : tout ce qui est « quel ministère agit sur quelles stats » doit venir des données (`expected.inputs` + règles), jamais du code du rapport.
