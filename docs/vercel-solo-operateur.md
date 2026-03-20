# Vercel — guide solo (sans CLI)

Tu n’es pas obligé d’utiliser la CLI. Tout se gère dans l’interface Vercel.

## 1. Ouvrir les variables d’environnement

1. Va sur [vercel.com](https://vercel.com) → ton projet → **Settings** → **Environment Variables**.

2. Pour **Production** (et **Preview** si tu utilises des previews), vérifie les clés qui commencent par `NEXT_PUBLIC_MAP_`.

## 2. Alignement recommandé (carte stable, pas de canary implicite)

- **`NEXT_PUBLIC_MAP_RENDERER_ROLLOUT`** : mets explicitement **`all`** (ou supprime la variable pour retomber sur le défaut du code, qui est `all` après normalisation des chaînes vides).
- **Ne mets pas** `public-canary` en prod si tu ne veux pas de déploiement progressif côté public.
- Supprime toute entrée **`NEXT_PUBLIC_MAP_*` avec valeur vide** (une ligne vide peut créer des surprises ; le code normalise maintenant, mais le dashboard propre évite le doute).

## 3. Après modification

Redéploie le projet (**Deployments** → **Redeploy** sur le dernier build, ou un push Git) pour que le **build** reprenne les bonnes `NEXT_PUBLIC_*`.

## 4. Vérification sans compétence technique

Sur le site déployé, ouvre la carte avec **`?mapdiag=1`** : les lignes **MAP_RENDERER** et **MAP_ROLLOUT** doivent correspondre à ce que tu veux (ex. rollout affiché = `all`).

## 5. Si la prod rame mais `npm run prod:local` non

Compare **`?mapdiag=1`** sur `localhost` (après `npm run prod:local`) et sur l’URL Vercel : si les valeurs diffèrent, le build Vercel n’a pas les mêmes variables que ton build local. Corrige les variables puis redeploie.

---

**Engagement produit :** le déploiement « canary » public (`public-canary`) est une **option** dans le code pour les MJ qui la choisissent explicitement — ce n’est pas le défaut. Si tu veux la désactiver complètement dans le code, ouvre une demande de changement dédiée (suppression ou garde-fou build).
