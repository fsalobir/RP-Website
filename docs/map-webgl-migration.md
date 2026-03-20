# Migration WebGL carte (plan technique)

**Exécution pas à pas :** voir `docs/map-webgl-rollout-checklist.md`.
**Perf routes (court/moyen terme) :** voir `docs/map-routes-performance-roadmap.md`.

## Flag et rollback

- `NEXT_PUBLIC_MAP_RENDERER=svg|webgl`
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=off|mj-only|public-canary|all`
- `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` pour rollback immédiat

## Phases

1. **Phase 0**: instrumentation et baseline perf (déjà en place)
2. **Phase 1**: WebGL routes + points (MJ seulement)
3. **Phase 2**: ajout provinces + labels sous flag
4. **Phase 3**: canary public (5% -> 25% -> 50% -> 100%)
5. **Phase 4**: retrait pipeline SVG après 2 semaines stables

Références de gouvernance:

- `docs/map-product-principles.md`
- `docs/map-slo.md`
- `docs/map-interaction-contract.md`
- `docs/map-mj-public-parity-matrix.md`
- `docs/map-browser-device-matrix.md`
- `docs/map-rollback-drills.md`
- `docs/map-post-launch-guardrails.md`

## Contrat MVP WebGL (phase 1)

- **Routes** : rendu **SVG** (stroke natif), même quand le rollout WebGL est actif — la triangulation WebGL en quads produisait des artefacts d’échelle ; réintroduction WebGL routes prévue avec ligne robuste (miters / instancing).
- Couches **hors routes** : villes / POI en SVG au-dessus (icônes nettes, hors `fantasyGlow`).
- Interactions conservées:
  - clic route -> panneau public / sélection MJ
  - clic ville -> panneau public / édition MJ
- Exclusions temporaires:
  - remplissage provinces complexe en SVG (fallback tant que non stabilisé)
  - labels denses non essentiels (cap selon palier de zoom)
- Fallback garanti: `FORCE_SVG=1` repasse immédiatement en SVG.

## Rollout effectif

- `off`: SVG forcé.
- `mj-only`: WebGL activé pour MJ, public en SVG.
- `public-canary`: MJ en WebGL + public canari via clé utilisateur stable.
- `all`: WebGL partout (avec kill-switch toujours actif).

## Décommission SVG (checklist)

1. Maintenir une fenêtre de stabilité >= 14 jours en `all`.
2. Vérifier parité fonctionnelle MJ/Public + SLO perf.
3. Retirer les chemins SVG des couches déjà couvertes (routes/points) en conservant un fallback minimal.
4. Mettre à jour runbook incident et la matrice de parité.

## Critères de passage

- Pas de régression > seuils `map-benchmark-thresholds.json`
- Taux d’erreur carte inchangé ou meilleur
- Cohérence visuelle MJ/Public validée (labels, sinuosité, tailles)

## Runbook incident

- Forcer rollback via `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`
- Revenir au stage `off`
- Vérifier artefacts précompute et métriques runtime

