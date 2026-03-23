/**
 * Génère la migration des sous-sections wiki (pages enfants avec parent_id).
 * Exécuter : npm run wiki:generate-subsections
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
  Image.configure({ allowBase64: false }),
];

/** Ordre aligné sur l’ancien menu (sections.ts) + contenu markdown par sous-page. */
const SUBSECTIONS = [
  {
    parent: "vue-ensemble",
    slug: "vue-ensemble-navigation",
    title: "Navigation utile",
    sort: 0,
    searchText:
      "Navigation utile vue ensemble accueil pays carte classement idéologie wiki",
    md: "### Navigation utile\n\nVous incarnez un pays dans un monde qui avance par passages réguliers (ticks). Votre objectif est de lire la situation, définir des priorités et prendre des décisions qui améliorent la position de votre nation.\n\n- **Accueil** : vue rapide des pays et de leurs tendances.\n- **Mon Pays / Pays** : coeur du gameplay, avec onglets de pilotage et d'analyse.\n- **Carte** : lecture géopolitique régionale.\n- **Classement** : comparaison de puissance.\n- **Idéologie** : orientation politique des pays.\n- **Wiki** : guide détaillé, composant par composant.",
  },
  {
    parent: "accueil",
    slug: "accueil-colonnes",
    title: "Table des nations",
    sort: 0,
    searchText: "table nations colonnes pays régime sphère influence PIB population stabilité",
    md: "### Table des nations : comment la lire vite\n\nL'accueil sert à comparer le monde en quelques secondes et à choisir où concentrer votre attention.\n\n- **Pays / Régime** : identité politique du pays ; cliquez sur le nom pour ouvrir sa fiche complète.\n- **Sphère** : montre les pays sous influence/contrôle de la nation affichée. Utile pour repérer les blocs géopolitiques.\n- **Influence** : poids diplomatique global.\n- **PIB** : puissance économique.\n- **Population** : taille démographique.\n- **Stabilité** : solidité interne du régime.",
  },
  {
    parent: "accueil",
    slug: "accueil-variations",
    title: "Variations (vert / rouge)",
    sort: 1,
    searchText: "variations vert rouge flèches tendance dernier relevé",
    md: "### Variations (vert / rouge)\n\nLes indicateurs avec flèches montrent la tendance depuis le dernier relevé. Vert = progression, rouge = dégradation.",
  },
  {
    parent: "accueil",
    slug: "accueil-tri-recherche",
    title: "Tri et recherche",
    sort: 2,
    searchText: "tri recherche colonne leaders retardataires pays régime",
    md: "### Tri et recherche\n\nTriez par colonne pour trouver les leaders et les retardataires. Utilisez la recherche pour isoler un pays/régime précis.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-onglets",
    title: "Vue d'ensemble de la fiche",
    sort: 0,
    searchText: "fiche pays onglets écran décision",
    md: "### Vue d'ensemble de la fiche\n\nLa fiche pays est l'écran principal de décision. Les onglets affichés peuvent varier selon que vous consultez un autre pays ou votre pays.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-rapport-cabinet",
    title: "Rapport du Cabinet",
    sort: 1,
    searchText: "rapport cabinet situation politique économique militaire",
    md: "### Rapport du Cabinet\n\nLe rapport résume votre situation politique, économique et militaire sur la période en cours.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-generalites",
    title: "Généralités",
    sort: 2,
    searchText: "généralités population PIB militarisme industrie science stabilité",
    md: "### Généralités\n\nPopulation et PIB décrivent la taille du pays. Les quatre stats (militarisme, industrie, science, stabilité) déterminent une grande partie de ses performances.\n\n- **Militarisme** : capacité de pression militaire.\n- **Industrie** : base productive et soutenabilité.\n- **Science** : vitesse de progression technologique.\n- **Stabilité** : cohésion interne et résilience.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-militaire",
    title: "Militaire",
    sort: 3,
    searchText: "militaire branche terre air mer stratégique unités",
    md: "### Militaire\n\nPrésente les capacités par branche (terre, air, mer, stratégique) et les unités associées.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-avantages",
    title: "Avantages",
    sort: 4,
    searchText: "avantages perks bonus statistiques",
    md: "### Avantages\n\nLes avantages (perks) sont des bonus conditionnés par vos statistiques.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-budget",
    title: "Budget",
    sort: 5,
    searchText: "budget état PIB ministères",
    md: "### Budget\n\nLe budget d'état est une fraction du PIB que vous répartissez entre ministères.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-lois",
    title: "Lois",
    sort: 6,
    searchText: "lois score cible palier",
    md: "### Lois\n\nChaque loi possède un score actuel et une cible. Le pays évolue progressivement vers le niveau visé.",
  },
  {
    parent: "fiche-pays",
    slug: "fiche-pays-actions-etat",
    title: "Actions d'État",
    sort: 7,
    searchText: "actions état diplomatie opérations secrètes",
    md: "### Actions d'État\n\nLes actions sont regroupées par catégories (interne, diplomatie positive/agressive, opérations secrètes).",
  },
  {
    parent: "carte",
    slug: "carte-modes",
    title: "Modes de la carte",
    sort: 0,
    searchText: "carte modes relations sphères influence régions",
    md: "### Modes de la carte\n\nLa carte propose deux lectures complémentaires : relations régionales et sphères d'influence.\n\n#### Mode Relations\n\nCouleurs de rouge (hostile) à vert (amical).\n\n#### Mode Sphères\n\nChaque couleur correspond à un pôle dominant ; zones grises = non prises, zones contestées = partage d'influence.",
  },
  {
    parent: "carte",
    slug: "carte-lecture",
    title: "Comment l'exploiter",
    sort: 1,
    searchText: "carte exploiter tensions influence régions priorités",
    md: "### Comment l'exploiter en jeu\n\nUtilisez la carte pour repérer où les tensions montent, où votre influence recule, et quelles régions peuvent devenir des priorités.",
  },
  {
    parent: "classement",
    slug: "classement-metrics",
    title: "Métriques de classement",
    sort: 0,
    searchText: "classement influence militaire économique onglets",
    md: "### Métriques de classement\n\nLe classement compare les pays par influence, puissance militaire et indicateurs économiques.\n\n#### Onglet Classement\n\nFocus sur l'influence.\n\n#### Onglet Militaire\n\nCompare militarisme et hard power par branche.\n\n#### Onglet Économique\n\nCompare population et PIB.",
  },
  {
    parent: "classement",
    slug: "classement-evolution",
    title: "Évolution de rang",
    sort: 1,
    searchText: "évolution rang flèches progression régression",
    md: "### Évolution de rang\n\nLes flèches indiquent progression ou régression dans le classement.",
  },
  {
    parent: "ideologie",
    slug: "ideologie-lecture-triangle",
    title: "Lecture du triangle",
    sort: 0,
    searchText: "idéologie triangle sommet orientation",
    md: "### Lecture du triangle\n\nChaque pays est positionné sur un triangle idéologique. Plus il est proche d'un sommet, plus cette orientation domine.",
  },
  {
    parent: "ideologie",
    slug: "ideologie-impact",
    title: "Pourquoi c'est utile",
    sort: 1,
    searchText: "idéologie rapprochements frictions posture politique",
    md: "### Pourquoi c'est utile\n\nCette vue aide à anticiper les rapprochements, les frictions et les changements de posture politique.",
  },
  {
    parent: "regles",
    slug: "regles-lecture-joueur",
    title: "Que lire en tant que joueur",
    sort: 0,
    searchText: "règles joueur simulation budget lois stats",
    md: "### Que lire en tant que joueur\n\nLa page [Règles](/regles) permet de comprendre le cadre global de la simulation : ce qui accélère ou freine l'évolution d'un pays.\n\n#### Utilité gameplay\n\nConsultez-la pour mieux interpréter vos résultats (budget, lois, évolution des stats) et adapter vos choix.",
  },
];

function escapeSqlLiteral(s) {
  return s.replace(/'/g, "''");
}

function jsonToSqlLiteral(obj) {
  return escapeSqlLiteral(JSON.stringify(obj));
}

const lines = [
  "-- Sous-sections wiki : pages enfants (parent_id) — généré par scripts/generate-wiki-subsections-sql.mjs",
  "",
];

for (const sub of SUBSECTIONS) {
  const html = await marked.parse(sub.md, { gfm: true, breaks: true });
  const doc = generateJSON(html, extensions);
  const search = `${sub.title} ${sub.searchText}`.trim();
  const ins = `INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text)
SELECT p.id, '${escapeSqlLiteral(sub.slug)}', '${escapeSqlLiteral(sub.title)}', ${sub.sort}, '${jsonToSqlLiteral(doc)}'::jsonb, '${escapeSqlLiteral(search)}'
FROM public.wiki_pages p WHERE p.slug = '${escapeSqlLiteral(sub.parent)}'
ON CONFLICT (slug) DO NOTHING;`;
  lines.push(ins);
  lines.push("");
}

writeFileSync(join(root, "supabase/migrations/148_wiki_subsections_seed.sql"), lines.join("\n"), "utf8");
console.log("Wrote supabase/migrations/148_wiki_subsections_seed.sql (" + SUBSECTIONS.length + " sous-sections)");
