# Simulateur RPG Grande Échelle (Univers Fantasy) – Contexte pour l’agent

## AVERTISSEMENT CRITIQUE (CONTEXTE)
**Ce projet est un "Hard Fork" vers un univers Fantasy (hybride entre Crusader Kings et Donjons & Dragons).** Il est STRICTEMENT INTERDIT d'utiliser, de recréer ou de mentionner des concepts de géopolitique moderne (PIB, élections, missiles balistiques, ministères, ONU, technologie moderne). 

## Résumé
- **Projet :** Site web de jeu de rôle (RPG) à grande échelle / gestion de royaumes.
- **Stack :** Next.js (App Router), TypeScript, Tailwind, Supabase (DB + Auth + Storage). Les événements temporels (ticks, résolution) sont pilotés via Supabase (`pg_cron` / Edge Functions).
- **Langue :** Interface 100 % en français.
- **Design :** Thème Dark Fantasy / Médiéval. Fond sombre texturé (parchemin, pierre), accents or, pourpre ou fer, UI immersive, lisible mais thématisée "livre de règles / carte d'état-major médiéval".

## Architecture des Données (Entités de base)
Le modèle de données est hiérarchique et axé sur les personnages et le territoire :
- **Royaumes (`realms`)** : Entité politique de haut niveau (remplace les "pays"). C'est principalement une "coquille" qui agrège les données de ses territoires.
- **Provinces (`provinces`)** : Subdivisions d'un royaume. C'est ici que résident les vraies données (Population, Prospérité, Ressources, Défense locale). 
- **Points d'Intérêt / Bâtiments (`poi`)** : Rattachés aux provinces. Peuvent être du "fluff" narratif (ex: Ruines naines) créé par le MJ d'un coup de baguette magique, ou fournir des effets mécaniques.
- **Races (`races`)** : Configurables par le MJ, présentes dans les provinces, elles apportent des modificateurs spécifiques (via le moteur d'effets).
- **Personnages & Clans (`characters`, `clans`)** : PNJ ou PJ. Possèdent des attributs, de l'équipement, et des liens familiaux (arbres généalogiques/alliances). Les effets actifs peuvent s'appliquer directement sur eux.
- **Carte** : Stylisée, avec des frontières de provinces fixes (basées sur des régions de Supremacy), affichant les royaumes et les POI.

## Formatage des nombres
- **Toujours utiliser** les utilitaires de `src/lib/format.ts` pour l’affichage utilisateur.
- `formatNumber(value)` : séparateur de milliers = "." (ex. 32.000).
- *Note : L'ancien formatteur `formatGdp` a été supprimé. Remplacer par des formateurs de ressources fantasy si nécessaire (ex: `formatGold`).*

## Auth & Rôles
- Supabase Auth. 
- Les administrateurs sont désormais appelés **MJ (Maîtres du Jeu)**. Seuls les MJ peuvent modifier les données brutes, valider les requêtes de construction/actions des joueurs, et créer des POI/Races à la volée. 
- Middleware protège les routes `/mj` (anciennement `/admin`).

## Moteur d'Effets et Règles (Architecture Centralisée)
- **Source unique des effets** : Le moteur (adapté de l'ancien `countryEffects.ts`, désormais générique ex: `src/lib/effectsEngine.ts`) est le cœur mathématique du jeu.
- **Ciblage multiple** : Contrairement à l'ancien système, un effet (ex: `stat_delta`) peut désormais cibler une Province, un Royaume entier, ou un Personnage.
- **Agrégation ascendante** : `getEffectsForRealm()` (ou équivalent) doit agréger de manière dynamique les effets de base du Royaume + les effets des Races locales + les effets des POI construits dans ses Provinces.
- **Édition MJ** : Un MJ doit pouvoir attacher un "Effet" à peu près n'importe quoi (une épée magique donnée à un Personnage, une bénédiction sur une Province, une malédiction sur une Race). Le design de la table des effets doit être polymorphe ou très flexible (`target_type`, `target_id`).

## Fichiers importants
- `src/lib/supabase/server.ts` et `client.ts` : clients Supabase.
- `src/lib/format.ts` : utilitaires de formatage texte/nombres.
- `src/lib/effects/` (ou similaire) : Le cœur du moteur RPG, les définitions des modificateurs, la résolution des stats.
- `src/app/(public)/` : pages joueurs (accueil = Liste des Royaumes, `/royaume/[slug]` avec carte stylisée de ses provinces, fiches de Personnages).
- `src/app/mj/` : tableau de bord du Maître du Jeu (CRUD Royaumes, Provinces, validation des POI, gestion des événements).
- `supabase/migrations/` : Schéma de base de données reparti de zéro (Clean Slate) pour l'univers Fantasy.