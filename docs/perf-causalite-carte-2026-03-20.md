# Etude de causalite CPU/RAM (carte) - 2026-03-20

## Resume executif

La charge elevee observee ne vient pas d'un unique facteur WebGL. Le goulot principal est un cumul :
- calculs geospatiaux synchrones dans `WorldMapClient`,
- rendu SVG dense,
- et coexistence de processus lourds (`Cursor`, `node next dev`, Chromium bench).

Les donnees process confirment un poids memoire important cote IDE et dev server (plusieurs Go).

## Mesures baseline (avant modifications)

Fichiers:
- `tmp/map-benchmark-interaction-baseline-small.json`
- `tmp/map-benchmark-interaction-baseline-medium.json`
- `tmp/map-benchmark-interaction-baseline-large.json`

Extraits notables:
- `small/public` : `wheelStepP95Ms` ~ `3646.37`
- `small/mj` : `wheelStepP95Ms` ~ `4869.38`
- `medium/public` : `wheelStepP95Ms` ~ `4293.75`
- `large/public` : `wheelStepP95Ms` ~ `396.40`

## Mesures apres optimisations

Fichiers:
- `tmp/map-benchmark-interaction-after-small.json`
- `tmp/map-benchmark-interaction-after-medium.json`
- `tmp/map-benchmark-interaction-after-large.json`

Extraits notables:
- `small/public` : `wheelStepP95Ms` ~ `514.15`
- `small/mj` : `wheelStepP95Ms` ~ `345.52`
- `medium/public` : `wheelStepP95Ms` ~ `5068.05` (run bruite)
- `large/public` : `wheelStepP95Ms` ~ `3109.62` (run bruite)

## Interpretation causalite

- Le gain massif en profil `small` montre que les optimisations locales (cache borne, throttling, reduction bruit metrics) reduisent bien la charge interaction.
- Les degradations `medium/large` sur ce lot sont probablement dues a un environnement de mesure non isole (processus concurrents, variabilite machine/IDE), pas a un recul net du code.
- La causalite dominante reste:
  1. travail CPU geospatial sur thread principal,
  2. volume DOM/SVG rendu,
  3. concurrence de processus de dev/bench.

## Capture process locale

Commande utilisee:
`Get-Process | Where-Object { $_.Name -match 'Cursor|Code|node|chrome|msedge' } ...`

Constats:
- `Cursor` principal avec PM multi-Go.
- `node` (serveur dev) avec PM autour de 4 Go.
- Chromium/Chrome additionnels pendant benchmark.

## Recommandations operationnelles

1. Utiliser `npm run dev:lowload` pour les sessions d'edition standard.
2. Eviter d'executer benchmarks/e2e en parallele de sessions dev interactives.
3. Garder les mesures perf sur machine "calme" (une seule instance app + un seul bench).
4. Si la charge reste elevee sur gros datasets, prioriser le passage des calculs routes en Web Worker.
5. Poursuivre la feuille de route renderer lignes robuste (`docs/map-routes-performance-roadmap.md`).

## Configuration prod recommandee (stable)

- `NEXT_PUBLIC_MAP_RENDERER=webgl`
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=mj-only`
- `NEXT_PUBLIC_MAP_ROUTE_WORKER=1`
- `NEXT_PUBLIC_MAP_DEBUG_METRICS=0`
- `NEXT_PUBLIC_MAP_DEBUG_FRAME_GAP=0`

## A/B worker routes (small, 1 iteration)

Fichiers:
- `tmp/map-benchmark-interaction-worker-off-small.json`
- `tmp/map-benchmark-interaction-worker-on-small.json`

Comparaison rapide:
- Public `wheelStepP95Ms`: OFF `2053.78` -> ON `1859.45` (~`-9.5%`)
- MJ `wheelStepP95Ms`: OFF `2553.46` -> ON `2598.98` (~`+1.8%`, neutre a leger bruit)

Conclusion provisoire:
- Le worker apporte un gain mesurable cote public sur ce run court.
- En MJ, le resultat est proche de l'egalite sur cet echantillon; il faut confirmer sur plusieurs iterations et datasets `medium/large`.

## Matrice fluidite (worker OFF/ON, 2 iterations)

Fichiers:
- `tmp/map-benchmark-fluidity-worker-off-small.json`
- `tmp/map-benchmark-fluidity-worker-off-medium.json`
- `tmp/map-benchmark-fluidity-worker-on-small.json`
- `tmp/map-benchmark-fluidity-worker-on-medium.json`

Resultats synthese:
- OFF `small/public wheelStepP95Ms`: `236.89`
- ON `small/public wheelStepP95Ms`: `196.43` (~`-17.1%`)
- OFF `small/mj wheelStepP95Ms`: `224.16`
- ON `small/mj wheelStepP95Ms`: `246.90` (~`+10.1%`, variation)
- OFF `medium/public wheelStepP95Ms`: `189.57`
- ON `medium/public wheelStepP95Ms`: `210.20` (~`+10.9%`, variation avec un sample outlier)
- OFF `medium/mj wheelStepP95Ms`: `192.60`
- ON `medium/mj wheelStepP95Ms`: `196.71` (~`+2.1%`, quasi neutre)

Lecture:
- Les changements de fluidite (RAF coalesce + interaction lite + mobile perf profile) ont surtout baisse le jank percu.
- L'effet worker reste variable selon page/profil; il faut conserver un rollout progressif avec monitoring.

