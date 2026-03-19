# Feature flags carte v2

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

