# Pourquoi la carte peut être fluide en local et lente en prod (même « WebGL »)

Ce n’est pas une question d’opinion sur le rendu : il y a **des causes vérifiables** qui expliquent un écart **local vs prod** avec **le même code**.

## 1. Données Supabase différentes (cause la plus fréquente)

Le serveur Next charge **provinces, routes, points de passage, villes, etc.** depuis Supabase. Le coût CPU côté navigateur (projection, simplification, routes, culling) est **lié au volume** de ces tableaux.

- En **local**, `NEXT_PUBLIC_SUPABASE_URL` dans `.env.local` pointe souvent vers **un autre projet** ou une base **moins remplie** que la prod.
- En **prod**, Vercel utilise **les variables du projet** → souvent **la base « réelle »**.

**Même code, plus de lignes en base → plus de travail → même sensation de lag qu’avant.**

### Vérification

1. Ouvre la **même page** (ex. `/` ou `/mj/carte`) en local et en prod avec **`?mapdiag=1`** dans l’URL.
2. Compare la ligne **Supabase (host)** : si ce n’est **pas** le même hôte, tu compares **deux bases**.
3. Compare la ligne **Volumes** (provinces, routes, pts chemin, etc.). Si les nombres sont **très différents**, le lag « prod » est **attendu** avec le pipeline actuel (SVG / calculs lourds).

## 2. `next dev` n’est pas une prod

`npm run dev:webgl:all` lance **`next dev`** (mode développement React, bundler dev). La **prod** en ligne est **`next build` + `next start`** (ou serveur Vercel).

- Ce n’est **pas** le même binaire ni le même mode React.
- Pour reproduire la prod **sur ta machine** :  
  `npm run build && npm run start`  
  avec **les mêmes** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` que **Vercel**.

Si ça lague comme en prod, le problème n’est **pas** « Vercel » en soi, c’est **le build prod + les données**.

## 3. Cache / ancien déploiement

Un onglet peut garder un **ancien JS** (cache agressif, service worker rare). **Hard reload** (Ctrl+Shift+R) ou fenêtre privée.

## 4. Branche déployée

Si le déploiement automatique suit `main` et que tu travailles sur une autre branche, **la prod ne contient pas** les derniers changements.

## 5. Ce que le badge « Renderer: webgl » ne dit pas

Aujourd’hui, une grande partie **géographique** (ex. `react-simple-maps` / SVG) reste le même pipeline **que le rendu soit déclaré « webgl » ou non** tant que le moteur WebGL ne remplace pas ces couches. Donc **le « webgl »** ne garantit pas à lui seul une baisse de coût CPU : le **volume de données** et le **coût SVG** restent dominants.

---

**En résumé** : si le local est fluide et la prod laggée « comme avant », compare **d’abord** `?mapdiag=1` (host Supabase + volumes) et **ensuite** `npm run build && npm run start` avec les **mêmes** clés que la prod.
