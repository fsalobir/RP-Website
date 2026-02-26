# Contexte de session – Simulateur de nations

Document de référence pour reprendre le projet ou une session. À mettre à jour après des changements importants.

---

## État actuel du projet (dernière mise à jour)

- **Next.js** (App Router) + **Supabase** (PostgreSQL, Auth, Storage). Pas de cron encore ; prévu pg_cron ou Edge Function.
- **UI** : 100 % en français. Thème « QG militaire » (fond sombre, panneaux, accent vert). Drapeaux : upload dans le bucket Storage `flags` ou URL.

### Ce qui est en place

1. **Public**
   - Accueil : **table** des pays (Pays, Régime, Population, PIB, Militarisme, Industrie, Science, Stabilité). PIB affiché en « X Bn ». Variations (vert/rouge) affichées entre parenthèses quand des lignes existent dans `country_history`.
   - Fiche pays : 3 onglets (Généralités/Société/Macros, Militaire, Avantages). Nombres formatés avec `formatNumber` / `formatGdp`.
   - Page Règles : lecture seule des `rule_parameters`.

2. **Admin**
   - Connexion / Inscription. Protection par middleware + table `admins`.
   - CRUD pays (formulaire 3 blocs) avec **upload de drapeau** (Storage `flags`) ou champ URL.
   - CRUD rule_parameters (édition valeur par ligne).

3. **Données**
   - `countries`, `country_macros`, `rule_parameters`, `military_unit_types`, `country_military_limits`, `perks`, `country_perks`, `admins`, **`country_history`**.
   - Migrations : `001_initial_schema.sql`, `002_storage_flags_bucket.sql` (politiques uniquement ; créer le bucket « flags » à la main), `003_country_history.sql`.

4. **Formatage**
   - `src/lib/format.ts` : `formatNumber(value)` → séparateur "." (ex. 32.000.000) ; `formatGdp(value)` → "1,2 Bn". À utiliser partout pour l’affichage des nombres et du PIB.

### Décisions / conventions

- Pas de `next/image` pour les drapeaux : `<img>` utilisé pour accepter toute URL (dont externes et Storage).
- Variations sur la liste : comparaison `countries` (actuel) vs dernière ligne `country_history` (précédent). Vert si hausse, rouge si baisse. Sans historique, pas de parenthèses.
- Cron à faire : lire `rule_parameters`, mettre à jour `countries`, et **écrire un snapshot dans `country_history`** pour que les variations s’affichent.

### Fichiers clés

| Rôle | Fichiers |
|------|----------|
| Clients Supabase | `src/lib/supabase/server.ts`, `client.ts` |
| Formatage | `src/lib/format.ts` |
| Liste pays (table + variations) | `src/app/(public)/page.tsx` |
| Fiche pays 3 onglets | `src/app/(public)/pays/[slug]/page.tsx`, `CountryTabs.tsx` |
| Formulaire pays (upload drapeau) | `src/components/admin/CountryForm.tsx` |
| Règles Cursor | `.cursor/rules/nation-simulator.mdc` |
| Résumé agent | `AGENTS.md` |

---

Mettre à jour ce fichier après des évolutions majeures (nouvelles tables, nouvelles pages, changements de convention).
