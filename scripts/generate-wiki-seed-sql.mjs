/**
 * Génère supabase/migrations/147_seed_wiki_pages.sql à partir du contenu source (ancien WikiDoc).
 * Exécuter : npm run wiki:generate-seed
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

/** Contenu markdown source (ex-contentEditable.json). */
const WIKI_SEED_MARKDOWN = {
  "vue-ensemble": "### Navigation utile\n\nVous incarnez un pays dans un monde qui avance par passages réguliers (ticks). Votre objectif est de lire la situation, définir des priorités et prendre des décisions qui améliorent la position de votre nation.\n\n- **Accueil** : vue rapide des pays et de leurs tendances.\n- **Mon Pays / Pays** : coeur du gameplay, avec onglets de pilotage et d'analyse.\n- **Carte** : lecture géopolitique régionale.\n- **Classement** : comparaison de puissance.\n- **Idéologie** : orientation politique des pays.\n- **Wiki** : guide détaillé, composant par composant.",
  accueil: "### Table des nations : comment la lire vite\n\nL'accueil sert à comparer le monde en quelques secondes et à choisir où concentrer votre attention.\n\n- **Pays / Régime** : identité politique du pays ; cliquez sur le nom pour ouvrir sa fiche complète.\n- **Sphère** : montre les pays sous influence/contrôle de la nation affichée. Utile pour repérer les blocs géopolitiques.\n- **Influence** : poids diplomatique global.\n- **PIB** : puissance économique.\n- **Population** : taille démographique.\n- **Stabilité** : solidité interne du régime.\n\n---\n\n### Variations (vert / rouge)\n\nLes indicateurs avec flèches montrent la tendance depuis le dernier relevé. Vert = progression, rouge = dégradation.\n\n---\n\n### Tri et recherche\n\nTriez par colonne pour trouver les leaders et les retardataires. Utilisez la recherche pour isoler un pays/régime précis.",
  "fiche-pays": "### Vue d'ensemble de la fiche\n\nLa fiche pays est l'écran principal de décision. Les onglets affichés peuvent varier selon que vous consultez un autre pays ou votre pays.\n\n---\n\n### Rapport du Cabinet\n\nLe rapport résume votre situation politique, économique et militaire sur la période en cours.\n\n---\n\n### Généralités\n\nPopulation et PIB décrivent la taille du pays. Les quatre stats (militarisme, industrie, science, stabilité) déterminent une grande partie de ses performances.\n\n- **Militarisme** : capacité de pression militaire.\n- **Industrie** : base productive et soutenabilité.\n- **Science** : vitesse de progression technologique.\n- **Stabilité** : cohésion interne et résilience.\n\n---\n\n### Militaire\n\nPrésente les capacités par branche (terre, air, mer, stratégique) et les unités associées.\n\n---\n\n### Avantages\n\nLes avantages (perks) sont des bonus conditionnés par vos statistiques.\n\n---\n\n### Budget\n\nLe budget d'état est une fraction du PIB que vous répartissez entre ministères.\n\n---\n\n### Lois\n\nChaque loi possède un score actuel et une cible. Le pays évolue progressivement vers le niveau visé.\n\n---\n\n### Actions d'État\n\nLes actions sont regroupées par catégories (interne, diplomatie positive/agressive, opérations secrètes).",
  carte: "### Modes de la carte\n\nLa carte propose deux lectures complémentaires : relations régionales et sphères d'influence.\n\n#### Mode Relations\n\nCouleurs de rouge (hostile) à vert (amical).\n\n#### Mode Sphères\n\nChaque couleur correspond à un pôle dominant ; zones grises = non prises, zones contestées = partage d'influence.\n\n---\n\n### Comment l'exploiter en jeu\n\nUtilisez la carte pour repérer où les tensions montent, où votre influence recule, et quelles régions peuvent devenir des priorités.",
  classement: "### Métriques de classement\n\nLe classement compare les pays par influence, puissance militaire et indicateurs économiques.\n\n#### Onglet Classement\n\nFocus sur l'influence.\n\n#### Onglet Militaire\n\nCompare militarisme et hard power par branche.\n\n#### Onglet Économique\n\nCompare population et PIB.\n\n---\n\n### Évolution de rang\n\nLes flèches indiquent progression ou régression dans le classement.",
  ideologie: "### Lecture du triangle\n\nChaque pays est positionné sur un triangle idéologique. Plus il est proche d'un sommet, plus cette orientation domine.\n\n---\n\n### Pourquoi c'est utile\n\nCette vue aide à anticiper les rapprochements, les frictions et les changements de posture politique.",
  regles: "### Que lire en tant que joueur\n\nLa page [Règles](/regles) permet de comprendre le cadre global de la simulation : ce qui accélère ou freine l'évolution d'un pays.\n\n#### Utilité gameplay\n\nConsultez-la pour mieux interpréter vos résultats (budget, lois, évolution des stats) et adapter vos choix.",
};

const meta = [
  { slug: "vue-ensemble", title: "Vue d'ensemble", shortTitle: "Vue d'ensemble", sort: 0 },
  { slug: "accueil", title: "Accueil — Table des nations", shortTitle: "Accueil", sort: 1 },
  { slug: "fiche-pays", title: "Fiche pays", shortTitle: "Fiche pays", sort: 2 },
  { slug: "carte", title: "Carte", shortTitle: "Carte", sort: 3 },
  { slug: "classement", title: "Classement", shortTitle: "Classement", sort: 4 },
  { slug: "ideologie", title: "Idéologie", shortTitle: "Idéologie", sort: 5 },
  { slug: "regles", title: "Règles", shortTitle: "Règles", sort: 6 },
];

const searchExtra = {
  "vue-ensemble":
    "vue ensemble but simulateur navigation accueil pays carte classement idéologie wiki",
  accueil:
    "accueil table nations pays régime sphère influence PIB population stabilité tri recherche colonnes variation vert rouge fiche pays",
  "fiche-pays":
    "fiche pays onglets rapport cabinet généralités société macros population PIB militarisme industrie science stabilité voisins relations bilatérales idéologie effets actifs durée militaire unités limites hard power renseignement intel brouillard avantages perks conditions budget état ministères plafond allocation loi score objectif niveau mobilisation recherche industrie navale aérienne actions état solde coût cible acceptation validation historique",
  carte:
    "carte relations sphères influence régions légende contesté occupé annexé sélection couleurs",
  classement:
    "classement rang évolution influence militaire hard power terre air mer stratégique économique population PIB",
  ideologie:
    "idéologie triangle filtres positions monarchisme républicanisme cultisme dérive voisins effets",
  regles: "règles paramètres simulation lecture",
};

const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
  Image.configure({ allowBase64: false }),
];

function escapeSqlLiteral(s) {
  return s.replace(/'/g, "''");
}

function jsonToSqlLiteral(obj) {
  return escapeSqlLiteral(JSON.stringify(obj));
}

const lines = [
  "-- Seed wiki : contenu issu de contentEditable.json (généré par scripts/generate-wiki-seed-sql.mjs)",
  "",
  "INSERT INTO public.wiki_pages (parent_id, slug, title, sort_order, content, search_text) VALUES",
];

const values = [];

for (const m of meta) {
  const md = WIKI_SEED_MARKDOWN[m.slug];
  if (!md) {
    console.warn("Missing key", m.slug);
    continue;
  }
  const html = await marked.parse(md, { gfm: true, breaks: true });
  const doc = generateJSON(html, extensions);
  const searchText = `${m.title} ${m.shortTitle} ${searchExtra[m.slug] ?? ""}`.trim();
  values.push(
    `(NULL, '${escapeSqlLiteral(m.slug)}', '${escapeSqlLiteral(m.title)}', ${m.sort}, '${jsonToSqlLiteral(doc)}'::jsonb, '${escapeSqlLiteral(searchText)}')`
  );
}

lines.push(values.join(",\n"));
lines.push("ON CONFLICT (slug) DO NOTHING;");

writeFileSync(join(root, "supabase/migrations/147_seed_wiki_pages.sql"), lines.join("\n"), "utf8");
console.log("Wrote supabase/migrations/147_seed_wiki_pages.sql");
