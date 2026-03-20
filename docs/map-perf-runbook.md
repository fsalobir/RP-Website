# Runbook performance carte (Nation / Province — déployé ≈ prod local)

## Objectif

Ressenti **fluide** au drag / zoom aux paliers **Nation** et **Province** sur **Vercel** et **mobile**, sans régression fonctionnelle (clic province, MJ, tooltips après relâchement).

## Comportement par défaut (code — sans rien poser sur Vercel)

**WebGL** : `NEXT_PUBLIC_MAP_RENDERER=webgl` (défaut dans le code) → carte via **DeckGL** (`MapDeckViewport` : une seule vue Mercator, pas de double chaîne SVG + `foreignObject`). **SVG** : `NEXT_PUBLIC_MAP_RENDERER=svg` ou `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` → `react-simple-maps` comme avant.

Les variables `NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE` / `NEXT_PUBLIC_MAP_WEBGL_PROVINCES` sont **legacy** (voir `featureFlags.ts`) ; l’adapter carte ne les utilise plus pour choisir le rendu principal.

## Variables d’environnement (optionnel — secours / debug)

| Variable | Rôle |
|----------|------|
| `NEXT_PUBLIC_MAP_RENDERER` | `webgl` (défaut) ou `svg`. |
| `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG` | `1` = rollback urgent tout SVG. |
| `NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE` | Legacy (tests / métriques). |
| `NEXT_PUBLIC_MAP_WEBGL_PROVINCES` | Legacy. |
| `NEXT_PUBLIC_MAP_DEBUG_FRAME_GAP` | `1` : métrique d’écart de frames (build de test). |
| `NEXT_PUBLIC_MAP_MOBILE_HARD_MODE` | `1` (défaut via code) : caps agressifs mobile. |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Injecté au build (Vercel) — visible dans `?mapdiag=1` comme **BUILD_COMMIT**. |

## Parité « même code »

1. `?mapdiag=1` : comparer **BUILD_COMMIT**, **MAP_RENDERER**, **MAP_ROLLOUT**, **Volumes**, **Supabase**.
2. Hard refresh / navigation privée si doute de cache.
3. Comparer un hash de chunk `/_next/static/chunks/...` si besoin.

## Smoke manuel (obligatoire après changement perf)

### Desktop

- [ ] `npm run prod:local` — Nation / Province, drag 10 s, molette : pas de gel long.
- [ ] WebGL effectif : provinces **visibles** (couche deck par défaut), pas de « trou noir ».
- [ ] Clic province (public) / sélection MJ **après** fin de drag.

### Mobile (appareil ou DevTools)

- [ ] Même scénario : au moins **nettement mieux** qu’avant ; continent + drag masque geo lourd si **mobile hard** actif.

## Profilage (Chrome Performance)

1. Enregistrer 5–10 s de drag + zoom Nation/Province.
2. Repérer **Long tasks**, **commitRoot**, **Paint** SVG vs GPU.
3. Comparer **prod:local** et **Vercel** sur la **même machine** si possible.

## Non-régression fonctionnelle

- [ ] MJ : menu contextuel région, sélection multi-région (Shift), création province.
- [ ] Public : panneau info après clic province.
- [ ] Tooltips régions : pas de spam pendant le drag ; OK après relâchement.

## Limites connues (WebGL provinces)

- Le canvas deck.gl est en **`pointer-events: none`** : l’interaction fine « clic sur province » repose encore sur le **SVG** quand les provinces SVG sont actives ; avec **spike** seul, le picking dédié deck peut être ajouté ultérieurement (voir `MapEngine` / roadmap).

## Scripts utiles

- `npm run benchmark:map:interaction:quick` — bench interaction (machine locale).
- `npm run prod:local:debug` — logs session carte si variables debug activées.
