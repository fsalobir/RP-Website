# Spike Zero-SVG (faisabilite)

## Hypothese

Le pipeline SVG geographique est un contributeur majeur aux ralentissements (DOM + layout + repaint) sur nation/province.

## Objectif du spike

Valider qu'un chemin WebGL-first peut couvrir:

- provinces et bordures
- rivieres et routes
- villes et objets
- labels essentiels

Sans garder de couche SVG geographique en mode normal.

## Criteres de succes

- Diminution nette de noeuds SVG geographiques.
- Amelioration p95/p99 interaction.
- Clics/picking fonctionnels MJ/Public.
- Aucune regression bloquante mobile.

## Criteres d'arret

- Si texte/labels WebGL casse la lisibilite, conserver fallback minimal temporaire, puis corriger avant rollout large.
