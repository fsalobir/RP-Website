# Profilage performance carte (`prod:local`)

## Prérequis

Lancer **`npm run prod:local`** (pas `npm run dev`). Ouvrir la page carte sur le navigateur cible.

## Chrome — onglet Performance

1. Ouvrir les **Outils de développement** (F12) → onglet **Performances** (Performance).
2. Cliquer **Enregistrer** (ou Ctrl+E), puis **déplacer** et **zoomer** la carte pendant 5–10 s.
3. Arrêter l’enregistrement.

## Ce qu’il faut repérer

- **Longues tâches** (barres grises « Long task ») pendant le drag : indiquent un thread principal saturé.
- **Script** : fonctions liées à React (`commitRoot`, `flushSync`), ou au code applicatif (`commitView`, `setState`, rendu SVG).
- **Rendu** (Rendering, Paint) : coût du compositeur / peinture SVG.

## Corrélation avec le code

- Le chemin **`commitView` → `setMapView`** dans `WorldMapClient.tsx` déclenche un re-render large à chaque mouvement : c’est un suspect prioritaire si les long tasks coïncident avec le pan.
- Mitigations en place : `startTransition` pendant l’interaction, masquage `visibility` des calques lourds (nation/province) au drag, commit **synchrone** final sur `onMoveEnd`, throttle ~30 fps sur l’animation zoom inertielle (`ZOOM_ANIM_COMMIT_MIN_MS`).

## Métrique frame gap (optionnel)

Définir **`NEXT_PUBLIC_MAP_DEBUG_FRAME_GAP=1`** au build de test : le gouverneur de qualité enregistre les écarts de frame (voir code `ENABLE_FRAME_GAP_METRIC` dans `WorldMapClient.tsx`). SLO : pas de régression nette vs baseline locale après changement.

## A/B test coût SVG (Preview)

Comparatif A/B : le spike est **désactivé par défaut** ; pour mesurer le chemin « zéro SVG », utiliser **`NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE=1`** (+ `WEBGL_PROVINCES=1` si besoin) sur un build de test. Valider visuellement qu’aucune régression n’apparaît.
