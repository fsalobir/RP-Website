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

## 4. Vérification

Après déploiement, les valeurs **`NEXT_PUBLIC_MAP_RENDERER`** et **`NEXT_PUBLIC_MAP_RENDERER_ROLLOUT`** sont figées **au build**. Vérifie qu’elles correspondent à ce que tu veux dans **Settings → Environment Variables**, puis que le dernier déploiement a bien été fait **après** ces changements.

## 5. Si la prod rame mais `npm run prod:local` non

Compare les variables `NEXT_PUBLIC_MAP_*` entre ton **`.env.local`** (pour `prod:local`) et **Vercel** : si elles diffèrent, le bundle déployé n’est pas le même. Corrige puis redeploie.

---

**Engagement produit :** le déploiement « canary » public (`public-canary`) est une **option** dans le code pour les MJ qui la choisissent explicitement — ce n’est pas le défaut. Si tu veux la désactiver complètement dans le code, ouvre une demande de changement dédiée (suppression ou garde-fou build).
