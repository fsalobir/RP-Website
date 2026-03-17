# PLAN_SCENARIOS_TEST.md

Document de conception des scénarios de tests **mathématiques et logiques** du moteur de jeu.

- **But** : valider les calculs (et leurs cas limites) avant d’implémenter/compléter les tests (Vitest/Playwright).
- **Sources** (logique métier) :
  - Tick & budget : `src/lib/expectedNextTick.ts`, `src/lib/tickBreakdown.ts`, `src/lib/ruleParameters.ts`
  - Effets (types + empilement + sources) : `src/lib/countryEffects.ts`
  - Influence : `src/lib/influence.ts`, Hard Power : `src/lib/hardPower.ts`
  - Idéologie (hexagone) : `src/lib/ideology.ts`
  - Dés & actions d’État : `src/lib/stateActionDice.ts`, `src/lib/stateActionConsequences.ts`
  - Avantages : `src/lib/perkRequirements.ts`

---

## Conventions numériques (à respecter dans les tests)

- **Tick** : une application de `getExpectedNextTick(...)` (prévision) ou du cron côté DB (mêmes formules visées).
- **Arrondis** :
  - **Population** : `Math.round(...)` (arrondi à l’entier) puis clamp \(\ge 0\).
  - **PIB** (prévision front) : pas d’arrondi imposé dans TS (valeur flottante), mais clamp \(\ge 0\).
  - **Stats société** (militarism/industry/science/stability) : arrondi à **2 décimales** via `Math.round(x*100)/100`, puis clamp (0..10 ou -3..3).
  - **Jets** : `roll = floor(rand*100)+1` ; `total = clamp(1,100, roll+modifier)`.
  - **Relations / impact** : `Math.round(...)` puis clamp.
- **Normalisation “effets croissance”** :
  - Dans `expectedNextTick.ts` et `tickBreakdown.ts` : une valeur d’effet de croissance `value` est normalisée par :
    - si `abs(value) > 1` alors on traite comme “%” et on fait `value/100`
    - sinon on traite comme “décimal” (ex. 0.02 = +2%).
- **Gravité** :
  - facteur brut : `1 + (gravityPct/100) * ratio`, avec
    - `ratio = (worldAvg - countryVal)/worldAvg`
    - si contribution < 0 on inverse le signe (voir scénarios)
  - puis clamp facteur : **[0.1 ; 2]**.
- **Durées d’effets** :
  - “Actif” si `duration_kind === "permanent"` **ou** `duration_remaining > 0` (selon fonctions).
- **Empilement d’effets** (résumé) :
  - `budget_ministry_min_pct` : **max** par ministère ; clamp valeur \(\ge 0\)
  - `budget_allocation_cap` : **somme**
  - `military_unit_extra` & `*_limit_modifier*` : **somme** (en ignorant les expirés)
  - `influence_modifier_*` : **produit** des multiplicateurs actifs.

---

## 1) Mécanique : Croissance globale (`global_growth_effects`)

### Scénario 1.1 — Croissance globale (base uniquement)
- **Source** : `expectedNextTick.ts/getGlobalGrowthRates()`
- **État initial**
  - Pays : `population=1_000`, `gdp=100`
  - Stats : `mil=0`, `ind=0`, `sci=0`, `stab=0`
  - Règle `global_growth_effects` :
    - `population_growth_base = 0.10` (décimal = +10%)
    - `gdp_growth_base = 0.20` (décimal = +20%)
- **Modificateurs appliqués** : aucun autre effet/budget
- **Résultat attendu**
  - \(pop\_total\_rate = 0.10\)
  - \(gdp\_total\_rate = 0.20\)
  - \(population\_next = round(1000 + 1000\times0.10) = round(1100)=1100\)
  - \(gdp\_next = 100 + 100\times0.20 = 120\)
- **Cas limites**
  - Valeur base en “%” (ex. `10`) : doit être traitée comme \(10/100=0.10\) **uniquement** si elle passe par `growthValue`/normalisation (ici, `getGlobalGrowthRates` ne normalise pas : valeur = telle quelle). Donc un test doit aussi vérifier que **global_growth_effects attend du décimal** (conception).

### Scénario 1.2 — Croissance globale “par stat” (stability négative)
- **Source** : `expectedNextTick.ts/getGlobalGrowthRates()`
- **État initial**
  - Stats : `stability=-2`, autres à 0
  - `global_growth_effects` :
    - `gdp_growth_per_stat` ciblant `stability` avec `value=0.01`
- **Modificateurs appliqués** : aucun
- **Résultat attendu**
  - \(gdp\_from\_stats = 0.01 \times (-2) = -0.02\)
  - Donc \(gdp\_total\_rate=-0.02\)
  - Si `gdp=100` : \(gdp\_next = 100 + 100\times(-0.02)=98\)
- **Cas limites**
  - `effect_target` inconnu → `statVal=0` donc contribution nulle.
  - Stability hors borne (si jamais une donnée DB incohérente arrive) : ici pas clamp côté `getGlobalGrowthRates`, donc le test doit figer le comportement actuel.

### Scénario 1.3 — Somme multi-effets base + per_stat
- **Source** : `expectedNextTick.ts/getGlobalGrowthRates()`
- **État initial**
  - Stats : `industry=6`
  - `global_growth_effects` :
    - `gdp_growth_base = 0.01`
    - `gdp_growth_per_stat(target=industry) = 0.002`
- **Résultat attendu**
  - \(gdp\_global\_rate = 0.01 + 0.002\times6 = 0.01 + 0.012 = 0.022\)
  - Si `gdp=1_000` : \(gdp\_next = 1000\times(1+0.022)=1022\)
- **Cas limites**
  - Ordre des éléments dans l’array : ne doit pas changer le résultat.

---

## 2) Mécanique : Effets (résolution, durée, empilement)

### Scénario 2.1 — `getEffectsForCountry` agrège toutes les sources (country+law+global+perk+ai+ideology)
- **Source** : `countryEffects.ts/getEffectsForCountry()`, `EFFECT_SOURCES`
- **État initial**
  - `countryEffects` : 1 effet `stat_delta(militarism,+1)`
  - `lawLevelEffects` : 1 effet `gdp_growth_base(+0.01)`
  - `globalGrowthEffects` : 1 effet `population_growth_base(+0.02)`
  - `perkEffects` : 1 effet `budget_allocation_cap(+10)`
  - `ai_status="major"` et `aiMajorEffects` : 1 effet `influence_modifier_global(1.1)`
  - `ideologyScores` + `ideologyEffectsConfig` : 1 entrée qui produit un effet non nul
- **Modificateurs appliqués** : n/a (test de liste)
- **Résultat attendu**
  - La liste contient **6 effets** (1 par source), avec `source/sourceLabel` cohérents.
- **Cas limites**
  - `ai_status` null → aucun effet IA.
  - `ideologyScores` absent → aucun effet idéologie.

### Scénario 2.2 — TickRates exclut les effets globaux pour éviter le double comptage
- **Source** : `countryEffects.ts/getEffectsForCountryTickRates()`
- **État initial**
  - `globalGrowthEffects` contient `gdp_growth_base(+0.05)`
  - `countryEffects` contient `gdp_growth_base(+0.10)`
- **Modificateurs appliqués** : n/a
- **Résultat attendu**
  - `getEffectsForCountryTickRates` **inclut** l’effet country (+0.10) mais **exclut** `globalGrowthEffects`.
- **Cas limites**
  - Le breakdown (`tickBreakdown.ts`) ajoute séparément les contributions globales via `context.globalGrowthEffects`.

### Scénario 2.3 — Expiration : effet ignoré si `duration_remaining<=0` et non permanent
- **Source** : `expectedNextTick.ts` (boucle `effects`), `countryEffects.ts/isEffectActiveByDuration`
- **État initial**
  - Effet A : `gdp_growth_base(value=0.5, duration_kind="days", duration_remaining=0)` (inactif)
  - Effet B : `gdp_growth_base(value=0.1, duration_kind="permanent", duration_remaining=0)` (actif)
- **Résultat attendu** (avec `gdp=100`)
  - Seul B compte → \(gdp\_next = 110\)
- **Cas limites**
  - `duration_remaining` absent : dans `expectedNextTick.ts`, l’effet est considéré actif (car la garde ne s’applique que si `duration_remaining != null`).

### Scénario 2.4 — `budget_ministry_min_pct` : max par ministère, clamp \(\ge 0\)
- **Source** : `countryEffects.ts/getForcedMinPcts()`
- **État initial**
  - Effets : education=10 puis education=15 ; defense=-5
- **Résultat attendu**
  - `pct_education = 15`
  - `pct_defense = 0`
- **Cas limites**
  - `effect_target` null → ignoré.

### Scénario 2.5 — `budget_allocation_cap` : somme
- **Source** : `countryEffects.ts/getAllocationCapPercent()`
- **État initial**
  - Effets : `+10`, `-25`
- **Résultat attendu**
  - \(100 + 10 - 25 = 85\)

### Scénario 2.6 — Limites militaires : somme des modificateurs, clé sous-type `branch:sub_type`
- **Source** : `countryEffects.ts/getSubTypeLimitModifierPercent()`
- **État initial**
  - Effets actifs sur `terre:infanterie` : `+10` et `-2` (permanent)
- **Résultat attendu**
  - \(10 + (-2) = 8\)
- **Cas limites**
  - `subType=null` ⇒ clé `branch:` (suffixe vide) : prévoir scénario dédié.

### Scénario 2.7 — Influence : produit des multiplicateurs et ignore inactifs
- **Source** : `countryEffects.ts/getInfluenceModifiersFromEffects()`
- **État initial**
  - `influence_modifier_global`: 1.10 (actif)
  - `influence_modifier_gdp`: 1.20 (actif)
  - `influence_modifier_gdp`: 2.00 (expiré)
- **Résultat attendu**
  - `global=1.1`, `gdp=1.2`, autres = 1

---

## 3) Mécanique : Budget ministères (bonus/malus) + gravité

### Scénario 3.1 — Bonus si `pct >= min_pct`
- **Source** : `expectedNextTick.ts/ministryContribution()`
- **État initial**
  - `pct = 20`, `min_pct=5`, `bonus=0.10`, `malus=-0.05`
- **Résultat attendu**
  - contribution = \((20/100)\times0.10 = 0.02\)
- **Cas limites**
  - `pct=5` exactement → bonus (>=).

### Scénario 3.2 — Malus proportionnel si `pct < min_pct`
- **Source** : `expectedNextTick.ts/ministryContribution()`
- **État initial**
  - `pct=0`, `min_pct=5`, `malus=-0.05`
- **Résultat attendu**
  - scale = \((5-0)/5 = 1\)
  - contribution = \(1\times(-0.05)=-0.05\)

### Scénario 3.3 — Cas limite : `min_pct=0`
- **Source** : `expectedNextTick.ts/ministryContribution()`
- **État initial**
  - `pct=0`, `min_pct=0`, `malus=-0.05`
- **Résultat attendu**
  - scale = 0 (division évitée) → contribution = 0

### Scénario 3.4 — Gravité (bonus) : pays au-dessus de la moyenne diminue la contribution (facteur < 1)
- **Source** : `expectedNextTick.ts/gravityFactorForContribution()`
- **État initial**
  - `worldAvg=100`, `countryVal=120`, `gravityPct=50`, `contribution=+0.02`
- **Résultat attendu**
  - ratio = \((100-120)/100 = -0.2\)
  - k = 0.5
  - facteur = \(1 + 0.5\times(-0.2) = 0.9\) (clamp ok)
  - contribution finale = \(0.02\times0.9=0.018\)
- **Cas limites**
  - `worldAvg=0` ⇒ facteur=1.

### Scénario 3.5 — Gravité (malus) : pays au-dessus de la moyenne aggrave le malus (facteur > 1)
- **Source** : `expectedNextTick.ts/gravityFactorForContribution()`
- **État initial**
  - `worldAvg=100`, `countryVal=120`, `gravityPct=50`, `contribution=-0.05`
- **Résultat attendu**
  - ratio = -0.2
  - contribution<0 ⇒ facteur = \(1 + 0.5\times(-ratio)=1+0.5\times0.2=1.1\)
  - final = \(-0.05\times1.1=-0.055\)

### Scénario 3.6 — Clamp gravité : facteur plafonné à 2
- **Source** : `expectedNextTick.ts/gravityFactorForContribution()`
- **État initial**
  - `worldAvg=100`, `countryVal=-100`, `gravityPct=200`, `contribution=+0.01`
- **Résultat attendu**
  - ratio = \((100-(-100))/100 = 2\)
  - facteur brut = \(1 + 2\times2 = 5\) ⇒ clamp → 2
  - final = \(0.01\times2=0.02\)

### Scénario 3.7 — Budget multi-effets sur un même ministère (cumul)
- **Source** : `ruleParameters.ts/getEffectsListForMinistry()`, boucle ministères dans `expectedNextTick.ts`
- **État initial**
  - Ministère “Infrastructure” avec `effects` :
    - effet A : `gdp` bonus=0.10 malus=-0.05 (gravity false par défaut pour gdp)
    - effet B : `industry` bonus=0.20 malus=-0.10 (gravity true par défaut)
  - `pct_infrastructure = 10`, `min_pct=5`, `gravity_pct=50`
  - `worldAvgs.ind_avg=5`, `country.industry=8`
- **Modificateurs appliqués**
  - gdp (sans gravité) + industry (avec gravité)
- **Résultat attendu**
  - contribution base commune (pct>=min) :
    - gdp contrib = \((10/100)\times0.10 = 0.01\) ⇒ final gdp = 0.01
    - ind contrib = \((10/100)\times0.20 = 0.02\)
  - gravité industry :
    - ratio = \((5-8)/5 = -0.6\)
    - facteur = \(1 + 0.5\times(-0.6) = 0.7\)
    - final ind = \(0.02\times0.7 = 0.014\)
- **Cas limites**
  - `effects` absent : fallback via `bonuses/maluses` + `BUDGET_MINISTRY_EFFECTS`.

---

## 4) Mécanique : Tick complet (population, PIB, stats)

### Scénario 4.1 — Tick “tout combiné” (global + effets + budget)
- **Source** : `expectedNextTick.ts/getExpectedNextTick()`
- **État initial**
  - Pays : `population=10_000`, `gdp=1_000`
  - Stats : `mil=4`, `ind=6`, `sci=2`, `stab=1`
  - Moyennes monde : `pop_avg=12_000`, `gdp_avg=900`, `mil_avg=5`, `ind_avg=5`, `sci_avg=4`, `stab_avg=0`
  - Règle globale `global_growth_effects` :
    - `population_growth_base=0.01`
    - `population_growth_per_stat(target=stability)=0.002`
    - `gdp_growth_base=0.02`
    - `gdp_growth_per_stat(target=industry)=0.001`
  - Budget : tous les ministères à 5% (minimum par défaut), donc **pas de malus automatique**
  - Effets actifs (passés à `effects` tickRates) :
    - `population_growth_base` avec `value=5` (interprété comme +5% car `abs>1`) ⇒ +0.05
    - `stat_delta(target=militarism, value=+0.3)`
- **Modificateurs appliqués**
  - Pop :
    - global : \(0.01 + 0.002\times stab(1)=0.012\)
    - effets : +0.05
  - PIB :
    - global : \(0.02 + 0.001\times ind(6)=0.026\)
    - effets : 0
  - Budget : supposé 0 ici (min atteint partout, mais bonus dépend des règles budget_* ; on fixe la règle budget_* vide pour ce scénario → `getBudgetVal` renvoie bonuses/maluses vides, donc contributions 0)
- **Résultat attendu**
  - \(pop\_total\_rate = 0.012 + 0.05 = 0.062\)
  - \(population\_next = round(10000\times(1+0.062)) = round(10620) = 10620\)
  - \(gdp\_total\_rate = 0.026\)
  - \(gdp\_next = 1000\times(1+0.026)=1026\)
  - militarism :
    - \(mil\_next = clamp(0,10, round((4 + 0.3 + 0)\times100)/100 )\)
    - \((4.3\times100)=430\) ⇒ `round=430` ⇒ 4.3
- **Cas limites**
  - Valeur de croissance `value=1` : **pas** normalisée (car `abs(value)>1` strict) ⇒ +100% ? Non : +1.0 (décimal) = +100% effectivement. Tester explicitement.

### Scénario 4.2 — Clamp : population/PIB ne deviennent jamais négatifs
- **Source** : `expectedNextTick.ts`
- **État initial**
  - `population=1000`, `gdp=100`
  - `pop_total_rate=-2` (via règles/effets)
  - `gdp_total_rate=-2`
- **Résultat attendu**
  - \(population\_next = round(1000 + 1000\times(-2)) = round(-1000)=-1000\) ⇒ clamp \(\to 0\)
  - \(gdp\_next = 100 + 100\times(-2)=-100\) ⇒ clamp \(\to 0\)

### Scénario 4.3 — Clamp stats société + arrondi 2 décimales
- **Source** : `expectedNextTick.ts`
- **État initial**
  - `militarism=9.999`, effet delta = +0.01
- **Résultat attendu**
  - \((9.999 + 0.01)=10.009\)
  - \(\times100=1000.9\) ⇒ `round=1001` ⇒ 10.01
  - clamp max 10 ⇒ 10

---

## 5) Mécanique : Influence (score diplomatique)

### Scénario 5.1 — Contributions brutes (sans gravité) et multiplicateur stabilité
- **Source** : `influence.ts/rawContributions()` + `stabilityModifier()`
- **État initial**
  - Config :
    - `mult_gdp=1e-9`, `mult_population=1e-7`, `mult_military=0.01`
    - `stability_modifier_min=0`, `stability_modifier_max=1`
  - Pays : `gdp=1_000_000_000`, `population=10_000_000`, `stability=0`, `hardPowerTotal=50`
- **Modificateurs appliqués** : aucun
- **Résultat attendu**
  - composantes :
    - gdp = \(1e-9 \times 1e9 = 1\)
    - pop = \(1e-7 \times 1e7 = 1\)
    - military = \(0.01 \times 50 = 0.5\)
  - stabilité :
    - \(t = (0 - (-3)) / 6 = 3/6 = 0.5\)
    - mod = \((1-0.5)\times0 + 0.5\times1 = 0.5\)
  - baseInfluence = \(1 + 1 + 0.5 = 2.5\)
  - influence = \(2.5 \times 0.5 = 1.25\)
- **Cas limites**
  - `stability` < -3 ou > 3 : clamp t dans [0,1].

### Scénario 5.2 — Gravité sur composant : pays au-dessus de la moyenne est “ralenti”
- **Source** : `influence.ts/gravityFactor()`
- **État initial**
  - Deux pays A et B, on veut les moyennes monde :
    - A comp.gdp=2, B comp.gdp=1 ⇒ worldAvgGdp = 1.5
  - A : comp.gdp=2, gravity_pct_gdp=50
- **Résultat attendu**
  - ratio = \((1.5 - 2)/1.5 = -0.333333...\)
  - facteur = \(1 + 0.5\times(-0.3333)=0.833333...\) (clamp ok)
  - gdpAfterGravity(A) = \(2\times0.833333... = 1.666666...\)

### Scénario 5.3 — Application des effets `influence_modifier_*`
- **Source** : `influence.ts/applyInfluenceModifiers()`
- **État initial**
  - Résultat après gravité : gdp=10, pop=5, military=2, stabilityMultiplier=0.5
  - Mods : `gdp=1.2`, `population=0.8`, `hard_power=1.5`, `global=1.1`
- **Résultat attendu**
  - base après mods :
    - gdp = \(10\times1.2=12\)
    - pop = \(5\times0.8=4\)
    - mil = \(2\times1.5=3\)
    - base = \(12+4+3=19\)
  - influence = \(19 \times 0.5 \times 1.1 = 10.45\)

---

## 6) Mécanique : Hard Power (militaire)

### Scénario 6.1 — Unlocked level = `floor(points/100)`
- **Source** : `hardPower.ts/unlockedLevelFromPoints()`
- **État initial**
  - `current_level=0` ⇒ unlockedLevel=0
  - `current_level=99` ⇒ unlockedLevel=0
  - `current_level=100` ⇒ unlockedLevel=1
  - `current_level=250` ⇒ unlockedLevel=2
- **Résultat attendu** : valeurs ci-dessus.

### Scénario 6.2 — Hard power = \(\sum count \times hardPower(level)\)
- **Source** : `hardPower.ts/computeHardPowerByCountry()`
- **État initial**
  - Roster unit U1 : branch `terre`, `base_count=10`
  - Country unit : `extra_count=+2`, `current_level=250` ⇒ unlockedLevel=2
  - Levels(U1) : level 2 hard_power = 3
- **Résultat attendu**
  - count = 10 + 2 = 12
  - contrib = 12 × 3 = 36
  - `terre=36`, `total=36`
- **Cas limites**
  - level manquant (pas de row au niveau unlocked) ⇒ hardPowerPerUnit=0.
  - `extra_count` négatif (si incohérence) : le code additionne quand même ; prévoir un test “comportement actuel”.

---

## 7) Mécanique : Idéologie hexagonale

### Scénario 7.1 — Normalisation simple à 100
- **Source** : `ideology.ts/normalizeIdeologyScores()`
- **État initial**
  - scores partiels : A=10, B=30, autres=0
- **Résultat attendu**
  - somme=40
  - A=25, B=75, autres=0
- **Cas limites**
  - somme<=0 ⇒ scores neutres (= 100/6 chacun).

### Scénario 7.2 — Axiomes : chaque paire antithétique devient “winner takes all”
- **Source** : `ideology.ts/normalizeIdeologyScoresWithAxioms()`
- **État initial**
  - Paires :
    - (germanic_monarchy vs mughal_republicanism) : 40 vs 10 ⇒ germanic prend 50, mughal 0
    - (french_republicanism vs satoiste_cultism) : 5 vs 25 ⇒ satoiste prend 30, french 0
    - (nilotique_cultism vs merina_monarchy) : 15 vs 5 ⇒ nilotique prend 20, merina 0
  - Total initial (avant axiomes) : 100
- **Résultat attendu**
  - Après axiomes : germanic=50, satoiste=30, nilotique=20 ; 3 autres = 0
  - Renormalisation à 100 : déjà ok.
- **Cas limites**
  - Égalité dans une paire : le code donne l’avantage à `a` (>=).

### Scénario 7.3 — Pull voisin (relation + influence + contrôle) + drift
- **Source** : `ideology.ts/computeWorldIdeologies()`
- **État initial**
  - Config : `daily_step=0.18`, `neighbor_pull_weight=0.8`, `relation_pull_weight=0.35`, `influence_pull_weight=0.45`, `control_pull_weight=1.1`, `effect_pull_weight=1`, `snap_strength=16`
  - Pays X prior : neutre simplifié pour le test (on force un prior au lieu d’un neutre complet) :
    - prior(X) : germanic=100, autres=0 (après axiomes ça reste germanic)
  - Un voisin Y :
    - prior(Y) : satoiste=100, autres=0
    - relation(X,Y) = +50
    - influence(Y) = maxInfluence (donc influenceFactor = 1 + 1×0.45 = 1.45)
    - contrôle : aucun
  - Donc :
    - relationFactor = 1 + (50/100)×0.35 = 1 + 0.175 = 1.175
    - totalWeight = relationFactor × influenceFactor = 1.175 × 1.45 = 1.70375 (>=0.05)
  - Aucun effet drift/snap
- **Modificateurs appliqués**
  - neighborScores = prior(Y) (car un seul voisin)
  - sourceVector = neighborScores×neighbor_pull_weight = satoiste=100×0.8=80
  - target = normalize(sourceVector) ⇒ satoiste=100
- **Résultat attendu**
  - drift = (target - prior)×daily_step
    - satoiste : (100 - 0)×0.18 = 18
    - germanic : (0 - 100)×0.18 = -18
  - scoresRaw = prior + drift :
    - germanic = 82
    - satoiste = 18
  - puis `normalizeIdeologyScoresWithAxioms(scoresRaw)` :
    - paire french vs satoiste : satoiste gagne (18 vs 0) ⇒ satoiste=18, french=0
    - autres paires : germanic vs mughal (82 vs 0) ⇒ germanic=82
    - total=100 ⇒ scores finaux germanic=82, satoiste=18
- **Cas limites**
  - totalWeight clamp min 0.05 (si relation très négative et config faible).

### Scénario 7.4 — Effets drift/snap (vecteurs) dominent via `snap_strength`
- **Source** : `ideology.ts/getIdeologyEffectTotals()` + `computeWorldIdeologies()`
- **État initial**
  - prior neutre
  - effets : `ideology_snap_satoiste_cultism = +1` permanent
  - snapVector = snap × snap_strength = 1×16 = 16 sur satoiste
  - pas de voisins
- **Résultat attendu**
  - target devient satoiste=100
  - drift satoiste = (100 - 100/6)×0.18 ≈ (100 - 16.6667)×0.18 ≈ 15
  - drift sur autres idéologies négatif réparti (car prior neutre) ; résultat final après axiomes : satoiste domine (reste l’un des 3 gagnants).
- **Cas limites**
  - Les valeurs exactes ici dépendent du prior neutre complet (6 composantes). Le test doit vérifier les invariants :
    - somme=100
    - axiomes appliqués (3 scores non nuls)
    - satoiste est dominant.

---

## 8) Mécanique : Avantages (activation via requis)

### Scénario 8.1 — Requis stat (frontière)
- **Source** : `perkRequirements.ts/isRequirementSatisfied()`
- **État initial**
  - Requis : `stat(militarism) >= 5`
  - Pays : militarism=5
- **Résultat attendu** : satisfait (>=).

### Scénario 8.2 — Requis PIB (valeur stockée en “brut”)
- **Source** : `perkRequirements.ts/isRequirementSatisfied()`, `getRequirementValueHelper()`
- **État initial**
  - Requis : `gdp >= 1_200_000_000` (1.2 Bn stocké)
  - Pays : gdp=1_199_999_999
- **Résultat attendu** : non satisfait.
- **Cas limites**
  - Affichage admin en Bn : `displayToStored(1.2) = 1_200_000_000`.

### Scénario 8.3 — Requis influence absent ⇒ non évalué ⇒ false
- **Source** : `perkRequirements.ts/isRequirementSatisfied()`
- **État initial**
  - Requis : `influence >= 100`
  - Contexte : `influenceValue` manquant (null/undefined)
- **Résultat attendu** : false.

### Scénario 8.4 — Requis law_level : niveau résolu depuis score
- **Source** : `perkRequirements.ts` + `laws.ts/getLawLevelKeyFromScore(...)`
- **État initial**
  - Requis : `law_level(target=L, value=3)` (niveau min 3)
  - Contexte : a un `CountryLawRow` pour L avec score tel que `getLawLevelKeyFromScore` retourne le 3e niveau
- **Résultat attendu** : true.
- **Cas limites**
  - `ruleParametersByKey` absent ⇒ false.

---

## 9) Mécanique : Jets de dés (succès/impact)

### Scénario 9.1 — Jet d100 borné + modif admin + clamp 1..100
- **Source** : `stateActionDice.ts/computeAiEventDiceRoll()`
- **État initial**
  - RNG : `Math.random() = 0` ⇒ roll=1
  - Admin modifiers : +10
  - Aucun modif stat (ranges 0..0)
- **Résultat attendu**
  - totalModifier=10
  - total = clamp(1,100, 1+10)=11

### Scénario 9.2 — Stat modifier : interpolation linéaire + arrondi
- **Source** : `stateActionDice.ts/computeStatModifierBreakdown()`
- **État initial**
  - Range config militarism : min=-10, max=20
  - Stat militarism=0 ⇒ t=0 ⇒ modifier=-10
  - Stat militarism=10 ⇒ t=1 ⇒ modifier=20
  - Stat militarism=5 ⇒ t=0.5 ⇒ modifier=round(-10 + 0.5×30) = round(5)=5
- **Résultat attendu** : valeurs ci-dessus.

### Scénario 9.3 — `stat_bonus` désactive une stat (non prise en compte)
- **Source** : `stateActionDice.ts` (`statBonusEnabled`)
- **État initial**
  - rangesRow inclut science avec bonus non nul
  - `paramsSchema.stat_bonus = { science: false }`
- **Résultat attendu**
  - `stat_modifiers` n’inclut pas `science`, et `totalModifier` ne somme pas science.

### Scénario 9.4 — Spécifique `prise_influence` : relationModifier
- **Source** : `stateActionDice.ts` (branch `actionKey === "prise_influence"`)
- **État initial**
  - relation = -40
  - `amplitude_relations = 30`
- **Résultat attendu**
  - relationModifier = round((-40/100)×30) = round(-12) = -12

### Scénario 9.5 — Spécifique `prise_influence` : influenceModifier piecewise (ratio)
- **Source** : `stateActionDice.ts`
- **État initial**
  - ratio = emitterInfluence/targetInfluence
  - paramètres : `ratio_equilibre=1`, `ratio_min=0.5`, `ratio_max=2`, `malus_max=20`, `bonus_max=20`
- **Résultats attendus**
  - **Cas A** : ratio=0.4 (<=0.5) ⇒ influenceModifier = -20
  - **Cas B** : ratio=0.75 (entre 0.5 et 1) ⇒
    - influenceModifier = round((-20×(1-0.75)) / (1-0.5)) = round((-20×0.25)/0.5)=round(-10)=-10
  - **Cas C** : ratio=1.5 (entre 1 et 2) ⇒
    - influenceModifier = round((20×(1.5-1)) / (2-1)) = round(10)=10
  - **Cas D** : ratio=3 (>=2) ⇒ influenceModifier = +20
- **Cas limites**
  - `targetInfluence=0` ⇒ ratio=0 ⇒ malus max.

---

## 10) Mécanique : Conséquences des actions d’État

### Scénario 10.1 — Relations : insulte / militaire (delta négatif borné)
- **Source** : `stateActionConsequences.ts/applyStateActionConsequences()`
- **État initial**
  - actionKey = `insulte_diplomatique`
  - `impact_maximum = 50`
  - `impact_roll.total = 80`
  - relation actuelle = +10
- **Résultat attendu**
  - relationDelta = round(-50×(80/100)) = round(-40) = -40 (dans [-100,0])
  - newRelation = clamp(round(10 + (-40))) = -30

### Scénario 10.2 — Relations : ouverture diplomatique (delta positif borné)
- **Source** : `stateActionConsequences.ts`
- **État initial**
  - actionKey=`ouverture_diplomatique`
  - `impact_maximum=50`, `impact_roll.total=80`, relation actuelle=-30
- **Résultat attendu**
  - delta = round(50×0.8)=40 clamp [0,100]
  - new = -30 + 40 = 10

### Scénario 10.3 — Prise d’influence : `share_pct` cap à 100
- **Source** : `stateActionConsequences.ts`
- **État initial**
  - actionKey=`prise_influence`
  - `impact_maximum=100`, `impact_roll.total=60` ⇒ impactPct=60
  - currentShare=50
- **Résultat attendu**
  - newShare = min(100, 50 + 60) = 100

### Scénario 10.4 — Effet immédiat `stat_delta` : clamp colonne stat
- **Source** : `stateActionConsequences.ts/applyImmediateEffect()`
- **État initial**
  - kind `stat_delta`, target `stability`, value=+10, current stability=2.5
- **Résultat attendu**
  - new = clamp([-3,3], 2.5+10=12.5) = 3

### Scénario 10.5 — Effet immédiat `military_unit_extra` : insertion vs update et clamp \(\ge 0\)
- **Source** : `stateActionConsequences.ts/applyImmediateEffect()`
- **État initial**
  - Cas A : row existante extra_count=1, value=-5
  - Cas B : aucune row, value=-1
  - Cas C : aucune row, value=+3
- **Résultat attendu**
  - A : newExtra = max(0, 1-5)=0 (update)
  - B : no-op (retour OK, pas d’insert)
  - C : insert avec extra_count=3

### Scénario 10.6 — Effet immédiat `military_unit_tech_rate` : cap `level_count*100`
- **Source** : `stateActionConsequences.ts/applyImmediateEffect()`
- **État initial**
  - roster.level_count=5 ⇒ cap=500
  - cmu.current_level=480, value=+50
- **Résultat attendu**
  - newLevel = min(500, 480+50=530)=500

### Scénario 10.7 — Effet immédiat `ideology_snap_*` : normalisation + axiomes + toFixed(4)
- **Source** : `stateActionConsequences.ts/applyImmediateEffect()`, `ideology.ts/normalizeIdeologyScoresWithAxioms()`
- **État initial**
  - scores actuels : neutres (100/6)
  - snap sur `ideology_snap_satoiste_cultism` value=+10
- **Résultat attendu**
  - Le score satoiste augmente, puis `normalizeIdeologyScoresWithAxioms` force 3 idéologies non-nulles (selon paires) et somme=100.
  - Les colonnes persistées ont 4 décimales.
- **Cas limites**
  - Idéologie inconnue ⇒ erreur `Idéologie inconnue`.

---

## Checklist de couverture (exhaustivité)

- **Croissance globale**
  - [ ] base/per_stat, multi-effets, stat négative, target inconnu
  - [ ] cohérence “décimal attendu” vs normalisation abs>1 (documenter la règle)
- **Effets**
  - [ ] agrégation des 6 sources (country/law/global/perk/ai/ideology)
  - [ ] expiration (days/updates/permanent + absence de duration_remaining)
  - [ ] stacking : min_pct max ; allocation_cap sum ; limites & extras sum ; influence multipliers product
  - [ ] tickRates exclut global_growth_effects (anti double-count)
- **Budget**
  - [ ] bonus/malus, min_pct=0, worldAvg=0, gravité bonus vs gravité malus, clamp [0.1,2]
  - [ ] `effects` prioritaires vs fallback bonuses/maluses
- **Tick**
  - [ ] clamp pop/gdp à 0, clamp stats, arrondi 2 décimales, `abs(value)>1` pour effets croissance
- **Influence**
  - [ ] contributions brutes + gravité + stabilité + effets mods
- **Hard Power**
  - [ ] unlockedLevel floor(points/100), niveau manquant, extra_count incohérent
- **Idéologie**
  - [ ] normalisation, axiomes, drift, pull voisin (relation/influence/contrôle), effets drift/snap
- **Perks**
  - [ ] requis stat/gdp/pop/influence/law_level, contexte manquant
- **Dés & conséquences**
  - [ ] stat ranges interpolation + round, stat_bonus off, clamp 1..100
  - [ ] prise_influence relationModifier & influenceModifier piecewise
  - [ ] conséquences relations, prise d’influence, effets immédiats (stat/relation/tech/extra/idéologie)

