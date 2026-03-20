# Pourquoi la carte peut être fluide en local et lente en prod (même « WebGL »)

Ce n’est pas une question d’opinion sur le rendu : il y a **des causes vérifiables** qui expliquent un écart **local vs prod** avec **le même code**.

## 0. Cas où la base est éliminée (même host + mêmes volumes)

Si `?mapdiag=1` montre :

- le **même** hôte Supabase, et  
- les **mêmes** chiffres (provinces, routes, pts chemin, etc.),

alors **ce n’est pas** « la prod a plus de données ». Il reste surtout :

| Local (`npm run dev`) | En ligne (Vercel) |
|----------------------|-------------------|
| `NODE_ENV=development` | `NODE_ENV=production` |
| bundle **développement** (Turbopack / dev) | bundle **optimisé** + React **production** |
| pas le même JS exécuté que sur le site | même logique que `npm run build && npm run start` |

`FORCE_SVG` **non défini** vs **`0`** : même comportement (le kill-switch n’est actif que si la valeur est **`1`**).

### Test décisif (à faire sur ta machine, même `.env.local` que la prod)

```bash
npm run build && npm run start
```

Puis ouvre `http://localhost:3000` (ou le port affiché) avec **`?mapdiag=1`** et teste la carte.

- **Si ça rame comme en ligne** → le problème est **reproductible sans Vercel** : c’est le **mode production** (bundle / React), pas « le cloud ».
- **Si ça reste fluide** comme en `next dev` → alors on cherche ailleurs (cache navigateur, autre onglet, extension, réseau au chargement, etc.).

## 1. Données Supabase différentes (cause fréquente quand mapdiag diffère)

Si le **host** ou les **volumes** diffèrent entre local et prod, le coût CPU côté navigateur change (même code).

### Vérification

1. Même page + **`?mapdiag=1`** en local et en prod.
2. Comparer **Supabase (host)** et **Volumes**.

## 2. `next dev` n’est pas une prod

Voir section **0** : `npm run dev:webgl:all` ne reproduit **pas** le binaire servi sur Vercel.

## 3. Cache / ancien déploiement

Hard reload (Ctrl+Shift+R), fenêtre privée, vérifier que le déploiement correspond bien à la branche attendue.

## 4. Ce que le badge « Renderer: webgl » ne dit pas

Une grande partie **géographique** (ex. `react-simple-maps` / SVG) peut rester coûteuse tant que le moteur WebGL ne remplace pas ces couches. Le flag **webgl** ne supprime pas à lui seul tout le coût DOM.

---

**En résumé** : si mapdiag est **identique** sauf `NODE_ENV`, la prochaine étape objective est **`npm run build && npm run start`** sur la même machine.
