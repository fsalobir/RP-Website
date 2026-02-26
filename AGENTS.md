# Simulateur de nations – Contexte pour l’agent

## Résumé
- **Projet :** Site web de simulation de conflit moderne (nations, règles, indicateurs dynamiques).
- **Stack :** Next.js (App Router), TypeScript, Tailwind, Supabase (DB + Auth + Storage + futur cron).
- **Langue :** Interface 100 % en français.
- **Design :** Tableau de bord type QG militaire : fond sombre, panneaux, accents verts, lisible et sobre.

## Données
- **Pays** : fiche avec 3 onglets (Généralités / Société / Macros ; Militaire ; Avantages). Champs éditables en admin ; population, PIB, croissance évoluent aussi via un cron. Drapeaux : upload Supabase Storage (bucket `flags`) ou URL en secours.
- **Historique** : table `country_history` (country_id, date, population, gdp, militarism, industry, science, stability) pour afficher les variations (vert/rouge) sur la liste des pays. Remplie par le cron.
- **Règles** : paramètres de simulation (table `rule_parameters`), modifiables en admin.
- **Extensibilité :** privilégier l’ajout de paramètres/règles via de nouvelles lignes ou clés (key-value) plutôt que de nouvelles colonnes.

## Formatage des nombres
- **Toujours utiliser** `formatNumber` et `formatGdp` de `src/lib/format.ts` pour l’affichage utilisateur.
- `formatNumber(value)` : séparateur de milliers = "." (ex. 32.000.000).
- `formatGdp(value)` : PIB en milliards de dollars avec " Bn" (ex. 1,2 Bn).

## Auth
- Supabase Auth. Liste des admins dans `public.admins` (user_id). Seuls les admins peuvent modifier les données ; lecture publique pour pays et règles. Middleware protège `/admin` sauf `/admin/connexion` et `/admin/inscription`.

## Fichiers importants
- `src/lib/supabase/server.ts` et `client.ts` : clients Supabase.
- `src/lib/format.ts` : formatNumber, formatGdp (nombres et PIB).
- `src/app/(public)/` : pages publiques (accueil = table des pays avec PIB, société, variations ; fiche pays 3 onglets ; règles).
- `src/app/admin/` : tableau de bord et CRUD (pays avec upload drapeau, règles).
- `supabase/migrations/` : 001 schéma initial, 002 storage flags (politiques), 003 country_history.
