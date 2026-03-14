/**
 * Index des sections du Wiki pour la sidebar et la recherche.
 * searchText : texte utilisé pour la recherche (titres + mots-clés).
 */

export type WikiSectionId =
  | "vue-ensemble"
  | "accueil"
  | "fiche-pays"
  | "carte"
  | "classement"
  | "ideologie"
  | "regles";

export interface WikiSubsectionMeta {
  id: string;
  shortTitle: string;
}

export interface WikiSectionMeta {
  id: WikiSectionId;
  title: string;
  shortTitle: string;
  /** Mots-clés pour la recherche (titres + thèmes). */
  searchText: string;
  /** Texte visible du corps de la section (pour que la recherche trouve les pages où le mot apparaît). */
  bodySearchText: string;
  /** Ancres h3/h4 affichées comme sous-pages dans le menu (id = ancre, shortTitle = libellé menu). */
  subsections?: WikiSubsectionMeta[];
}

export const WIKI_SECTIONS: WikiSectionMeta[] = [
  {
    id: "vue-ensemble",
    title: "Vue d'ensemble",
    shortTitle: "Vue d'ensemble",
    searchText: "vue ensemble but simulateur navigation accueil pays carte classement idéologie wiki",
    bodySearchText:
      "Vous incarnez un pays dans un monde qui avance par passages réguliers (ticks). Votre objectif est de lire la situation, définir des priorités et prendre des décisions qui améliorent la position de votre nation. Navigation utile Accueil vue rapide des pays et de leurs tendances. Mon Pays Pays cœur du gameplay avec onglets de pilotage et d'analyse. Carte lecture géopolitique régionale. Classement comparaison de puissance. Idéologie orientation politique des pays. Wiki guide détaillé composant par composant.",
    subsections: [{ id: "vue-ensemble-navigation", shortTitle: "Navigation utile" }],
  },
  {
    id: "accueil",
    title: "Accueil — Table des nations",
    shortTitle: "Accueil",
    searchText: "accueil table nations pays régime sphère influence PIB population stabilité tri recherche colonnes variation vert rouge fiche pays",
    bodySearchText:
      "Table des nations comment la lire vite L'accueil sert à comparer le monde en quelques secondes et à choisir où concentrer votre attention. Pays Régime identité politique du pays cliquez sur le nom pour ouvrir sa fiche complète. Sphère montre les pays sous influence contrôle de la nation affichée. Utile pour repérer les blocs géopolitiques. Influence poids diplomatique global. PIB puissance économique. Population taille démographique. Stabilité solidité interne du régime. Variations vert rouge Les indicateurs avec flèches montrent la tendance. Tri et recherche Triez par colonne Utilisez la recherche pour isoler un pays régime précis.",
    subsections: [
      { id: "accueil-colonnes", shortTitle: "Table des nations" },
      { id: "accueil-variations", shortTitle: "Variations (vert / rouge)" },
      { id: "accueil-tri-recherche", shortTitle: "Tri et recherche" },
    ],
  },
  {
    id: "fiche-pays",
    title: "Fiche pays",
    shortTitle: "Fiche pays",
    searchText:
      "fiche pays onglets rapport cabinet généralités société macros population PIB militarisme industrie science stabilité voisins relations bilatérales idéologie effets actifs durée militaire unités limites hard power renseignement intel brouillard avantages perks conditions budget état ministères plafond allocation loi score objectif niveau mobilisation recherche industrie navale aérienne actions état solde coût cible acceptation validation historique",
    bodySearchText:
      "Vue d'ensemble de la fiche La fiche pays est l'écran principal de décision. Rapport du Cabinet Le rapport résume votre situation politique économique militaire. Comment l'utiliser Identifier ce qui se dégrade (flèches vers le bas). Prioriser ensuite Budget Lois et Actions d'État. Comparer le message global du cabinet avec vos objectifs. Généralités Stats et macros Population et PIB décrivent la taille du pays. militarisme industrie science stabilité. Voisins et relations bilatérales. Effets actifs. Idéologie. Militaire terre air mer stratégique unités limites renseignement. Avantages perks. Budget répartition ministères plafond allocation. Attendu au prochain tick. Lois score cible palier. Actions d'État types demandes statuts historique.",
    subsections: [
      { id: "fiche-pays-onglets", shortTitle: "Vue d'ensemble de la fiche" },
      { id: "fiche-pays-rapport-cabinet", shortTitle: "Rapport du Cabinet" },
      { id: "fiche-pays-generalites", shortTitle: "Généralités" },
      { id: "fiche-pays-militaire", shortTitle: "Militaire" },
      { id: "fiche-pays-avantages", shortTitle: "Avantages" },
      { id: "fiche-pays-budget", shortTitle: "Budget" },
      { id: "fiche-pays-lois", shortTitle: "Lois" },
      { id: "fiche-pays-actions-etat", shortTitle: "Actions d'État" },
    ],
  },
  {
    id: "carte",
    title: "Carte",
    shortTitle: "Carte",
    searchText: "carte relations sphères influence régions légende contesté occupé annexé sélection couleurs",
    bodySearchText:
      "Modes de la carte relations régionales sphères d'influence. Mode Relations Couleurs rouge hostile vert amical. Mode Sphères pôle dominant zones grises contestées. Comment l'exploiter repérer tensions influence régions priorités diplomatiques stratégiques.",
    subsections: [
      { id: "carte-modes", shortTitle: "Modes de la carte" },
      { id: "carte-lecture", shortTitle: "Comment l'exploiter" },
    ],
  },
  {
    id: "classement",
    title: "Classement",
    shortTitle: "Classement",
    searchText: "classement rang évolution influence militaire hard power terre air mer stratégique économique population PIB",
    bodySearchText:
      "Métriques de classement compare les pays par influence puissance militaire indicateurs économiques. Onglet Classement influence grandes puissances. Onglet Militaire militarisme hard power terre air mer stratégique pour identifier les écarts de capacités. Onglet Économique population PIB puissances économiques. Évolution de rang flèches progression régression indicateur de dynamique.",
    subsections: [
      { id: "classement-metrics", shortTitle: "Métriques de classement" },
      { id: "classement-evolution", shortTitle: "Évolution de rang" },
    ],
  },
  {
    id: "ideologie",
    title: "Idéologie",
    shortTitle: "Idéologie",
    searchText: "idéologie triangle filtres positions monarchisme républicanisme cultisme dérive voisins effets",
    bodySearchText:
      "Lecture du triangle idéologique positionné sommet orientation domine. Filtres et sélection filtrer affichage sélectionner pays fiche lecture idéologique décisions concrètes. Pourquoi c'est utile anticiper rapprochements frictions changements posture politique.",
    subsections: [
      { id: "ideologie-lecture-triangle", shortTitle: "Lecture du triangle" },
      { id: "ideologie-impact", shortTitle: "Pourquoi c'est utile" },
    ],
  },
  {
    id: "regles",
    title: "Règles",
    shortTitle: "Règles",
    searchText: "règles paramètres simulation lecture",
    bodySearchText:
      "Que lire en tant que joueur page Règles cadre global simulation accélère freine évolution pays. Utilité gameplay interpréter résultats budget lois évolution stats adapter choix cycle du monde.",
    subsections: [{ id: "regles-lecture-joueur", shortTitle: "Que lire en tant que joueur" }],
  },
];

export function getSectionById(id: WikiSectionId): WikiSectionMeta | undefined {
  return WIKI_SECTIONS.find((s) => s.id === id);
}

export function filterSectionsByQuery(query: string): WikiSectionMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return WIKI_SECTIONS;
  const tokens = q.split(/\s+/).filter(Boolean);
  return WIKI_SECTIONS.filter((section) =>
    tokens.every(
      (t) =>
        section.title.toLowerCase().includes(t) ||
        section.searchText.toLowerCase().includes(t) ||
        section.bodySearchText.toLowerCase().includes(t)
    )
  );
}
