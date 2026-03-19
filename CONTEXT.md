# Contexte de session – RPG Grande Échelle (Univers Fantasy)

> **⚠️ AVERTISSEMENT DE FORK (BRANCHE `fantasy`)**
> Ce projet a subi un *Hard Fork*. Toute l'ancienne logique de simulation géopolitique moderne (Pays, PIB, Missiles, Élections) a été supprimée. Nous construisons un RPG / Gestion de royaumes médiéval-fantastique.

Document de référence pour reprendre le projet ou une session. À mettre à jour après des changements importants de l'architecture.

---

## État actuel du projet (Clean Slate)

- **Stack :** Next.js (App Router) + Supabase (PostgreSQL, Auth, Storage). La base de données a été réinitialisée à zéro. Les passages de temps (ticks) seront pilotés par Supabase (`pg_cron` / Edge Functions).
- **UI :** 100 % en français. Thème « Dark Fantasy / Carte d'état-major médiéval » (fond sombre, textures parchemin/pierre, accents or, pourpre ou fer).
- **Médias :** Les blasons, icônes de POI et portraits de personnages utilisent le bucket Supabase Storage (ex: `heraldry`, `portraits`) ou des URL externes.

### Architecture cible (En cours de construction)

1. **Vue Joueur (Public)**
   - **Accueil :** Liste des Royaumes (`realms`) avec leurs statistiques agrégées.
   - **Fiche Royaume (`/royaume/[slug]`) :** Affiche une carte stylisée du royaume divisée en Provinces. 
   - **Fiche Province :** Détaille la population, la prospérité, les races présentes et les Points d'Intérêt (bâtiments/ruines).
   - **Personnages :** Vues pour les personnages (`characters`) et leurs arbres généalogiques/clans.

2. **Vue Maître du Jeu (Admin / `/mj`)**
   - Protection par middleware (réservé aux MJ).
   - Outils de « God Mode » : CRUD pour les Royaumes, Provinces, création de POI à la volée, attribution d'équipement ou d'effets magiques.

3. **Données & Moteur (Le Cœur du Jeu)**
   - **Moteur d'Effets Générique :** L'ancien système a été abstrait. Un effet peut désormais cibler une Province, un Royaume ou un Personnage. L'agrégation se fait de bas en haut (Provinces -> Royaume).
   - **Migrations :** Reparties de zéro (`0000_initial_fantasy_schema.sql` en attente).

4. **Formatage**
   - `src/lib/format.ts` : `formatNumber(value)` → séparateur "." (ex. 32.000). 
   - *Note : Les anciens formateurs comme `formatGdp` ont été supprimés. Utiliser des formats génériques ou liés aux ressources fantasy (Or, Bois, Magie).*

### Décisions / Conventions

- **Balises Image :** Pas de `next/image` obligatoire pour les blasons/portraits : `<img>` standard est toléré pour accepter facilement toute URL externe (générateurs d'avatars, hébergeurs d'images) en plus du Storage Supabase.
- **Hiérarchie stricte :** La donnée brute vit dans la `Province`. Le `Royaume` n'est qu'une enveloppe politique qui additionne les valeurs de ses provinces.
- **Extensibilité narrative :** Le MJ doit pouvoir ajouter du "fluff" (texte narratif) qui n'a pas forcément d'impact mécanique, ou lier ce fluff à des effets concrets du moteur.

### Fichiers clés (Nouveau Mapping)

| Rôle | Fichiers |
|------|----------|
| Clients Supabase | `src/lib/supabase/server.ts`, `client.ts` |
| Formatage | `src/lib/format.ts` |
| Moteur d'effets (RPG) | `src/lib/effectsEngine.ts` *(ou équivalent)* |
| Règles Cursor | `AGENTS.md` (ou `.cursorrules`) |

---

*Mettre à jour ce fichier après la validation du plan d'architecture (création des tables realms, provinces, characters, etc.) et l'avancée de l'interface.*