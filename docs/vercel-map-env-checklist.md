# Audit Vercel — variables carte (`NEXT_PUBLIC_*`)

## Pourquoi

Les variables `NEXT_PUBLIC_*` sont **figées au build**. Preview et Production peuvent avoir des valeurs différentes. Une entrée **vide** dans le dashboard Vercel reste une chaîne `""` côté Node : le code traite désormais `""` comme « non défini » (voir `src/lib/mapRenderer.ts`), mais l’audit manuel évite les surprises.

## Checklist (Preview + Production)

1. Ouvrir **Vercel → Project → Settings → Environment Variables**.
2. Filtrer ou rechercher `NEXT_PUBLIC_MAP_`.
3. Pour chaque environnement ciblé (**Preview**, **Production**) :
   - **Supprimer** les clés avec valeur vide, ou les remplir explicitement.
   - Vérifier les valeurs attendues :

| Variable | Comportement si absent | Risque si mal réglé |
|----------|-------------------------|---------------------|
| `NEXT_PUBLIC_MAP_RENDERER` | `webgl` | `svg` force tout le rendu vectoriel lourd |
| `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT` | `all` | **Diagnostic uniquement** — le renderer effectif est WebGL pour tous si `MAP_RENDERER=webgl` (voir `mapRenderer.ts`). |
| `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG` | désactivé | `1` = kill-switch SVG partout |
| `NEXT_PUBLIC_MAP_RENDERER_CANARY_PCT` | `5` | % canary si `rollout=public-canary` |
| `NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE` | désactivé | `1` = test perf (coupe SVG ; coupler avec deck provinces aligné). **Défaut : off** — évite carte « océan seul » si WebGL non aligné. |
| `NEXT_PUBLIC_MAP_WEBGL_PROVINCES` | désactivé | `1` = active deck.gl provinces. **Défaut : off** — opt-in après QA projection. |
| `NEXT_PUBLIC_MAP_QUALITY_TIER` | `perf` | `rich` augmente la charge |
| `NEXT_PUBLIC_MAP_MOBILE_HARD_MODE` | activé (`!== "0"`) | `0` désactive le mode « dur » mobile |

4. **Build** : ouvrir le log du dernier déploiement et chercher la ligne **`[map.build]`** (émise par `next.config.ts`). Elle résume les valeurs vues au build.

## Déploiement partiel

Vercel sert un build **cohérent** par déploiement. En revanche **Preview ≠ Production** (branche, env) : toujours comparer la même cible (ex. preview de `fantasy` vs prod) pour le debug.
