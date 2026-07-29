import { matchesSearchText } from "@/lib/searchText";

export type AdminNavigationGroupId = "world" | "simulation" | "content" | "access";
export type AdminCountKey = "countries" | "roster" | "rules" | "players" | "perks";

export type AdminNavigationItem = {
  href: string;
  label: string;
  description: string;
  group: AdminNavigationGroupId;
  icon: string;
  keywords: string[];
  countKey?: AdminCountKey;
  countSingular?: string;
  countPlural?: string;
};

export const ADMIN_NAVIGATION_GROUPS: ReadonlyArray<{
  id: AdminNavigationGroupId;
  label: string;
}> = [
  { id: "world", label: "Monde" },
  { id: "simulation", label: "Simulation" },
  { id: "content", label: "Contenu" },
  { id: "access", label: "Accès" },
];

export const ADMIN_NAVIGATION_ITEMS: readonly AdminNavigationItem[] = [
  {
    href: "/admin/pays",
    label: "Pays",
    description: "Modifier les données, budgets, lois et paramètres de chaque nation.",
    group: "world",
    icon: "🌍",
    keywords: ["nations", "population", "pib", "budget", "lois", "militaire"],
    countKey: "countries",
    countSingular: "pays",
    countPlural: "pays",
  },
  {
    href: "/admin/roster",
    label: "Unités militaires",
    description: "Définir les modèles d’unités, leurs niveaux, leur puissance et leur coût.",
    group: "world",
    icon: "🛡️",
    keywords: ["unités", "armée", "templates", "effectifs", "militaire"],
    countKey: "roster",
    countSingular: "modèle",
    countPlural: "modèles",
  },
  {
    href: "/admin/joueurs",
    label: "Joueurs",
    description: "Créer les comptes et attribuer un pays à chaque joueur.",
    group: "world",
    icon: "👥",
    keywords: ["comptes", "utilisateurs", "assigner", "attribution"],
    countKey: "players",
    countSingular: "joueur",
    countPlural: "joueurs",
  },
  {
    href: "/admin/regles",
    label: "Règles de simulation",
    description: "Régler l’évolution quotidienne du monde et les calculs automatiques.",
    group: "simulation",
    icon: "⚙️",
    keywords: ["paramètres", "croissance", "cron", "idéologie", "influence", "espionnage"],
    countKey: "rules",
    countSingular: "paramètre",
    countPlural: "paramètres",
  },
  {
    href: "/admin/actions-etat",
    label: "Actions d’État",
    description: "Définir les actions disponibles, leur coût et leurs effets.",
    group: "simulation",
    icon: "🎯",
    keywords: ["demandes", "jets", "dés", "coûts", "effets", "diplomatie"],
  },
  {
    href: "/admin/demandes",
    label: "Demandes des joueurs",
    description: "Examiner les actions envoyées par les joueurs et décider de leur suite.",
    group: "simulation",
    icon: "📥",
    keywords: ["tickets", "valider", "accepter", "refuser", "actions"],
  },
  {
    href: "/admin/event-ia",
    label: "Événements IA",
    description: "Créer ou valider les actions produites pour les pays sans joueur.",
    group: "simulation",
    icon: "🤖",
    keywords: ["event", "automatique", "génération", "majeure", "mineure"],
  },
  {
    href: "/admin/matrice-diplomatique",
    label: "Relations diplomatiques",
    description: "Voir et modifier les relations entre les pays.",
    group: "simulation",
    icon: "🤝",
    keywords: ["matrice", "diplomatie", "relations", "alliés", "hostilité"],
  },
  {
    href: "/admin/bot-discord",
    label: "Publications Discord",
    description: "Choisir quels événements sont publiés et dans quels salons.",
    group: "simulation",
    icon: "📡",
    keywords: ["bot", "messages", "dispatch", "templates", "canaux", "salons"],
  },
  {
    href: "/admin/avantages",
    label: "Avantages",
    description: "Créer les bonus débloqués selon les statistiques d’un pays.",
    group: "content",
    icon: "⭐",
    keywords: ["perks", "bonus", "effets", "conditions", "statistiques"],
    countKey: "perks",
    countSingular: "avantage",
    countPlural: "avantages",
  },
  {
    href: "/admin/wiki",
    label: "Wiki",
    description: "Rédiger et organiser l’aide visible par les joueurs.",
    group: "content",
    icon: "📖",
    keywords: ["documentation", "guides", "pages", "aide", "éditeur"],
  },
  {
    href: "/",
    label: "Voir le site joueur",
    description: "Ouvrir le site tel qu’il est présenté aux joueurs.",
    group: "access",
    icon: "👁️",
    keywords: ["public", "accueil", "joueur", "site"],
  },
];

export function filterAdminNavigation(query: string): AdminNavigationItem[] {
  return ADMIN_NAVIGATION_ITEMS.filter((item) =>
    matchesSearchText(query, [item.label, item.description, ...item.keywords])
  );
}
