# Variables `NEXT_PUBLIC_*` carte et Vercel

## Défaut dans le code

Le comportement **normal** (WebGL demandé + rollout `all`) est défini dans `src/lib/mapRenderer.ts` (`getRequestedMapRenderer`, `getMapRendererRolloutStage`). **Aucune variable Vercel n’est requise** pour ça : le bundle embarque ces défauts si les env sont absentes.

Les variables `NEXT_PUBLIC_MAP_*` restent utiles pour **surcharger** au build (rollback, canary, expérimentation) sans changer le code.

## Règle critique

Les variables `NEXT_PUBLIC_*` sont **injectées au moment du `next build`**, pas au runtime dans le navigateur. Le bundle client contient des **littéraux** (ex. `"webgl"` ou `"svg"`).

Conséquences :

1. **Changer une variable dans le dashboard Vercel ne suffit pas** : il faut **un nouveau déploiement** (rebuild) pour que le JS servi aux utilisateurs change.
2. Si le build a été fait **sans** `NEXT_PUBLIC_MAP_RENDERER=webgl`, la prod se comporte comme le **défaut SVG**, même si vous ajoutez la variable après coup sans redéployer.
3. Le cache de build Vercel peut parfois masquer un problème : en cas de doute, **Redeploy** avec **sans cache** (ou `vercel deploy --prod --force` sans `--with-cache`).

## Équivalence `npm run dev:webgl:all`

Le script local ne définit que :

- `NEXT_PUBLIC_MAP_RENDERER=webgl`
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=all`

Pour coller à ce comportement en prod, alignez au minimum ces deux-là. Le **spike** et la **couche WebGL provinces** sont **opt-in** au build (`=1`) — la carte « normale » reste en **SVG** sans variable supplémentaire.

## Vérification

1. Ouvrir les **logs de build** du dernier déploiement Production sur Vercel : une ligne `[map.build]` doit afficher les valeurs vues par le build.
2. Après toute modification des `NEXT_PUBLIC_MAP_*`, lancer un **nouveau déploiement** de la branche de prod.

## Preview (branches Git)

Sur Vercel, les variables d’environnement **Preview** peuvent être **par branche**. La CLI demande parfois une branche précise ; si les déploiements preview de ta branche (ex. `fantasy`) n’ont pas les `NEXT_PUBLIC_MAP_*`, ajoute-les dans le dashboard pour **Preview** + cette branche, ou :  
`vercel env add NEXT_PUBLIC_MAP_RENDERER preview <nom-de-branche> --value webgl --yes --force` (idem pour les autres clés).
