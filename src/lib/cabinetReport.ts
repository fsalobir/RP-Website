/**
 * Rapport du Cabinet — génération de textes dynamiques par ministère.
 * Banque de phrases avec variantes, tirage déterministe (graine) pour reproductibilité.
 */

import type { TickBreakdown } from "@/lib/tickBreakdown";
import type { ExpectedNextTickResult, WorldAverages } from "@/lib/expectedNextTick";
import type { CountrySnapshot } from "@/lib/expectedNextTick";
import { BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";

/** Même logique que les triangles du résumé (CountryTabCabinet getTrend) : variation attendue (expected - snapshot). Pour les taux (pop, PIB) on renvoie le taux relatif pour aligner avec TREND_STABLE_REL. */
function getTotalForDisplay(expected: ExpectedNextTickResult, snapshot: CountrySnapshot, statKey: string): number {
  const next = expected[statKey as keyof ExpectedNextTickResult];
  const curr = snapshot[statKey as keyof CountrySnapshot];
  if (typeof next !== "number" || typeof curr !== "number") return 0;
  if (statKey === "population" || statKey === "gdp") {
    return curr !== 0 ? (next - curr) / curr : 0;
  }
  return next - curr;
}

/** Seuils de magnitude pour les deltas (stats, échelle 0–10) : 4 niveaux. */
const MAGNITUDE_DELTA_LIGHT = 0.2;
const MAGNITUDE_DELTA_MODERATE = 0.5;
const MAGNITUDE_DELTA_LARGE = 1.0;

/** Seuils pour les taux (population, PIB) : valeur absolue en décimal (ex. 0,02 = 2 %). */
const MAGNITUDE_RATE_LIGHT = 0.02;
const MAGNITUDE_RATE_MODERATE = 0.05;
const MAGNITUDE_RATE_LARGE = 0.1;

/** Seuil en deçà duquel la contribution du ministère est considérée comme nulle (magnitude). */
const MAGNITUDE_RATE_WEAK = 0.001;
const MAGNITUDE_DELTA_WEAK = 0.005;

/** En deçà de ce seuil, le résultat net est affiché comme « stable » (phrase + ton neutre). Aligné sur CountryTabCabinet : TREND_STABLE_REL = 0.005 (taux), TREND_STABLE_ABS = 0.01 (deltas). */
const TOTAL_ZERO_EPSILON_RATE = 0.001;
const TOTAL_ZERO_EPSILON_DELTA = 0.01;

/** Stat key → clé sources et optionnellement gravity_info dans expected.inputs. */
const STAT_TO_INPUTS_KEY: Record<string, { sources: keyof ExpectedNextTickResult["inputs"]; gravity?: keyof ExpectedNextTickResult["inputs"] }> = {
  population: { sources: "budget_pop_sources" },
  gdp: { sources: "budget_gdp_sources" },
  militarism: { sources: "budget_mil_sources", gravity: "budget_mil_gravity_info" },
  industry: { sources: "budget_ind_sources", gravity: "budget_ind_gravity_info" },
  science: { sources: "budget_sci_sources", gravity: "budget_sci_gravity_info" },
  stability: { sources: "budget_stab_sources" },
};

/** Retourne le taux ou delta total pour une stat (dérivé des inputs, aucun mapping en dur). */
function getTotalForStat(inputs: ExpectedNextTickResult["inputs"], statKey: string): number {
  if (statKey === "population") return inputs.pop_total_rate ?? 0;
  if (statKey === "gdp") return inputs.gdp_total_rate ?? 0;
  if (statKey === "militarism") return (inputs.delta_mil ?? 0) + (inputs.budget_mil ?? 0);
  if (statKey === "industry") return (inputs.delta_ind ?? 0) + (inputs.budget_ind ?? 0);
  if (statKey === "science") return (inputs.delta_sci ?? 0) + (inputs.budget_sci ?? 0);
  if (statKey === "stability") return (inputs.delta_stab ?? 0) + (inputs.budget_stab ?? 0);
  return 0;
}

export type FundingLevel = "largely_sufficient" | "sufficient" | "tight" | "insufficient" | "very_insufficient";

export type MagnitudeLevel = "light" | "moderate" | "large" | "massive";

type MinistryFundingContext = {
  pct: number;
  minPct: number;
};

/** Niveau de financement basé uniquement sur les contributions du ministère (données dynamiques). */
function getFundingLevel(
  inputs: ExpectedNextTickResult["inputs"],
  effects: Array<{ key: string; label: string }>,
  sourceLabel: string,
  budgetContext?: MinistryFundingContext
): FundingLevel {
  if (budgetContext) {
    const pct = Math.max(0, budgetContext.pct);
    const minPct = Math.max(0, budgetContext.minPct);
    if (minPct <= 0) return pct > 0 ? "largely_sufficient" : "sufficient";
    const ratio = pct / minPct;
    if (pct < minPct) return ratio < 0.5 ? "very_insufficient" : "insufficient";
    if (ratio < 1.1) return "tight";
    if (ratio < 1.75) return "sufficient";
    return "largely_sufficient";
  }
  const isRate = (k: string) => k === "population" || k === "gdp";
  const weakThresh = (k: string) => (isRate(k) ? MAGNITUDE_RATE_WEAK : MAGNITUDE_DELTA_WEAK);
  const pairs: { statKey: string; contribution: number }[] = [];
  for (const { key: statKey } of effects) {
    const conf = STAT_TO_INPUTS_KEY[statKey];
    if (!conf) continue;
    const sources = inputs[conf.sources] as Record<string, number> | undefined;
    const c = sources?.[sourceLabel];
    if (c != null) pairs.push({ statKey, contribution: c });
  }
  const negativeCount = pairs.filter((p) => p.contribution < 0).length;
  let allMeaningfullyPositive = true;
  let anyBarelyPositive = false;
  for (const { statKey, contribution: c } of pairs) {
    const thresh = weakThresh(statKey);
    if (c < thresh && c >= 0) anyBarelyPositive = true;
    if (c <= thresh) allMeaningfullyPositive = false;
  }
  const level =
    negativeCount >= 2 ? "very_insufficient"
    : negativeCount === 1 ? "insufficient"
    : negativeCount === 0 && anyBarelyPositive ? "tight"
    : negativeCount === 0 && allMeaningfullyPositive ? "largely_sufficient"
    : "sufficient";
  return level;
}

/** Magnitude du mouvement (taux ou delta total) : 4 niveaux. Données dérivées des inputs. */
function getMagnitudeLevel(statKey: string, totalRateOrDelta: number): MagnitudeLevel {
  const abs = Math.abs(totalRateOrDelta);
  const isRate = statKey === "population" || statKey === "gdp";
  if (isRate) {
    if (abs >= MAGNITUDE_RATE_LARGE) return "massive";
    if (abs >= MAGNITUDE_RATE_MODERATE) return "large";
    if (abs >= MAGNITUDE_RATE_LIGHT) return "moderate";
    return "light";
  }
  if (abs >= MAGNITUDE_DELTA_LARGE) return "massive";
  if (abs >= MAGNITUDE_DELTA_MODERATE) return "large";
  if (abs >= MAGNITUDE_DELTA_LIGHT) return "moderate";
  return "light";
}

/** Signe discret (positif / nul / négatif) avec seuil de bruit. */
function getSign(value: number, isRate: boolean): "positive" | "zero" | "negative" {
  const thresh = isRate ? MAGNITUDE_RATE_WEAK : MAGNITUDE_DELTA_WEAK;
  if (value >= thresh) return "positive";
  if (value <= -thresh) return "negative";
  return "zero";
}

/** Direction du résultat net pour phrase et ton : seuil « stable » pour éviter « progresse » / « baisse » sur de très faibles variations. NaN → jamais « stable » : on utilise la valeur de repli (totalInputs) si fournie. */
function getTotalDirection(total: number, isRate: boolean, totalInputsFallback?: number): "positive" | "negative" | "zero" {
  const val = typeof total === "number" && !Number.isNaN(total) ? total : (typeof totalInputsFallback === "number" && !Number.isNaN(totalInputsFallback) ? totalInputsFallback : 0);
  const eps = isRate ? TOTAL_ZERO_EPSILON_RATE : TOTAL_ZERO_EPSILON_DELTA;
  if (val >= eps) return "positive";
  if (val <= -eps) return "negative";
  return "zero";
}

/** Banque de phrases : clé → tableau de variantes (FR). Ton document officiel / rapport ministériel. */
const PHRASE_VARIANTS: Record<string, string[]> = {
  ministry_funding_largely_sufficient: [
    "Les financements dépassent largement les besoins du ministère pour la période.",
    "Le ministre salue des moyens nettement conformes aux objectifs assignés.",
    "Le budget alloué permet une marge confortable pour les politiques prévues.",
    "Les dotations sont au-delà du minimum requis ; le ministère dispose d'une marge d'action.",
  ],
  ministry_funding_tight: [
    "Les financements atteignent tout juste le minimum ; une vigilance est de mise.",
    "Le ministère signale des moyens à la limite du suffisant pour la période.",
    "Les crédits alloués couvrent le strict nécessaire sans marge significative.",
  ],
  ministry_funding_insufficient: [
    "Les financements alloués au ministère restent en deçà des besoins identifiés.",
    "Le ministre déplore des crédits insuffisants pour mener à bien les missions confiées.",
    "Le budget voté ne couvre pas le minimum requis pour le bon exercice des compétences du ministère.",
    "Les moyens accordés demeurent sous le seuil nécessaire à la réalisation des objectifs fixés.",
    "Le ministère signale un sous-financement structurel susceptible d’affecter la qualité du service.",
    "Les crédits ouverts ne permettent pas de répondre aux attentes légitimes du secteur.",
    "Le ministre alerte le cabinet sur l’insuffisance des dotations budgétaires.",
    "Les financements actuels ne couvrent pas les besoins minimaux d’exploitation.",
    "Le budget est en retrait par rapport aux engagements pris devant les instances.",
    "Les moyens disponibles restent insuffisants au regard des objectifs de politique publique.",
    "Les crédits alloués ne suffisent pas à maintenir le niveau d’activité requis.",
    "Le ministère constate un écart préoccupant entre les besoins et les ressources.",
  ],
  ministry_funding_very_insufficient: [
    "Les financements sont très insuffisants sur plusieurs secteurs du ministère.",
    "Le ministre alerte sur un sous-financement marqué, préjudiciable aux missions.",
    "Les crédits ouverts sont nettement en deçà des besoins sur plusieurs indicateurs.",
    "Le budget est en retrait important par rapport aux objectifs fixés.",
  ],
  ministry_funding_sufficient: [
    "Les financements sont à la hauteur des besoins du ministère pour la période considérée.",
    "Le ministre salue des moyens conformes aux objectifs assignés par le gouvernement.",
    "Le budget alloué permet de couvrir les dépenses de fonctionnement et d’investissement prévues.",
    "Les crédits ouverts couvrent les besoins du secteur et permettent la mise en œuvre des réformes.",
    "Le ministère dispose des moyens nécessaires à l’exercice de ses missions.",
    "Les financements sont conformes au minimum requis pour une exécution satisfaisante.",
    "Le ministre constate un budget adapté aux priorités définies par le cabinet.",
    "Les moyens accordés sont suffisants pour maintenir et développer l’action du ministère.",
    "Le budget permet de mener les politiques prévues dans de bonnes conditions.",
    "Les dotations sont à la hauteur des enjeux pour la période en cours.",
    "Le ministère dispose des crédits nécessaires pour honorer ses engagements.",
    "Les financements alloués correspondent aux besoins identifiés dans le cadre de la programmation.",
  ],
  stat_decline_strong: [
    "les indicateurs de [stat] enregistrent un recul marqué sur l’ensemble du territoire",
    "le ministre constate une dégradation nette de la situation en matière de [stat]",
    "la [stat] connaît un déclin prononcé, appelant des mesures correctives urgentes",
    "les données font état d’une baisse significative de la [stat] sur la période",
    "un net recul de la [stat] est observé dans les rapports des services déconcentrés",
    "la dégradation de la [stat] est sensible et préoccupe l’administration",
    "les indicateurs [stat] chutent de manière importante, nécessitant une attention particulière",
    "le ministère relève une régression forte de la [stat] par rapport aux objectifs",
    "la [stat] régresse nettement ; des actions ciblées sont recommandées",
    "une baisse marquée de la [stat] est constatée dans les derniers bilans",
    "le recul de la [stat] est prononcé et appelle un renforcement des dispositifs existants",
    "la situation de la [stat] se dégrade de façon notable sur l’ensemble du périmètre.",
  ],
  stat_decline_moderate: [
    "la [stat] enregistre un recul modéré sur la période considérée",
    "le ministre observe une dégradation mesurée des indicateurs de [stat]",
    "les indicateurs [stat] fléchissent quelque peu, sans caractère d’urgence",
    "un déclin modéré de la [stat] est constaté dans les rapports d’activité",
    "la [stat] régresse légèrement ; une vigilance est de mise",
    "le recul de la [stat] reste contenu mais mérite un suivi attentif",
    "une baisse modérée de la [stat] est observée par les services",
    "la dégradation de la [stat] est modérée et demeure maîtrisable",
    "la [stat] fléchit de manière modérée par rapport aux périodes précédentes",
    "un recul modéré des indicateurs [stat] est signalé sans alerte majeure",
    "la [stat] connaît un fléchissement modéré, appelant un suivi régulier",
    "les indicateurs [stat] se dégradent modérément sur l’ensemble du périmètre.",
  ],
  stat_decline_weak: [
    "la [stat] décline légèrement, sans impact majeur attendu",
    "un léger recul de la [stat] est observé dans les derniers éléments transmis",
    "les indicateurs [stat] fléchissent marginalement",
    "une légère baisse de la [stat] est constatée, demeurant dans des fourchettes acceptables",
    "le ministre signale un recul limité de la [stat], sans caractère alarmant",
    "la [stat] régresse très légèrement sur la période",
    "un déclin faible de la [stat] est enregistré ; la situation reste maîtrisée",
    "la dégradation de la [stat] reste limitée et ne justifie pas de mesure exceptionnelle",
    "la [stat] connaît une légère baisse, conforme aux variations habituelles",
    "un fléchissement modeste des indicateurs [stat] est à relever",
    "la [stat] enregistre un recul mineur, sans conséquence notable à ce stade",
    "les indicateurs [stat] marquent un léger repli, demeurant dans la norme.",
  ],
  stat_decline_large: [
    "la [stat] enregistre une baisse importante sur la période",
    "le ministre constate un recul marqué de la [stat], appelant une attention particulière",
    "une baisse large de la [stat] est observée dans les rapports",
    "le recul de la [stat] est significatif et dépasse les variations habituelles",
  ],
  stat_decline_massive: [
    "la [stat] subit une baisse massive, situation préoccupante",
    "le ministre alerte sur un recul très marqué de la [stat]",
    "les indicateurs [stat] chutent fortement ; des mesures correctives sont nécessaires",
    "une baisse d'ampleur exceptionnelle de la [stat] est constatée",
  ],
  stat_improve_strong: [
    "les indicateurs de [stat] progressent nettement sur l’ensemble du territoire",
    "le ministre constate une amélioration marquée de la situation en matière de [stat]",
    "la [stat] connaît une progression significative, fruit des politiques menées",
    "les données font état d’une hausse sensible de la [stat] sur la période",
    "une nette amélioration de la [stat] est observée dans les rapports des services",
    "les indicateurs [stat] s’améliorent de manière prononcée",
    "la [stat] progresse fortement ; les objectifs fixés sont en voie d’être atteints",
    "le ministère relève une hausse marquée de la [stat] par rapport aux périodes précédentes",
    "une progression nette de la [stat] est constatée dans les derniers bilans",
    "la [stat] se renforce nettement, conformément aux orientations du gouvernement",
    "l’amélioration de la [stat] est sensible et encourageante",
    "la situation de la [stat] s’améliore de façon notable sur l’ensemble du périmètre.",
  ],
  stat_improve_moderate: [
    "la [stat] progresse modérément sur la période considérée",
    "le ministre observe une amélioration mesurée des indicateurs de [stat]",
    "les indicateurs [stat] s’améliorent quelque peu, dans le sens des objectifs fixés",
    "une progression modérée de la [stat] est constatée dans les rapports d’activité",
    "la [stat] augmente légèrement ; la dynamique est positive",
    "l’amélioration de la [stat] reste mesurée mais encourageante",
    "une hausse modérée de la [stat] est observée par les services",
    "la [stat] progresse de manière modérée, en ligne avec les prévisions",
    "la [stat] se renforce modérément par rapport aux périodes précédentes",
    "une amélioration modérée des indicateurs [stat] est à relever",
    "la [stat] connaît une progression modérée, conforme aux attentes",
    "les indicateurs [stat] progressent modérément sur l’ensemble du périmètre.",
  ],
  stat_improve_weak: [
    "la [stat] progresse légèrement, dans un contexte globalement favorable",
    "un léger progrès de la [stat] est observé dans les derniers éléments transmis",
    "les indicateurs [stat] s’améliorent marginalement",
    "une légère hausse de la [stat] est constatée, demeurant dans la continuité",
    "le ministre signale une amélioration limitée mais réelle de la [stat]",
    "la [stat] augmente très légèrement sur la période",
    "une progression faible de la [stat] est enregistrée ; la tendance est positive",
    "l’amélioration de la [stat] reste limitée mais va dans le bon sens",
    "la [stat] connaît une légère progression, conforme aux évolutions attendues",
    "un progrès modeste des indicateurs [stat] est à relever",
    "la [stat] enregistre une hausse mineure, sans caractère exceptionnel",
    "les indicateurs [stat] marquent une légère amélioration, demeurant dans la norme.",
  ],
  stat_improve_large: [
    "la [stat] progresse nettement ; les politiques portent leurs fruits",
    "une hausse importante de la [stat] est observée sur la période",
    "le ministre relève une amélioration marquée de la [stat]",
    "les indicateurs [stat] enregistrent une progression significative",
  ],
  stat_improve_massive: [
    "la [stat] connaît une progression massive, résultat des efforts menés",
    "une hausse exceptionnelle de la [stat] est constatée",
    "le ministre salue une amélioration très marquée de la [stat]",
    "les indicateurs [stat] progressent fortement sur l'ensemble du périmètre.",
  ],
  conjuncture_ministry_positive_external_positive_total_positive: [
    "la [stat] progresse ; le ministère et le contexte y contribuent favorablement",
    "amélioration de la [stat], dans un contexte porteur et avec des moyens adaptés",
    "le ministre relève une hausse de la [stat], soutenue par l'allocation et l'environnement",
  ],
  conjuncture_ministry_positive_external_negative_total_positive: [
    "la [stat] s'améliore malgré un contexte défavorable ; le ministère compense",
    "le ministre constate une progression de la [stat] grâce à une allocation adaptée, en dépit du contexte",
    "amélioration de la [stat] portée par le ministère alors que les effets externes sont négatifs",
  ],
  conjuncture_ministry_positive_external_negative_total_negative: [
    "le ministère est bien alloué sur la [stat], mais le résultat net baisse en raison du contexte global",
    "malgré des moyens ministériels suffisants, la [stat] recule sous l'effet des facteurs externes",
    "contexte défavorable : la [stat] régresse alors que la contribution du ministère est positive",
  ],
  conjuncture_ministry_negative_external_positive_total_positive: [
    "le contexte compense le sous-financement du ministère ; la [stat] progresse malgré tout",
    "la [stat] s'améliore grâce aux effets externes, alors que l'allocation ministérielle est insuffisante",
    "résultat net positif sur la [stat], porté par l'environnement malgré des crédits ministériels en retrait",
  ],
  conjuncture_ministry_negative_external_positive_total_negative: [
    "sous-financement du ministère sur la [stat] ; le contexte ne suffit pas à compenser",
    "la [stat] recule : les moyens du ministère sont en deçà et l'externe ne compense pas",
    "résultat net en baisse sur la [stat], entre allocation insuffisante et contexte insuffisant pour compenser",
  ],
  conjuncture_ministry_negative_external_negative_total_negative: [
    "recul de la [stat] : ministère et contexte sont défavorables",
    "le ministre constate une baisse de la [stat], à la fois imputable au budget et au contexte global",
    "la [stat] régresse ; contribution ministérielle et effets externes sont tous deux négatifs",
  ],
  conjuncture_ministry_zero_total_positive: [
    "Le ministère n'a pas d'impact mesurable sur la [stat] ; une hausse est enregistrée, liée au contexte externe.",
    "Pas de contribution significative du ministère sur la [stat] ; la hausse observée reflète les facteurs externes.",
    "La [stat] progresse sous l'effet du contexte externe, sans impact notable de l'allocation ministérielle.",
  ],
  conjuncture_ministry_zero_total_negative: [
    "Le ministère n'a pas d'impact mesurable sur la [stat] ; une baisse a eu lieu, liée aux facteurs externes.",
    "Pas de contribution significative du ministère sur la [stat] ; la baisse observée reflète le contexte externe.",
    "La [stat] régresse sous l'effet du contexte externe, sans impact notable de l'allocation ministérielle.",
  ],
  conjuncture_ministry_zero_total_zero: [
    "Le ministère n'a pas d'impact mesurable sur la [stat] ; aucun changement notable sur la période.",
    "Pas de contribution significative du ministère sur la [stat] ; la [stat] reste stable.",
    "La [stat] est stable sur la période ; la dynamique externe n'a pas entraîné d'évolution.",
  ],
  gravity_ahead_decline: [
    "La position d’avance du pays par rapport à la moyenne mondiale accentue toutefois le recul observé.",
    "En raison du niveau déjà élevé par rapport au reste du monde, le déclin enregistré est amplifié.",
    "L’avance dont bénéficie le pays sur le plan international rend la dégradation d’autant plus sensible.",
    "Le déclin est aggravé par la position d’avance du pays au regard des standards mondiaux.",
    "La situation est rendue plus préoccupante par l’écart positif antérieur du pays par rapport à la moyenne mondiale.",
    "En avance sur la moyenne mondiale, le pays subit un déclin plus rapide que si sa position eût été moyenne.",
    "L’avance du pays par rapport au reste du monde contribue à accélérer le recul constaté.",
    "La position favorable antérieure du pays accentue la dégradation en cours.",
    "Le déclin est d’autant plus marqué que le pays partait d’un niveau supérieur à la moyenne mondiale.",
    "L’écart positif du pays par rapport aux autres nations amplifie les effets du recul.",
    "En raison de son avance, le pays enregistre un déclin plus prononcé.",
    "La position d’avance du pays au plan mondial renforce la perception négative du déclin.",
  ],
  gravity_behind_improve: [
    "La position de retard du pays par rapport à la moyenne mondiale favorise une progression plus rapide.",
    "En raison du niveau encore en retrait par rapport au reste du monde, l’amélioration est accélérée.",
    "Le retard dont pâtit le pays sur le plan international permet un rattrapage plus marqué.",
    "La progression est amplifiée par la position de retard du pays au regard des standards mondiaux.",
    "La situation est favorisée par l’écart négatif antérieur du pays par rapport à la moyenne mondiale.",
    "En retard sur la moyenne mondiale, le pays bénéficie d’une dynamique de rattrapage favorable.",
    "Le retard du pays par rapport au reste du monde contribue à accélérer l’amélioration constatée.",
    "La position de retard du pays renforce les effets positifs des politiques menées.",
    "L’amélioration est d’autant plus sensible que le pays partait d’un niveau inférieur à la moyenne mondiale.",
    "L’écart négatif du pays par rapport aux autres nations favorise une progression plus rapide.",
    "En raison de son retard, le pays enregistre une amélioration accélérée.",
    "La position de retard du pays au plan mondial amplifie les gains enregistrés.",
  ],
  gravity_ahead_improve: [
    "En avance sur la moyenne mondiale, l’amélioration reste toutefois limitée par un effet de plafond.",
    "L’avance du pays modère la progression : les marges de gain sont plus réduites.",
    "La position d’avance du pays par rapport au reste du monde ralentit la hausse attendue.",
    "Le niveau déjà élevé du pays limite l’ampleur des progrès supplémentaires.",
    "En raison de son avance, le pays enregistre une amélioration plus modérée.",
  ],
  gravity_behind_decline: [
    "En retard sur la moyenne mondiale, le déclin reste toutefois atténué par un effet de rattrapage.",
    "Le retard du pays modère le recul : la dégradation est moins prononcée qu’ailleurs.",
    "La position de retard du pays par rapport au reste du monde limite l’ampleur du recul.",
    "Le niveau déjà en retrait du pays atténue la baisse enregistrée.",
    "En raison de son retard, le pays subit un déclin plus limité.",
  ],
  no_significant_effect: [
    "Aucune évolution nette sur la [stat] sur la période.",
    "La situation reste stable ; aucun changement significatif n’a été enregistré.",
    "Rien de particulier à relever pour ce secteur au cours de la période.",
    "Pas de variation notable de la [stat] à signaler pour cette période.",
    "Aucun effet notable n’est à porter au crédit ou au débit de cette politique pour l’instant.",
    "La situation est inchangée ; le ministère ne relève pas d’évolution marquante.",
    "La [stat] est inchangée sur la période considérée.",
    "Les données restent stables pour l’indicateur concerné.",
    "Aucune évolution nette sur la [stat] est constatée dans les rapports des services.",
    "La stabilité prévaut ; rien à signaler pour l’instant.",
    "Le ministère ne relève pas d’effet notable sur la période.",
    "Les indicateurs restent dans des fourchettes habituelles, sans variation significative.",
  ],
};

const STAT_LABELS_FR: Record<string, string> = {
  population: "Population",
  gdp: "PIB",
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
};

/** Formes grammaticales pour chaque stat (article, préposition) afin d'éviter "la Industrie", "de la PIB". */
const STAT_FORMS: Record<string, { articleForm: string; deLaForm: string; deForm: string }> = {
  population: { articleForm: "la population", deLaForm: "de la population", deForm: "de population" },
  gdp: { articleForm: "le PIB", deLaForm: "du PIB", deForm: "de PIB" },
  militarism: { articleForm: "le militarisme", deLaForm: "du militarisme", deForm: "de militarisme" },
  industry: { articleForm: "l'industrie", deLaForm: "de l'industrie", deForm: "d'industrie" },
  science: { articleForm: "la science", deLaForm: "de la science", deForm: "de science" },
  stability: { articleForm: "la stabilité", deLaForm: "de la stabilité", deForm: "de stabilité" },
};

/** Remplace [stat] par les formes grammaticales correctes (la/le, de la/du, etc.). */
function fillStatSlotWithForms(fragment: string, statKey: string): string {
  const forms = STAT_FORMS[statKey];
  const label = STAT_LABELS_FR[statKey] ?? statKey;
  if (!forms) return fragment.replace(/\[stat\]/g, label);
  const articleFormCap = forms.articleForm.charAt(0).toUpperCase() + forms.articleForm.slice(1);
  return fragment
    .replace(/de la \[stat\]/g, forms.deLaForm)
    .replace(/du \[stat\]/g, forms.deLaForm)
    .replace(/des indicateurs de \[stat\]/g, `des indicateurs ${forms.deForm}`)
    .replace(/en matière de \[stat\]/g, `en matière ${forms.deForm}`)
    .replace(/les indicateurs \[stat\]/g, `les indicateurs ${forms.deLaForm}`)
    .replace(/La \[stat\]/g, articleFormCap)
    .replace(/\bla \[stat\]/g, forms.articleForm)
    .replace(/\ble \[stat\]/g, forms.articleForm)
    .replace(/l'\[stat\]/g, forms.articleForm)
    .replace(/\[stat\]/g, label);
}

/** Liste d’effets (stat key + label) par ministère, dérivée des contributions dans expected.inputs. */
function getEffectsPerMinistryFromInputs(inputs: ExpectedNextTickResult["inputs"]): Record<string, { key: string; label: string }[]> {
  const byMinistry: Record<string, { key: string; label: string }[]> = {};
  const statKeys = Object.keys(STAT_TO_INPUTS_KEY) as string[];
  for (const ministryKey of Object.keys(BUDGET_MINISTRY_LABELS)) {
    const sourceLabel = BUDGET_MINISTRY_LABELS[ministryKey];
    const effects: { key: string; label: string }[] = [];
    for (const statKey of statKeys) {
      const conf = STAT_TO_INPUTS_KEY[statKey];
      const sources = inputs[conf.sources] as Record<string, number> | undefined;
      if (sources && sourceLabel in sources) {
        effects.push({ key: statKey, label: STAT_LABELS_FR[statKey] ?? statKey });
      }
    }
    if (effects.length > 0) {
      byMinistry[ministryKey] = effects;
    }
  }
  return byMinistry;
}

/** Hash simple pour tirage déterministe (graine + clé + index). */
function simpleHash(seed: number, key: string, index: number): number {
  let h = seed;
  const s = `${key}-${index}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Choisit une variante de phrase de manière déterministe. */
export function pickVariant(key: string, index: number, seed: number): string {
  const variants = PHRASE_VARIANTS[key];
  if (!variants?.length) return "";
  const idx = simpleHash(seed, key, index) % variants.length;
  return variants[idx] ?? variants[0];
}

export type CabinetParagraphTone = "positive" | "neutral" | "negative";

export type CabinetMinistryBlock = {
  ministryKey: string;
  ministryLabel: string;
  paragraphs: Array<{ text: string; tone: CabinetParagraphTone }>;
};

/** Niveau de financement → clé de phrase et ton. */
function getFundingPhraseKeyAndTone(level: FundingLevel): { key: string; tone: CabinetParagraphTone } {
  const key = `ministry_funding_${level}`;
  const tone: CabinetParagraphTone =
    level === "largely_sufficient" || level === "sufficient" ? "positive"
    : level === "tight" ? "neutral"
    : "negative";
  return { key, tone };
}

/** Magnitude (4 niveaux) → suffixe pour clé stat_improve_* / stat_decline_*. */
function magnitudeToLegacySuffix(mag: MagnitudeLevel): "weak" | "moderate" | "large" | "massive" {
  return mag === "light" ? "weak" : mag;
}

/**
 * Génère les paragraphes du Rapport du Cabinet par ministère.
 * Ordre des idées : financement (gradient) → conjoncture par stat (ministère / externe / résultat net) → gravité si pertinent.
 *
 * - Financement : 5 niveaux (largely_sufficient … very_insufficient), ton selon le niveau.
 * - Par indicateur : phrase de conjoncture (contribution ministère vs externe vs résultat net) ; ton basé sur le **résultat net** (total).
 * - Gravité : basée sur le résultat net et la position (avance/retard) par rapport à la moyenne mondiale.
 */
export function getCabinetPhrases(
  breakdown: TickBreakdown,
  expected: ExpectedNextTickResult,
  countrySnapshot: CountrySnapshot,
  worldAverages: WorldAverages,
  seed?: number,
  fundingByMinistry?: Record<string, MinistryFundingContext>
): CabinetMinistryBlock[] {
  const inputs = expected.inputs;
  const seedNum = seed ?? 0;
  const blocks: CabinetMinistryBlock[] = [];
  const effectsByMinistry = getEffectsPerMinistryFromInputs(inputs);

  const ministryKeys = Object.keys(BUDGET_MINISTRY_LABELS) as string[];
  for (const ministryKey of ministryKeys) {
    const effects = effectsByMinistry[ministryKey];
    if (!effects?.length) continue;

    const sourceLabel = BUDGET_MINISTRY_LABELS[ministryKey];
    const ministryLabel = BUDGET_MINISTRY_LABELS[ministryKey] ?? ministryKey;
    const paragraphs: Array<{ text: string; tone: CabinetParagraphTone }> = [];

    const fundingLevel = getFundingLevel(inputs, effects, sourceLabel, fundingByMinistry?.[ministryKey]);
    const { key: fundingKey, tone: fundingTone } = getFundingPhraseKeyAndTone(fundingLevel);
    paragraphs.push({
      text: pickVariant(fundingKey, 0, seedNum),
      tone: fundingTone,
    });

    let hasSignificantEffect = false;
    for (let ei = 0; ei < effects.length; ei++) {
      const { key: statKey } = effects[ei];
      const conf = STAT_TO_INPUTS_KEY[statKey];
      if (!conf) continue;
      const sources = inputs[conf.sources] as Record<string, number> | undefined;
      const ministry_own = sources?.[sourceLabel] ?? 0;
      if (sources && !(sourceLabel in sources)) continue;

      const isRate = statKey === "population" || statKey === "gdp";
      const total = getTotalForStat(inputs, statKey);
      const totalForDisplay = getTotalForDisplay(expected, countrySnapshot, statKey);
      const external = total - ministry_own;

      const signM = getSign(ministry_own, isRate);
      const signE = getSign(external, isRate);
      const signT = getSign(total, isRate);
      const magnitude = getMagnitudeLevel(statKey, total);

      const weakThresh = isRate ? MAGNITUDE_RATE_WEAK : MAGNITUDE_DELTA_WEAK;
      if (Math.abs(ministry_own) >= weakThresh || Math.abs(total) >= weakThresh) hasSignificantEffect = true;

      let evolutionKey: string;
      const totalDirection = getTotalDirection(totalForDisplay, isRate, total);
      if (signM === "zero") {
        evolutionKey = `conjuncture_ministry_zero_total_${totalDirection}`;
      } else {
        const conjunctureKey = `conjuncture_ministry_${signM}_external_${signE}_total_${signT}`;
        evolutionKey = PHRASE_VARIANTS[conjunctureKey]?.length ? conjunctureKey : (() => {
          const dir = signT === "positive" ? "improve" : signT === "negative" ? "decline" : "neutral";
          if (dir === "neutral") return "no_significant_effect";
          const suffix = magnitudeToLegacySuffix(magnitude);
          return `stat_${dir}_${suffix}`;
        })();
      }

      // Ton selon la direction du résultat net (avec seuil « stable » pour cohérence avec les phrases)
      const toneFromTotal: CabinetParagraphTone =
        totalDirection === "positive" ? "positive" : totalDirection === "negative" ? "negative" : "neutral";

      if (evolutionKey === "no_significant_effect") {
        paragraphs.push({
          text: fillStatSlotWithForms(pickVariant("no_significant_effect", ministryKeys.indexOf(ministryKey) * 3 + ei, seedNum), statKey),
          tone: toneFromTotal,
        });
      } else {
        paragraphs.push({
          text: fillStatSlotWithForms(pickVariant(evolutionKey, ministryKey.length + statKey.length + ei, seedNum), statKey),
          tone: toneFromTotal,
        });
      }

      const gravityInfo = conf.gravity
        ? (inputs[conf.gravity] as Record<string, { base: number; worldAvg: number; countryVal: number }> | undefined)?.[sourceLabel]
        : undefined;
      if (gravityInfo && gravityInfo.worldAvg > 0) {
        const ahead = gravityInfo.countryVal > gravityInfo.worldAvg;
        let gravityKey: string | null = null;
        let gravityTone: CabinetParagraphTone = "neutral";
        if (totalDirection === "negative" && ahead) {
          gravityKey = "gravity_ahead_decline";
          gravityTone = "negative";
        } else if (totalDirection === "positive" && !ahead) {
          gravityKey = "gravity_behind_improve";
          gravityTone = "positive";
        } else if (totalDirection === "positive" && ahead) {
          gravityKey = "gravity_ahead_improve";
          gravityTone = "positive";
        } else if (totalDirection === "negative" && !ahead) {
          gravityKey = "gravity_behind_decline";
          gravityTone = "negative";
        }
        if (gravityKey) {
          paragraphs.push({
            text: pickVariant(gravityKey, ministryKey.length + ei, seedNum),
            tone: gravityTone,
          });
        }
      }
    }

    if (paragraphs.length > 1 || hasSignificantEffect) {
      blocks.push({ ministryKey, ministryLabel, paragraphs });
    }
  }

  return blocks;
}
