/**
 * Rapport du Cabinet — génération de textes dynamiques par ministère.
 * Banque de phrases avec variantes, tirage déterministe (graine) pour reproductibilité.
 */

import type { TickBreakdown } from "@/lib/tickBreakdown";
import type { ExpectedNextTickResult, WorldAverages } from "@/lib/expectedNextTick";
import type { CountrySnapshot } from "@/lib/expectedNextTick";
import { BUDGET_MINISTRY_EFFECTS, BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";

/** Seuils de magnitude pour les deltas (stats) : |delta| < weak = faible, < moderate = modéré, sinon fort. */
const MAGNITUDE_DELTA_WEAK = 0.02;
const MAGNITUDE_DELTA_MODERATE = 0.05;

/** Seuils pour les taux (population, PIB) : valeur absolue. */
const MAGNITUDE_RATE_WEAK = 0.001;
const MAGNITUDE_RATE_MODERATE = 0.005;

/** Clé ministère (rule_parameters) → libellé court utilisé dans expected.inputs.budget_*_sources. */
const MINISTRY_TO_SOURCE_LABEL: Record<string, string> = {
  budget_sante: "Santé",
  budget_education: "Éducation",
  budget_recherche: "Recherche",
  budget_infrastructure: "Infrastructure",
  budget_industrie: "Industrie",
  budget_defense: "Défense",
  budget_interieur: "Intérieur",
  budget_affaires_etrangeres: "Affaires étrangères",
};

/** Stat key (BUDGET_MINISTRY_EFFECTS) → clé sources et optionnellement gravity_info dans expected.inputs. */
const STAT_TO_INPUTS_KEY: Record<string, { sources: keyof ExpectedNextTickResult["inputs"]; gravity?: keyof ExpectedNextTickResult["inputs"] }> = {
  population: { sources: "budget_pop_sources" },
  gdp: { sources: "budget_gdp_sources" },
  militarism: { sources: "budget_mil_sources", gravity: "budget_mil_gravity_info" },
  industry: { sources: "budget_ind_sources", gravity: "budget_ind_gravity_info" },
  science: { sources: "budget_sci_sources", gravity: "budget_sci_gravity_info" },
  stability: { sources: "budget_stab_sources" },
};

/** Banque de phrases : clé → tableau de variantes (FR). Ton document officiel / rapport ministériel. */
const PHRASE_VARIANTS: Record<string, string[]> = {
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
    "Aucune évolution notable n’est à signaler pour la période considérée.",
    "La situation reste stable ; aucun changement significatif n’a été enregistré.",
    "Rien de particulier à relever pour ce secteur au cours de la période.",
    "Les indicateurs demeurent stables, sans variation digne de mention.",
    "Aucun effet notable n’est à porter au crédit ou au débit de cette politique pour l’instant.",
    "La situation est inchangée ; le ministère ne relève pas d’évolution marquante.",
    "Pas de changement significatif à signaler pour cette période.",
    "Les données restent stables pour l’indicateur concerné.",
    "Aucune évolution notable n’est constatée dans les rapports des services.",
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

/** Remplace [stat] dans le fragment par le libellé. */
function fillStatSlot(fragment: string, statLabel: string): string {
  return fragment.replace(/\[stat\]/g, statLabel);
}

export type CabinetMinistryBlock = {
  ministryKey: string;
  ministryLabel: string;
  paragraphs: string[];
};

/**
 * Génère les paragraphes du Rapport du Cabinet par ministère.
 * Ordre des idées : financement → évolution de la (des) stat(s) → gravité si pertinent.
 */
export function getCabinetPhrases(
  breakdown: TickBreakdown,
  expected: ExpectedNextTickResult,
  countrySnapshot: CountrySnapshot,
  worldAverages: WorldAverages,
  seed?: number
): CabinetMinistryBlock[] {
  const inputs = expected.inputs;
  const seedNum = seed ?? 0;
  const blocks: CabinetMinistryBlock[] = [];

  const ministryKeys = Object.keys(MINISTRY_TO_SOURCE_LABEL) as string[];
  for (const ministryKey of ministryKeys) {
    const effects = BUDGET_MINISTRY_EFFECTS[ministryKey];
    if (!effects?.length) continue;

    const sourceLabel = MINISTRY_TO_SOURCE_LABEL[ministryKey];
    const ministryLabel = BUDGET_MINISTRY_LABELS[ministryKey] ?? ministryKey;
    const paragraphs: string[] = [];

    let fundingKey: string;
    let hasSignificantEffect = false;
    let fundingSufficient = true;

    for (const { key: statKey } of effects) {
      const conf = STAT_TO_INPUTS_KEY[statKey];
      if (!conf) continue;
      const sources = inputs[conf.sources] as Record<string, number> | undefined;
      const contribution = sources?.[sourceLabel];
      if (contribution == null) continue;

      const absContrib = Math.abs(contribution);
      const isRate = statKey === "population" || statKey === "gdp";
      const weakThresh = isRate ? MAGNITUDE_RATE_WEAK : MAGNITUDE_DELTA_WEAK;
      if (absContrib >= weakThresh) hasSignificantEffect = true;
      if (contribution < 0) fundingSufficient = false;
    }

    fundingKey = fundingSufficient ? "ministry_funding_sufficient" : "ministry_funding_insufficient";
    paragraphs.push(pickVariant(fundingKey, 0, seedNum));

    for (let ei = 0; ei < effects.length; ei++) {
      const { key: statKey, label: statLabel } = effects[ei];
      const conf = STAT_TO_INPUTS_KEY[statKey];
      if (!conf) continue;
      const sources = inputs[conf.sources] as Record<string, number> | undefined;
      const contribution = sources?.[sourceLabel];
      if (contribution == null) continue;

      const absContrib = Math.abs(contribution);
      const isRate = statKey === "population" || statKey === "gdp";
      const weakThresh = isRate ? MAGNITUDE_RATE_WEAK : MAGNITUDE_DELTA_WEAK;
      const modThresh = isRate ? MAGNITUDE_RATE_MODERATE : MAGNITUDE_DELTA_MODERATE;

      const statLabelFr = STAT_LABELS_FR[statKey] ?? statLabel;

      if (absContrib < weakThresh) {
        paragraphs.push(pickVariant("no_significant_effect", ministryKeys.indexOf(ministryKey) * 3 + ei, seedNum));
        continue;
      }

      const magnitude = absContrib < modThresh ? "weak" : absContrib < (isRate ? 0.02 : 0.1) ? "moderate" : "strong";
      const sign = contribution >= 0 ? "improve" : "decline";
      const evolutionKey = `stat_${sign}_${magnitude}`;
      paragraphs.push(fillStatSlot(pickVariant(evolutionKey, ministryKey.length + statKey.length, seedNum), statLabelFr));

      const gravityInfo = conf.gravity
        ? (inputs[conf.gravity] as Record<string, { base: number; worldAvg: number; countryVal: number }> | undefined)?.[sourceLabel]
        : undefined;
      if (gravityInfo && gravityInfo.worldAvg > 0) {
        const ahead = gravityInfo.countryVal > gravityInfo.worldAvg;
        if (contribution < 0 && ahead) {
          paragraphs.push(pickVariant("gravity_ahead_decline", ministryKey.length + ei, seedNum));
        } else if (contribution > 0 && !ahead) {
          paragraphs.push(pickVariant("gravity_behind_improve", ministryKey.length + ei, seedNum));
        } else if (contribution > 0 && ahead) {
          paragraphs.push(pickVariant("gravity_ahead_improve", ministryKey.length + ei, seedNum));
        } else if (contribution < 0 && !ahead) {
          paragraphs.push(pickVariant("gravity_behind_decline", ministryKey.length + ei, seedNum));
        }
      }
    }

    if (paragraphs.length > 1 || hasSignificantEffect) {
      blocks.push({ ministryKey, ministryLabel, paragraphs });
    }
  }

  return blocks;
}
