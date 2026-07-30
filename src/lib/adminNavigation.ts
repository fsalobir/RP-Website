import { matchesSearchText } from "@/lib/searchText";

export type AdminNavigationGroupId = "decide" | "world" | "system" | "publish" | "access";
export type AdminCountKey =
  | "countries"
  | "roster"
  | "rules"
  | "players"
  | "perks"
  | "requests"
  | "aiEvents";
export type AdminNavigationIconId =
  | "countries"
  | "roster"
  | "players"
  | "rules"
  | "actions"
  | "requests"
  | "ai"
  | "relations"
  | "discord"
  | "perks"
  | "wiki"
  | "player";

export type AdminNavigationItem = {
  href: string;
  label: string;
  description: string;
  group: AdminNavigationGroupId;
  icon: AdminNavigationIconId;
  keywords: string[];
  countKey?: AdminCountKey;
  countSingular?: string;
  countPlural?: string;
};

export const ADMIN_NAVIGATION_GROUPS: ReadonlyArray<{
  id: AdminNavigationGroupId;
  label: string;
}> = [
  { id: "decide", label: "Décider" },
  { id: "world", label: "Monde" },
  { id: "system", label: "Système de jeu" },
  { id: "publish", label: "Publier" },
  { id: "access", label: "Accès" },
];

export const ADMIN_NAVIGATION_ITEMS: readonly AdminNavigationItem[] = [
  {
    href: "/admin/pays",
    label: "Pays",
    description: "Gérer les nations, leurs données et leur statut dans la partie.",
    group: "world",
    icon: "countries",
    keywords: ["nations", "population", "pib", "budget", "lois", "militaire"],
    countKey: "countries",
    countSingular: "pays",
    countPlural: "pays",
  },
  {
    href: "/admin/roster",
    label: "Unités militaires",
    description: "Définir les unités, leurs niveaux, leur puissance et leur coût.",
    group: "system",
    icon: "roster",
    keywords: ["unités", "armée", "templates", "effectifs", "militaire"],
    countKey: "roster",
    countSingular: "modèle",
    countPlural: "modèles",
  },
  {
    href: "/admin/joueurs",
    label: "Joueurs",
    description: "Créer les accès et attribuer les pays.",
    group: "world",
    icon: "players",
    keywords: ["comptes", "utilisateurs", "assigner", "attribution"],
    countKey: "players",
    countSingular: "joueur",
    countPlural: "joueurs",
  },
  {
    href: "/admin/regles",
    label: "Règles de simulation",
    description: "Régler l’évolution du monde, les lois, l’idéologie et le renseignement.",
    group: "system",
    icon: "rules",
    keywords: ["paramètres", "croissance", "passage", "idéologie", "influence", "espionnage"],
    countKey: "rules",
    countSingular: "paramètre",
    countPlural: "paramètres",
  },
  {
    href: "/admin/actions-etat",
    label: "Actions d’État",
    description: "Définir les actions disponibles, leur coût et leur résultat.",
    group: "system",
    icon: "actions",
    keywords: ["demandes", "jets", "dés", "coûts", "effets", "diplomatie"],
  },
  {
    href: "/admin/demandes",
    label: "Demandes des joueurs",
    description: "Examiner les actions reçues et appliquer une décision.",
    group: "decide",
    icon: "requests",
    keywords: ["tickets", "valider", "accepter", "refuser", "actions"],
    countKey: "requests",
    countSingular: "à examiner",
    countPlural: "à examiner",
  },
  {
    href: "/admin/event-ia",
    label: "Événements IA",
    description: "Examiner ou créer les actions des pays sans joueur.",
    group: "decide",
    icon: "ai",
    keywords: ["événement", "automatique", "génération", "majeure", "mineure"],
    countKey: "aiEvents",
    countSingular: "à examiner",
    countPlural: "à examiner",
  },
  {
    href: "/admin/regles?domaine=diplomatie",
    label: "Relations diplomatiques",
    description: "Comparer et modifier les relations entre les pays.",
    group: "world",
    icon: "relations",
    keywords: ["matrice", "diplomatie", "relations", "alliés", "hostilité"],
  },
  {
    href: "/admin/bot-discord",
    label: "Publications Discord",
    description: "Choisir les événements publiés et leurs salons.",
    group: "publish",
    icon: "discord",
    keywords: ["bot", "messages", "dispatch", "templates", "canaux", "salons"],
  },
  {
    href: "/admin/avantages",
    label: "Avantages",
    description: "Créer les bonus débloqués par les pays.",
    group: "system",
    icon: "perks",
    keywords: ["perks", "bonus", "effets", "conditions", "statistiques"],
    countKey: "perks",
    countSingular: "avantage",
    countPlural: "avantages",
  },
  {
    href: "/admin/wiki",
    label: "Wiki",
    description: "Rédiger et organiser l’aide des joueurs.",
    group: "publish",
    icon: "wiki",
    keywords: ["documentation", "guides", "pages", "aide", "éditeur"],
  },
  {
    href: "/",
    label: "Voir le site joueur",
    description: "Contrôler la partie telle qu’elle apparaît aux joueurs.",
    group: "access",
    icon: "player",
    keywords: ["public", "accueil", "joueur", "site"],
  },
];

export function filterAdminNavigation(query: string): AdminNavigationItem[] {
  return ADMIN_NAVIGATION_ITEMS.filter((item) =>
    matchesSearchText(query, [item.label, item.description, ...item.keywords])
  );
}
