# Feature flags carte v2

## Rendu WebGL (rollout)

Voir aussi `docs/map-webgl-migration.md` et `docs/map-webgl-rollout-checklist.md`.

- `NEXT_PUBLIC_MAP_RENDERER=svg|webgl` — moteur demandé (sans rollout actif → SVG).
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=…` — **affichage / diagnostic** ; le renderer effectif est **WebGL pour tout le monde** si `MAP_RENDERER=webgl` (voir `resolveEffectiveRenderer` dans `mapRenderer.ts`).
- `NEXT_PUBLIC_MAP_RENDERER_CANARY_PCT=0..100` — part du public en canary.
- `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` — rollback immédiat tout SVG.
- `NEXT_PUBLIC_MAP_QUALITY_TIER=perf|balanced|rich` — palier visuel/perf global (defaut: `perf`).
- `NEXT_PUBLIC_MAP_MOBILE_HARD_MODE=1|0` — mode mobile dur (defaut: `1`) pour baisser agressivement la charge.
- `NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE=1|0` — **défaut : désactivé.** `1` = activé (test perf / build preview) ; nécessite `WEBGL_PROVINCES` aligné sinon provinces SVG coupées.

Variables listées dans `.env.example`.

- `NEXT_PUBLIC_REALM_COLORING_V2=1|0`
  - Active/désactive la coloration des provinces par royaume.
- `NEXT_PUBLIC_MAP_INFO_PANELS_V2=1|0`
  - Active/désactive les panneaux d'information cliquables côté public.
- `NEXT_PUBLIC_ROLE_MODEL_V2=1|0`
  - Active la logique de rôles v2 (admin/joueur/visiteur) dans les flux qui la consomment.

## Recommandation rollout

1. Activer en staging (`=1`) et valider UX/permissions.
2. En prod, activer progressivement (MJ d'abord si possible).
3. En cas d'incident, repasser la flag concernée à `0`.

