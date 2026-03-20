# Pourquoi la carte peut être fluide en local et lente en prod (même « WebGL »)

Ce n’est pas une question d’opinion sur le rendu : il y a **des causes vérifiables** qui expliquent un écart **local vs prod** avec **le même code**.

## 0. Cas où la base est éliminée (même host + mêmes données)

Si **la même** URL Supabase (`.env.local` / variables Vercel) et **les mêmes** volumes en base sont utilisés pour le test,

alors **ce n'est pas** « la prod a plus de données ». Il reste surtout :

| Local (`npm run dev`) | En ligne (Vercel) |
|----------------------|-------------------|
| `NODE_ENV=development` | `NODE_ENV=production` |
| bundle **développement** (Turbopack / dev) | bundle **optimisé** + React **production** |
| pas le même JS exécuté que sur le site | même logique que `npm run prod:local` (build + start) |

`FORCE_SVG` **non défini** vs **`0`** : même comportement (le kill-switch n’est actif que si la valeur est **`1`**).

### Test décisif (à faire sur ta machine, même `.env.local` que la prod)

```bash
npm run prod:local
```

(Sous PowerShell, évite `npm run build && npm run start` : `&&` n’est pas toujours accepté — ce script npm est équivalent.)

Puis ouvre la carte sur `http://localhost:3000` (ou le port affiché) et teste le ressenti.

- **Si ça rame comme en ligne** → le problème est **reproductible sans Vercel** : c’est le **mode production** (bundle / React), pas « le cloud ».
- **Si ça reste fluide** comme en `next dev` → alors on cherche ailleurs (cache navigateur, autre onglet, extension, réseau au chargement, etc.).

Pour comparer le **renderer** et le **rollout** effectivement pris au build : logs au moment du build (`[map.build] …` dans la console) et variables `NEXT_PUBLIC_MAP_*` côté Vercel **Settings → Environment Variables**.

## 1. Données Supabase différentes (cause fréquente)

Si le **host** ou les **volumes** diffèrent entre local et prod, le coût CPU côté navigateur change (même code).

### Vérification

1. Comparer `NEXT_PUBLIC_SUPABASE_URL` (local vs Vercel).
2. Comparer les volumes (provinces, routes, points de chemin) en base ou via l’UI / outils admin.

## 2. `next dev` n’est pas une prod

Voir section **0** : `npm run dev:webgl:all` ne reproduit **pas** le binaire servi sur Vercel.

## 3. Cache / ancien déploiement

Hard reload (Ctrl+Shift+R), fenêtre privée, vérifier que le déploiement correspond bien à la branche attendue.

## 4. Ce que le badge « Renderer: webgl » ne dit pas

Une grande partie **géographique** (ex. `react-simple-maps` / SVG) peut rester coûteuse tant que le moteur WebGL ne remplace pas ces couches. Le flag **webgl** ne supprime pas à lui seul tout le coût DOM.

---

**En résumé** : si Supabase et données sont alignés, la prochaine étape objective est **`npm run prod:local`** sur la même machine.
