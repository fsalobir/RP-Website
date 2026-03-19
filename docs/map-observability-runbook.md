# Runbook Observabilité Carte

## Signaux à surveiller

- `map_route_build_ms` (p95/p99)
- `map_interaction_frame_gap_ms` (p95/p99)
- taux d'erreur `saveMapDisplayConfig`
- taux d'échec benchmark CI `perf-map`

## Alertes

- Alerte critique si:
  - frame gap p95 > seuil profil courant
  - erreurs save config > 1%
  - benchmark CI échoue 2 runs consécutifs

## Procédure incident

1. Vérifier dernier commit touchant la carte.
2. Activer rollback renderer (`NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`) si concerné.
3. Vérifier artefacts précompute (`manifest.json`, fallback previous).
4. Relancer benchmark interaction.
5. Ouvrir postmortem avec métriques avant/après.

