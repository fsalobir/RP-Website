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

## Effets et règles de simulation (architecture centralisée)

- **Source unique des types d’effets** : `src/lib/countryEffects.ts`. Tous les `effect_kind` sont définis dans `ALL_EFFECT_KIND_IDS` et `EFFECT_KIND_META` (targetType, valueFormat, label). Sets dérivés : `EFFECT_KINDS_WITH_STAT_TARGET`, `EFFECT_KINDS_WITH_BUDGET_TARGET`, `EFFECT_KINDS_NO_TARGET`, `EFFECT_KINDS_WITH_BRANCH_TARGET`, `EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET`. Helper formulaires : `getEffectKindValueHelper(kind)` (valueLabel, valueStep, displayToStored, storedToDisplay) et `formatEffectValue(kind, value)`.
- **Résolution « effets pour un pays »** : une seule entrée, extensible par sources. `getEffectsForCountry(context)` agrège les effets de toutes les **sources enregistrées** (tableau `EFFECT_SOURCES` dans countryEffects.ts). Sources actuelles : (1) `country_effects` du pays, (2) effets du palier de mobilisation (`mobilisation_level_effects` + score), (3) `global_growth_effects` (rule_parameters). Pour ajouter un nouvel « endroit » (ex. traité, région, événement) : ajouter une source dans ce registry sans toucher aux consommateurs.
- **Où configurer les effets** : **Global** = admin Règles > « Global [Appliqué à tous les pays] » → stocké dans `rule_parameters.global_growth_effects` (tableau). **Par pays** = fiche pays > Généralités > effets actifs → table `country_effects`. **Par palier de mobilisation** = admin Règles > Mobilisation → `rule_parameters.mobilisation_level_effects` (effets par niveau). Un même type d’effet est pris en compte quel que soit l’endroit où le MJ l’ajoute.
- **Cron** (`run_daily_country_update`) : lit `global_growth_effects` pour croissance PIB/pop et `stat_delta` (CTE global_stat_effects) ; lit `country_effects` et effets mobilisation (niveau dérivé du score). Les effets budget_ministry_* et military_unit_* globaux ne sont pas encore appliqués dans le cron (uniquement côté app via la résolution).
- **App** : partout où on a besoin des « effets pour un pays » (contraintes budget, limites militaires, prévision), utiliser la liste **résolue** via `getEffectsForCountry` (pas seulement `country_effects`). Consommateurs : `getForcedMinPcts`, `getAllocationCapPercent`, `getUnitExtraEffectSum`, `getLimitModifierPercent`, `expectedNextTick`. La fiche pays reçoit `resolvedEffects` et les passe aux onglets Budget / Militaire / etc.
- **Ajouter un nouveau type d’effet** : l’ajouter dans `countryEffects.ts` (ALL_EFFECT_KIND_IDS, EFFECT_KIND_META, buildEffectKeys, parseEffectToForm, formatEffectValue, et si besoin un helper dédié). Il apparaît alors partout (dropdown Global, Mobilisation, formulaire effets actifs pays).

## Fichiers importants
- `src/lib/supabase/server.ts` et `client.ts` : clients Supabase.
- `src/lib/format.ts` : formatNumber, formatGdp (nombres et PIB).
- `src/lib/countryEffects.ts` : types d’effets (source unique), résolution getEffectsForCountry, helpers (getForcedMinPcts, getAllocationCapPercent, etc.).
- `src/app/(public)/` : pages publiques (accueil = table des pays avec PIB, société, variations ; fiche pays onglets Généralités / Militaire / Budget / Avantages ; règles).
- `src/app/admin/` : tableau de bord et CRUD (pays, règles avec section Global et Mobilisation, joueurs).
- `supabase/migrations/` : schéma, RLS, cron (044 global_growth_effects + global_stat_effects, 038 mobilisation).
