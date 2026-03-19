# Rollout carte MJ -> Public

## Étape 1 (immédiat)

- Contrat versionné `map_display_config` actif en base.
- Paramètres d'affichage autoritaires côté serveur.
- Préférences locales MJ limitées à l'UX (panneaux/debug), sans impact public.
- Bench de base disponible via `npm run benchmark:map`.

## Étape 2 (feature flag renderer)

- Flag: `NEXT_PUBLIC_MAP_RENDERER=svg|webgl`.
- Tant que la couche WebGL n'est pas prête, fallback automatique SVG.
- Mesurer p95 avant/après activation du flag.

## Étape 3 (double run)

- Branch staging avec WebGL activé MJ uniquement.
- Public conserve SVG stable.
- Comparer: temps de rendu, fluidité pan/zoom, cohérence labels/routes.

## Étape 4 (bascule progressive)

- Activer WebGL pour MJ (100%), public (10% puis 50% puis 100%).
- Garde-fou: rollback instantané via le flag.
- Critère: aucun écart de config MJ/Public et SLO respectés 7 jours.

## Étape 5 (décommission)

- Retirer l'ancien pipeline SVG après validation complète.
- Conserver scripts de benchmark et tests de charge comme contrôle continu.

