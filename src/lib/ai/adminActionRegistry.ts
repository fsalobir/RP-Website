import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_EFFECT_KIND_IDS } from "@/lib/countryEffects";
import type { AdminEffectAdded } from "@/types/database";
import type { AdminPlannedAction, AdminRisk } from "./contracts";

type FieldRule =
  | { type: "uuid"; nullable?: boolean }
  | { type: "string"; max: number; nullable?: boolean }
  | { type: "number"; min: number; max: number; integer?: boolean; nullable?: boolean }
  | { type: "boolean" }
  | { type: "json"; nullable?: boolean }
  | { type: "enum"; values: readonly string[]; nullable?: boolean };

type MutationSpec = {
  id: string;
  label: string;
  description: string;
  risk: AdminRisk;
  mode: "insert" | "update" | "upsert" | "delete";
  table: string;
  keys: Record<string, { column: string; rule: FieldRule }>;
  fields: Record<string, FieldRule>;
  required?: readonly string[];
  onConflict?: string;
  generatedId?: boolean;
  reversible: boolean;
};

type SpecialActionSpec = {
  id: string;
  label: string;
  description: string;
  risk: "isolated";
  fields: Record<string, FieldRule>;
  required?: readonly string[];
};

const uuid = (): FieldRule => ({ type: "uuid" });
const nullableUuid = (): FieldRule => ({ type: "uuid", nullable: true });
const string = (max: number, nullable = false): FieldRule => ({ type: "string", max, nullable });
const number = (min: number, max: number, integer = false): FieldRule => ({ type: "number", min, max, integer });
const json = (nullable = false): FieldRule => ({ type: "json", nullable });
const bool = (): FieldRule => ({ type: "boolean" });
const enumeration = (values: readonly string[], nullable = false): FieldRule => ({ type: "enum", values, nullable });

const countryFields = {
  name: string(120), slug: string(120), regime: string(180, true), flag_url: string(2000, true), continent_id: nullableUuid(),
  militarism: number(0, 10), industry: number(0, 10), science: number(0, 10), stability: number(-3, 3),
  population: number(0, 20_000_000_000, true), gdp: number(0, 1_000_000_000_000_000), growth: number(-100, 100),
  ai_status: enumeration(["major", "minor"], true),
} satisfies Record<string, FieldRule>;

const budgetFields = Object.fromEntries([
  "pct_etat", "pct_education", "pct_recherche", "pct_infrastructure", "pct_sante", "pct_industrie",
  "pct_defense", "pct_interieur", "pct_affaires_etrangeres", "pct_procuration_militaire",
].map((key) => [key, number(0, 100)])) as Record<string, FieldRule>;
budgetFields.budget_fraction = number(0, 1);

const MUTATIONS: readonly MutationSpec[] = [
  {
    id: "country.create", label: "Créer un pays", description: "Crée une nouvelle nation.", risk: "reversible",
    mode: "insert", table: "countries", keys: {}, fields: countryFields,
    required: ["name", "slug", "militarism", "industry", "science", "stability", "population", "gdp"], generatedId: true, reversible: true,
  },
  {
    id: "country.update", label: "Modifier un pays", description: "Modifie l'identité ou les indicateurs d'une nation.", risk: "reversible",
    mode: "update", table: "countries", keys: { countryId: { column: "id", rule: uuid() } }, fields: countryFields, reversible: true,
  },
  {
    id: "country.budget.update", label: "Modifier un budget", description: "Modifie la répartition budgétaire d'un pays.", risk: "reversible",
    mode: "upsert", table: "country_budget", keys: { countryId: { column: "country_id", rule: uuid() } }, fields: budgetFields,
    onConflict: "country_id", reversible: true,
  },
  {
    id: "country.law.update", label: "Modifier une loi", description: "Modifie le score ou la cible d'une loi nationale.", risk: "reversible",
    mode: "upsert", table: "country_laws",
    keys: { countryId: { column: "country_id", rule: uuid() }, lawKey: { column: "law_key", rule: string(80) } },
    fields: { score: number(0, 500, true), target_score: number(0, 500, true) }, onConflict: "country_id,law_key", reversible: true,
  },
  {
    id: "country.effect.create", label: "Ajouter un effet", description: "Ajoute un effet temporaire ou permanent à un pays.", risk: "reversible",
    mode: "insert", table: "country_effects", keys: {}, generatedId: true, reversible: true,
    fields: {
      country_id: uuid(), name: string(180), effect_kind: enumeration(ALL_EFFECT_KIND_IDS), effect_target: string(120, true), effect_subtype: string(120, true),
      value: number(-1_000_000, 1_000_000), duration_kind: enumeration(["days", "updates", "permanent"]), duration_remaining: number(0, 100_000, true),
    }, required: ["country_id", "name", "effect_kind", "value", "duration_kind", "duration_remaining"],
  },
  {
    id: "country.effect.update", label: "Modifier un effet", description: "Modifie un effet existant.", risk: "reversible",
    mode: "update", table: "country_effects", keys: { effectId: { column: "id", rule: uuid() } }, reversible: true,
    fields: {
      name: string(180), effect_kind: enumeration(ALL_EFFECT_KIND_IDS), effect_target: string(120, true), effect_subtype: string(120, true),
      value: number(-1_000_000, 1_000_000), duration_kind: enumeration(["days", "updates", "permanent"]), duration_remaining: number(0, 100_000, true),
    },
  },
  {
    id: "country.effect.delete", label: "Retirer un effet", description: "Supprime un effet identifié.", risk: "reversible",
    mode: "delete", table: "country_effects", keys: { effectId: { column: "id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "country.perk.assign", label: "Attribuer un avantage", description: "Attribue un avantage à un pays.", risk: "reversible",
    mode: "upsert", table: "country_perks",
    keys: { countryId: { column: "country_id", rule: uuid() }, perkId: { column: "perk_id", rule: uuid() } },
    fields: {}, onConflict: "country_id,perk_id", reversible: true,
  },
  {
    id: "country.perk.remove", label: "Retirer un avantage", description: "Retire un avantage d'un pays.", risk: "reversible",
    mode: "delete", table: "country_perks",
    keys: { countryId: { column: "country_id", rule: uuid() }, perkId: { column: "perk_id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "country.military.update", label: "Modifier une unité nationale", description: "Modifie le niveau, le nombre ou les réserves d'une unité nationale.", risk: "reversible",
    mode: "upsert", table: "country_military_units",
    keys: { countryId: { column: "country_id", rule: uuid() }, rosterUnitId: { column: "roster_unit_id", rule: uuid() } },
    fields: {
      current_level: number(0, 100_000, true), extra_count: number(0, 1_000_000, true),
    }, required: ["current_level", "extra_count"], onConflict: "country_id,roster_unit_id", reversible: true,
  },
  {
    id: "country.focus.update", label: "Modifier l'état-major", description: "Modifie les quatre priorités d'état-major d'un pays.", risk: "reversible",
    mode: "upsert", table: "country_etat_major_focus", keys: { countryId: { column: "country_id", rule: uuid() } },
    fields: {
      design_roster_unit_id: nullableUuid(), recrutement_roster_unit_id: nullableUuid(),
      procuration_roster_unit_id: nullableUuid(), stock_roster_unit_id: nullableUuid(),
    }, onConflict: "country_id", reversible: true,
  },
  {
    id: "country.control.create", label: "Ajouter un contrôle", description: "Ajoute une part de contrôle entre deux pays.", risk: "reversible",
    mode: "insert", table: "country_control", keys: {}, generatedId: true, reversible: true,
    fields: { country_id: uuid(), controller_country_id: uuid(), share_pct: number(0, 100), is_annexed: bool() },
    required: ["country_id", "controller_country_id", "share_pct", "is_annexed"],
  },
  {
    id: "country.control.update", label: "Modifier un contrôle", description: "Modifie une part de contrôle existante.", risk: "reversible",
    mode: "update", table: "country_control", keys: { controlId: { column: "id", rule: uuid() } },
    fields: { controller_country_id: uuid(), share_pct: number(0, 100), is_annexed: bool() }, reversible: true,
  },
  {
    id: "country.control.delete", label: "Retirer un contrôle", description: "Retire une part de contrôle.", risk: "reversible",
    mode: "delete", table: "country_control", keys: { controlId: { column: "id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "relation.update", label: "Modifier une relation", description: "Définit la relation bilatérale entre deux pays.", risk: "reversible",
    mode: "upsert", table: "country_relations",
    keys: { countryAId: { column: "country_a_id", rule: uuid() }, countryBId: { column: "country_b_id", rule: uuid() } },
    fields: { value: number(-100, 100, true) }, required: ["value"], onConflict: "country_a_id,country_b_id", reversible: true,
  },
  {
    id: "player.assign", label: "Assigner un joueur", description: "Change le pays assigné à un joueur.", risk: "reversible",
    mode: "update", table: "country_players", keys: { userId: { column: "user_id", rule: uuid() } },
    fields: { country_id: uuid() }, required: ["country_id"], reversible: true,
  },
  {
    id: "player.rename", label: "Renommer un joueur", description: "Change le nom affiché d'un joueur.", risk: "reversible",
    mode: "update", table: "country_players", keys: { userId: { column: "user_id", rule: uuid() } },
    fields: { name: string(120, true) }, reversible: true,
  },
  {
    id: "rule.update", label: "Modifier une règle", description: "Modifie une règle existante avec contrôle de concurrence.", risk: "reversible",
    mode: "update", table: "rule_parameters", keys: { ruleId: { column: "id", rule: uuid() } },
    fields: { key: string(120), value: json(), description: string(1000, true) }, reversible: true,
  },
  {
    id: "state_action_type.update", label: "Modifier une action d'État", description: "Modifie le libellé, coût ou paramétrage d'une action d'État.", risk: "reversible",
    mode: "update", table: "state_action_types", keys: { actionTypeId: { column: "id", rule: uuid() } },
    fields: { key: string(100), label_fr: string(180), cost: number(0, 1_000_000, true), params_schema: json(), sort_order: number(-10_000, 10_000, true) }, reversible: true,
  },
  {
    id: "roster.unit.create", label: "Créer une unité de référence", description: "Crée un type d'unité militaire.", risk: "reversible",
    mode: "insert", table: "military_roster_units", keys: {}, generatedId: true, reversible: true,
    fields: {
      branch: enumeration(["terre", "air", "mer", "strategique"]), sub_type: string(80, true), name_fr: string(180), icon_url: string(2000, true),
      level_count: number(1, 10, true), base_count: number(0, 1_000_000, true), sort_order: number(-10_000, 10_000, true),
    }, required: ["branch", "name_fr", "level_count", "base_count", "sort_order"],
  },
  {
    id: "roster.unit.update", label: "Modifier une unité de référence", description: "Modifie un type d'unité militaire.", risk: "reversible",
    mode: "update", table: "military_roster_units", keys: { rosterUnitId: { column: "id", rule: uuid() } }, reversible: true,
    fields: {
      branch: enumeration(["terre", "air", "mer", "strategique"]), sub_type: string(80, true), name_fr: string(180), icon_url: string(2000, true),
      level_count: number(1, 10, true), base_count: number(0, 1_000_000, true), sort_order: number(-10_000, 10_000, true),
    },
  },
  {
    id: "roster.unit.delete", label: "Supprimer une unité de référence", description: "Supprime un type d'unité militaire et ses niveaux.", risk: "isolated",
    mode: "delete", table: "military_roster_units", keys: { rosterUnitId: { column: "id", rule: uuid() } }, fields: {}, reversible: false,
  },
  {
    id: "roster.level.save", label: "Enregistrer un niveau d'unité", description: "Crée ou modifie un niveau d'unité de référence.", risk: "reversible",
    mode: "upsert", table: "military_roster_unit_levels",
    keys: { unitId: { column: "unit_id", rule: uuid() }, level: { column: "level", rule: number(1, 100, true) } },
    fields: {
      manpower: number(0, 100_000_000, true), hard_power: number(0, 1_000_000_000),
      mobilization_cost: number(0, 1_000_000_000), science_required: number(0, 1_000_000),
    }, onConflict: "unit_id,level", reversible: true,
  },
  {
    id: "roster.level.delete", label: "Supprimer un niveau d'unité", description: "Supprime un niveau d'unité de référence.", risk: "reversible",
    mode: "delete", table: "military_roster_unit_levels", keys: { levelId: { column: "id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "roster.level.update", label: "Modifier un niveau d'unité", description: "Modifie les statistiques d'un niveau d'unité.", risk: "reversible",
    mode: "update", table: "military_roster_unit_levels", keys: { levelId: { column: "id", rule: uuid() } }, reversible: true,
    fields: {
      level: number(1, 100, true), manpower: number(0, 100_000_000, true), hard_power: number(0, 1_000_000_000),
      mobilization_cost: number(0, 1_000_000_000), science_required: number(0, 1_000_000),
    },
  },
  {
    id: "perk.category.create", label: "Créer une catégorie d'avantages", description: "Crée une catégorie d'avantages.", risk: "reversible",
    mode: "insert", table: "perk_categories", keys: {}, generatedId: true, reversible: true,
    fields: { name_fr: string(180), sort_order: number(-10_000, 10_000, true) }, required: ["name_fr", "sort_order"],
  },
  {
    id: "perk.category.update", label: "Modifier une catégorie d'avantages", description: "Modifie une catégorie d'avantages.", risk: "reversible",
    mode: "update", table: "perk_categories", keys: { categoryId: { column: "id", rule: uuid() } },
    fields: { name_fr: string(180), sort_order: number(-10_000, 10_000, true) }, reversible: true,
  },
  {
    id: "perk.category.delete", label: "Supprimer une catégorie d'avantages", description: "Supprime une catégorie vide.", risk: "isolated",
    mode: "delete", table: "perk_categories", keys: { categoryId: { column: "id", rule: uuid() } }, fields: {}, reversible: false,
  },
  {
    id: "perk.create", label: "Créer un avantage", description: "Crée la définition générale d'un avantage.", risk: "reversible",
    mode: "insert", table: "perks", keys: {}, generatedId: true, reversible: true,
    fields: {
      name_fr: string(180), description_fr: string(4000, true), modifier: string(1000, true),
      min_militarism: number(0, 10, true), min_industry: number(0, 10, true), min_science: number(0, 10, true), min_stability: number(-3, 3, true),
      sort_order: number(-10_000, 10_000, true), category_id: nullableUuid(), icon_url: string(2000, true), icon_size: number(16, 256, true),
    }, required: ["name_fr"],
  },
  {
    id: "perk.update", label: "Modifier un avantage", description: "Modifie la définition générale d'un avantage.", risk: "reversible",
    mode: "update", table: "perks", keys: { perkId: { column: "id", rule: uuid() } }, reversible: true,
    fields: {
      name_fr: string(180), description_fr: string(4000, true), modifier: string(1000, true),
      min_militarism: number(0, 10, true), min_industry: number(0, 10, true), min_science: number(0, 10, true), min_stability: number(-3, 3, true),
      sort_order: number(-10_000, 10_000, true), category_id: nullableUuid(), icon_url: string(2000, true), icon_size: number(16, 256, true),
    },
  },
  {
    id: "perk.delete", label: "Supprimer un avantage", description: "Supprime un avantage et ses conditions.", risk: "isolated",
    mode: "delete", table: "perks", keys: { perkId: { column: "id", rule: uuid() } }, fields: {}, reversible: false,
  },
  {
    id: "perk.effect.create", label: "Ajouter un effet d'avantage", description: "Ajoute un effet à un avantage.", risk: "reversible",
    mode: "insert", table: "perk_effects", keys: {}, generatedId: true, reversible: true,
    fields: { perk_id: uuid(), effect_kind: enumeration(ALL_EFFECT_KIND_IDS), effect_target: string(120, true), effect_subtype: string(120, true), value: number(-1_000_000, 1_000_000) },
    required: ["perk_id", "effect_kind", "value"],
  },
  {
    id: "perk.effect.update", label: "Modifier un effet d'avantage", description: "Modifie un effet d'avantage.", risk: "reversible",
    mode: "update", table: "perk_effects", keys: { effectId: { column: "id", rule: uuid() } }, reversible: true,
    fields: { effect_kind: enumeration(ALL_EFFECT_KIND_IDS), effect_target: string(120, true), effect_subtype: string(120, true), value: number(-1_000_000, 1_000_000) },
  },
  {
    id: "perk.effect.delete", label: "Supprimer un effet d'avantage", description: "Supprime un effet d'avantage.", risk: "reversible",
    mode: "delete", table: "perk_effects", keys: { effectId: { column: "id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "perk.requirement.create", label: "Ajouter une condition d'avantage", description: "Ajoute une condition de déblocage.", risk: "reversible",
    mode: "insert", table: "perk_requirements", keys: {}, generatedId: true, reversible: true,
    fields: { perk_id: uuid(), requirement_kind: enumeration(["stat", "gdp", "population", "influence", "law_level"]), requirement_target: string(120, true), value: number(-1_000_000, 1_000_000) },
    required: ["perk_id", "requirement_kind", "value"],
  },
  {
    id: "perk.requirement.update", label: "Modifier une condition d'avantage", description: "Modifie une condition de déblocage.", risk: "reversible",
    mode: "update", table: "perk_requirements", keys: { requirementId: { column: "id", rule: uuid() } }, reversible: true,
    fields: { requirement_kind: enumeration(["stat", "gdp", "population", "influence", "law_level"]), requirement_target: string(120, true), value: number(-1_000_000, 1_000_000) },
  },
  {
    id: "perk.requirement.delete", label: "Supprimer une condition d'avantage", description: "Supprime une condition de déblocage.", risk: "reversible",
    mode: "delete", table: "perk_requirements", keys: { requirementId: { column: "id", rule: uuid() } }, fields: {}, reversible: true,
  },
  {
    id: "wiki.create", label: "Créer une page Wiki", description: "Crée une page Wiki préparée et indexée.", risk: "reversible",
    mode: "insert", table: "wiki_pages", keys: {}, generatedId: true, reversible: true,
    fields: { title: string(180), slug: string(180), content: json(), search_text: string(100_000), parent_id: nullableUuid(), sort_order: number(-10_000, 10_000, true) },
    required: ["title", "slug", "content", "search_text", "parent_id", "sort_order"],
  },
  {
    id: "wiki.update", label: "Modifier une page Wiki", description: "Modifie une page Wiki existante.", risk: "reversible",
    mode: "update", table: "wiki_pages", keys: { pageId: { column: "id", rule: uuid() } }, reversible: true,
    fields: { title: string(180), slug: string(180), content: json(), search_text: string(100_000), parent_id: nullableUuid(), sort_order: number(-10_000, 10_000, true) },
  },
  {
    id: "wiki.delete", label: "Supprimer une page Wiki", description: "Supprime une page Wiki et ses sous-pages.", risk: "isolated",
    mode: "delete", table: "wiki_pages", keys: { pageId: { column: "id", rule: uuid() } }, fields: {}, reversible: false,
  },
];

const SPECIAL_ACTIONS: readonly SpecialActionSpec[] = [
  { id: "country.delete", label: "Supprimer un pays", description: "Supprime un pays et ses données liées.", risk: "isolated", fields: { countryId: uuid() }, required: ["countryId"] },
  { id: "player.delete", label: "Supprimer un joueur", description: "Supprime l'accès joueur et son compte.", risk: "isolated", fields: { userId: uuid() }, required: ["userId"] },
  { id: "player.add_state_actions", label: "Ajouter des actions d'État", description: "Ajoute des points d'action à un pays.", risk: "isolated", fields: { countryId: uuid(), amount: number(1, 100_000, true) }, required: ["countryId"] },
  { id: "request.accept", label: "Accepter une demande", description: "Applique les conséquences puis accepte une demande joueur.", risk: "isolated", fields: { requestId: uuid() }, required: ["requestId"] },
  { id: "request.refuse", label: "Refuser une demande", description: "Refuse une demande et peut rembourser son coût.", risk: "isolated", fields: { requestId: uuid(), refund: bool(), message: string(1000) }, required: ["requestId"] },
  { id: "request.roll", label: "Lancer un jet", description: "Effectue un jet d100 pour une demande.", risk: "isolated", fields: { requestId: uuid(), rollType: enumeration(["success", "impact"]), modifiers: json() }, required: ["requestId", "rollType"] },
  { id: "request.remove_impact", label: "Retirer un jet d'impact", description: "Retire le jet d'impact d'une demande en attente.", risk: "isolated", fields: { requestId: uuid() }, required: ["requestId"] },
  { id: "world.reset_country_stats", label: "Réinitialiser les pays", description: "Réinitialise les indicateurs de toutes les nations.", risk: "isolated", fields: {} },
  { id: "world.run_daily_update", label: "Passer la journée", description: "Exécute le passage de journée du monde.", risk: "isolated", fields: {} },
  { id: "world.randomize_budgets", label: "Randomiser les budgets", description: "Répartit aléatoirement les budgets nationaux.", risk: "isolated", fields: {} },
  { id: "world.randomize_ideologies", label: "Randomiser les idéologies", description: "Randomise les idéologies des pays.", risk: "isolated", fields: {} },
  { id: "world.reset_relations", label: "Réinitialiser les relations", description: "Supprime toutes les relations bilatérales.", risk: "isolated", fields: {} },
  { id: "world.randomize_relations", label: "Randomiser les relations", description: "Randomise toutes les relations bilatérales.", risk: "isolated", fields: {} },
  { id: "world.recompute_neighbors", label: "Recalculer les voisinages", description: "Recalcule les voisinages depuis la carte.", risk: "isolated", fields: {} },
  { id: "discord.sync", label: "Synchroniser Discord", description: "Programme une synchronisation Discord.", risk: "isolated", fields: {} },
  { id: "discord.delivery", label: "Relancer une publication Discord", description: "Programme le renvoi ou la suppression d'une publication.", risk: "isolated", fields: { actionId: uuid(), articleId: uuid(), operation: enumeration(["resend", "delete"]) }, required: ["actionId", "articleId", "operation"] },
  { id: "request.effect.update", label: "Préparer les effets d'une demande", description: "Remplace les effets proposés avant décision.", risk: "isolated", fields: { requestId: uuid(), effects: json(true) }, required: ["requestId", "effects"] },
  { id: "history.restore_change", label: "Restaurer une modification historique", description: "Utilise la restauration existante d'une entrée du journal admin.", risk: "isolated", fields: { changeId: uuid() }, required: ["changeId"] },
  { id: "wiki.move", label: "Déplacer une page Wiki", description: "Échange l'ordre d'une page Wiki avec sa voisine.", risk: "isolated", fields: { pageId: uuid(), direction: enumeration(["up", "down"]), expectedUpdatedAt: string(64) }, required: ["pageId", "direction", "expectedUpdatedAt"] },
  { id: "rp.action.create", label: "Créer une action RP", description: "Crée une action RP manuelle dans le moteur.", risk: "isolated", fields: { country_id: uuid(), action_type_id: uuid(), target_country_id: nullableUuid(), importance: enumeration(["minor", "major"]), intent: string(500), stakes: string(1000), mj_notes: string(1000), parent_action_id: nullableUuid(), effects_json: json() }, required: ["country_id", "action_type_id", "importance", "intent"] },
  { id: "rp.action.effects", label: "Modifier les conséquences RP", description: "Remplace les conséquences préparées d'une action RP.", risk: "isolated", fields: { action_id: uuid(), effects_json: json() }, required: ["action_id", "effects_json"] },
  { id: "rp.job.retry", label: "Relancer une tâche RP", description: "Relance une tâche en échec du moteur RP.", risk: "isolated", fields: { job_id: uuid() }, required: ["job_id"] },
  { id: "rp.action.decide", label: "Décider une action RP", description: "Approuve ou rejette une action RP.", risk: "isolated", fields: { action_id: uuid(), decision: enumeration(["approved", "rejected"]) }, required: ["action_id", "decision"] },
  { id: "rp.action.change_roll", label: "Changer un jet RP", description: "Prépare un nouveau jet avec contrôle de version.", risk: "isolated", fields: { action_id: uuid(), roll: number(1, 100, true), expected_version: number(0, 1_000_000, true) }, required: ["action_id", "roll", "expected_version"] },
  { id: "rp.article.review", label: "Valider un article RP", description: "Enregistre le titre, le résumé et les sections relus.", risk: "isolated", fields: { article_id: uuid(), title: string(180), description: string(3500), sections: json() }, required: ["article_id", "title", "description", "sections"] },
  { id: "discord.route.update", label: "Modifier une route Discord", description: "Active ou désactive la lecture et la publication d'une route.", risk: "isolated", fields: { route_id: uuid(), ingest_enabled: bool(), publish_enabled: bool() }, required: ["route_id", "ingest_enabled", "publish_enabled"] },
  { id: "discord.route.create", label: "Créer une route Discord", description: "Crée une route de lecture ou publication Discord.", risk: "isolated", fields: { scope_type: enumeration(["country", "action_type", "continent", "default"]), scope_value: string(64, true), discord_channel_id: string(25), discord_guild_id: string(25), label: string(100), webhook_secret_name: string(100, true), ingest_enabled: bool(), publish_enabled: bool(), channel_kind: enumeration(["national", "international"]), source_authority: enumeration(["official", "player"]) }, required: ["scope_type", "discord_channel_id", "discord_guild_id", "label", "ingest_enabled", "publish_enabled", "channel_kind", "source_authority"] },
  { id: "rp.automation.update", label: "Modifier une automatisation RP", description: "Modifie les règles d'automatisation d'un type d'action.", risk: "isolated", fields: { action_type_id: uuid(), config: json() }, required: ["action_type_id", "config"] },
  { id: "rp.article.classify", label: "Classer un article RP", description: "Définit l'autorité, les pays et les tags d'un article.", risk: "isolated", fields: { article_id: uuid(), source_kind: enumeration(["mj", "official", "player"]), author_country_id: nullableUuid(), target_country_id: nullableUuid(), mentioned_country_ids: json(), tag_keys: json() }, required: ["article_id", "source_kind", "mentioned_country_ids", "tag_keys"] },
  { id: "discord.country_mapping", label: "Modifier une identité Discord", description: "Associe un rôle et un utilisateur Discord à un pays.", risk: "isolated", fields: { country_id: uuid(), discord_role_id: string(25, true), discord_user_id: string(25, true) }, required: ["country_id"] },
  { id: "rp.staff.update", label: "Modifier l'équipe RP", description: "Ajoute ou retire un membre de l'équipe RP.", risk: "isolated", fields: { user_id: uuid(), enabled: bool() }, required: ["user_id", "enabled"] },
  { id: "rp.pipeline.toggle", label: "Activer le moteur RP", description: "Active ou désactive le moteur RP.", risk: "isolated", fields: { enabled: bool() }, required: ["enabled"] },
];

export type PreparedAdminAction = {
  actionId: string;
  risk: AdminRisk;
  reversible: boolean;
  parameters: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  expectedHash: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalide.`);
  return value as Record<string, unknown>;
}

function cleanValue(value: unknown, rule: FieldRule, label: string): unknown {
  if (value === null && "nullable" in rule && rule.nullable) return null;
  if (rule.type === "uuid") {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${label} invalide.`);
    return value;
  }
  if (rule.type === "string") {
    if (typeof value !== "string" || value.length > rule.max) throw new Error(`${label} invalide.`);
    return value.trim();
  }
  if (rule.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < rule.min || parsed > rule.max || (rule.integer && !Number.isInteger(parsed))) throw new Error(`${label} invalide.`);
    return parsed;
  }
  if (rule.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${label} invalide.`);
    return value;
  }
  if (rule.type === "enum") {
    if (typeof value !== "string" || !rule.values.includes(value)) throw new Error(`${label} invalide.`);
    return value;
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 100_000) throw new Error(`${label} est trop volumineux.`);
  return JSON.parse(serialized) as unknown;
}

function validateMutation(spec: MutationSpec, raw: Record<string, unknown>): {
  where: Record<string, unknown>;
  values: Record<string, unknown>;
  parameters: Record<string, unknown>;
} {
  const allowedTop = new Set([...Object.keys(spec.keys), "values", "expectedUpdatedAt"]);
  if (Object.keys(raw).some((key) => !allowedTop.has(key))) throw new Error(`Paramètre non autorisé pour ${spec.id}.`);
  const where: Record<string, unknown> = {};
  const parameters: Record<string, unknown> = {};
  for (const [parameter, key] of Object.entries(spec.keys)) {
    const value = cleanValue(raw[parameter], key.rule, parameter);
    where[key.column] = value;
    parameters[parameter] = value;
  }
  if (raw.expectedUpdatedAt !== undefined && raw.expectedUpdatedAt !== null) {
    parameters.expectedUpdatedAt = cleanValue(raw.expectedUpdatedAt, string(64), "expectedUpdatedAt");
  }
  const submitted = spec.mode === "delete" ? {} : object(raw.values ?? {}, "Valeurs");
  if (Object.keys(submitted).some((key) => !(key in spec.fields))) throw new Error(`Champ non autorisé pour ${spec.id}.`);
  const values = Object.fromEntries(Object.entries(submitted).map(([key, value]) => [key, cleanValue(value, spec.fields[key], key)]));
  for (const required of spec.required ?? []) {
    if (!(required in values)) throw new Error(`Le champ ${required} est requis.`);
  }
  if ((spec.mode === "update" || spec.mode === "insert" || (spec.mode === "upsert" && Object.keys(spec.fields).length > 0))
      && Object.keys(values).length === 0) throw new Error("Aucune valeur à modifier.");
  if (spec.id === "country.control.create" && values.country_id === values.controller_country_id) throw new Error("Un pays ne peut pas se contrôler lui-même.");
  if ((spec.id === "country.create" || spec.id === "country.update") && values.slug !== undefined
      && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(values.slug))) throw new Error("Slug de pays invalide.");
  if ((spec.id === "wiki.create" || spec.id === "wiki.update") && values.slug !== undefined
      && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(values.slug))) throw new Error("Slug Wiki invalide.");
  for (const field of ["name", "name_fr", "title"]) {
    if (field in values && !String(values[field])) throw new Error(`Le champ ${field} ne peut pas être vide.`);
  }
  if (spec.id === "relation.update") {
    if (where.country_a_id === where.country_b_id) throw new Error("Une relation exige deux pays différents.");
    if (String(where.country_a_id) > String(where.country_b_id)) {
      [where.country_a_id, where.country_b_id] = [where.country_b_id, where.country_a_id];
      parameters.countryAId = where.country_a_id;
      parameters.countryBId = where.country_b_id;
    }
  }
  if (spec.mode !== "delete") parameters.values = values;
  return { where, values, parameters };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => `${JSON.stringify(key)}:${stable(row)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashSnapshot(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function validateSpecial(spec: SpecialActionSpec, raw: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(raw).some((key) => !(key in spec.fields))) throw new Error(`Paramètre non autorisé pour ${spec.id}.`);
  for (const required of spec.required ?? []) {
    if (raw[required] === undefined) throw new Error(`Le paramètre ${required} est requis.`);
  }
  const parameters = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, cleanValue(value, spec.fields[key], key)]));
  if (spec.id === "request.roll" && parameters.modifiers !== undefined) {
    if (!Array.isArray(parameters.modifiers) || parameters.modifiers.length > 20
        || parameters.modifiers.some((modifier) => {
          if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) return true;
          const row = modifier as Record<string, unknown>;
          return Object.keys(row).some((key) => key !== "label" && key !== "value")
            || typeof row.label !== "string" || row.label.length < 1 || row.label.length > 100
            || !Number.isFinite(Number(row.value)) || Number(row.value) < -10_000 || Number(row.value) > 10_000;
        })) throw new Error("Modificateurs de jet invalides.");
  }
  if (spec.id === "request.effect.update") {
    if (parameters.effects === null) return parameters;
    const rows = objectArray(parameters.effects, 16, "Effets");
    const allowed = new Set(["name", "effect_kind", "effect_target", "effect_subtype", "value", "duration_kind", "duration_remaining", "application", "scope"]);
    parameters.effects = rows.map((row) => {
      if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error("Champ d'effet non autorisé.");
      return {
        name: cleanValue(row.name, string(180), "name"),
        effect_kind: cleanValue(row.effect_kind, enumeration(ALL_EFFECT_KIND_IDS), "effect_kind"),
        effect_target: cleanValue(row.effect_target ?? null, string(120, true), "effect_target"),
        effect_subtype: cleanValue(row.effect_subtype ?? null, string(120, true), "effect_subtype"),
        value: cleanValue(row.value, number(-1000, 1000), "value"),
        duration_kind: cleanValue(row.duration_kind, enumeration(["days", "updates", "permanent"]), "duration_kind"),
        duration_remaining: cleanValue(row.duration_remaining, number(0, 100, true), "duration_remaining"),
        application: cleanValue(row.application ?? "duration", enumeration(["duration", "immediate"]), "application"),
        scope: cleanValue(row.scope ?? "emitter", enumeration(["emitter", "target"]), "scope"),
      } as AdminEffectAdded;
    });
  }
  if (spec.id === "rp.action.create" || spec.id === "rp.action.effects") {
    const key = "effects_json";
    parameters[key] = objectArray(parameters[key] ?? [], 16, "Conséquences");
    if (JSON.stringify(parameters[key]).length > 50_000) throw new Error("La liste des conséquences est trop volumineuse.");
  }
  if (spec.id === "rp.article.review") {
    if (String(parameters.description).length < 100) throw new Error("L'article doit contenir au moins 100 caractères.");
    parameters.sections = objectArray(parameters.sections, 25, "Sections").map((row) => {
      if (Object.keys(row).some((key) => key !== "title" && key !== "body")) throw new Error("Champ de section non autorisé.");
      return {
        title: cleanValue(row.title, string(180), "section.title"),
        body: cleanValue(row.body, string(20_000), "section.body"),
      };
    });
    if ((parameters.sections as Array<{ title: string; body: string }>).some((row) => !row.title || !row.body)) throw new Error("Chaque section doit avoir un titre et un contenu.");
  }
  if (spec.id === "discord.route.create") {
    const discordId = /^\d{15,25}$/;
    if (!discordId.test(String(parameters.discord_channel_id)) || !discordId.test(String(parameters.discord_guild_id))) throw new Error("Identifiant Discord invalide.");
    if (parameters.scope_type !== "default") parameters.scope_value = cleanValue(parameters.scope_value, uuid(), "scope_value");
    else if (parameters.scope_value) throw new Error("La route Discord par défaut ne doit pas avoir de portée.");
    if (!parameters.ingest_enabled && !parameters.publish_enabled) throw new Error("Activez la lecture ou la publication Discord.");
    if (parameters.publish_enabled && !parameters.webhook_secret_name) throw new Error("Le nom du secret webhook est requis pour publier.");
    if (parameters.webhook_secret_name && !/^[A-Z][A-Z0-9_]*$/.test(String(parameters.webhook_secret_name))) throw new Error("Nom de secret invalide.");
  }
  if (spec.id === "discord.country_mapping") {
    const discordId = /^\d{15,25}$/;
    for (const key of ["discord_role_id", "discord_user_id"]) {
      if (parameters[key] && !discordId.test(String(parameters[key]))) throw new Error(`Identifiant Discord ${key} invalide.`);
    }
  }
  if (spec.id === "rp.article.classify") {
    parameters.mentioned_country_ids = stringArray(parameters.mentioned_country_ids, 50, uuid(), "Pays mentionnés");
    parameters.tag_keys = stringArray(parameters.tag_keys, 20, string(80), "Tags");
    if ((parameters.tag_keys as string[]).some((tag) => !/^[a-z0-9_-]+$/i.test(tag))) throw new Error("Tag d'article invalide.");
  }
  if (spec.id === "rp.automation.update") parameters.config = automationConfig(parameters.config);
  return parameters;
}

function objectArray(value: unknown, max: number, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error(`${label} invalides.`);
  }
  return value as Record<string, unknown>[];
}

function stringArray(value: unknown, max: number, rule: FieldRule, label: string): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} invalides.`);
  return value.map((item) => cleanValue(item, rule, label) as string);
}

function automationConfig(value: unknown): Record<string, unknown> {
  const raw = object(value, "Configuration d'automatisation");
  const rules: Record<string, FieldRule> = {
    enabled_for_major: bool(), enabled_for_minor: bool(), weight: number(0.01, 1000), requires_target: bool(),
    cooldown_hours: number(0, 87_600), roll_mode: enumeration(["auto", "mj"]), validation_mode: enumeration(["auto", "mj"]),
    publish_failures: bool(), article_profile: enumeration(["brief", "standard", "dossier"]), max_context_articles: number(1, 8, true),
    context_window_rp_months: number(1, 120, true), discord_destination: enumeration(["national", "international"]),
    emitter_min_stability: number(-3, 3), emitter_max_stability: number(-3, 3), target_min_stability: number(-3, 3), target_max_stability: number(-3, 3),
    emitter_min_militarism: number(0, 10), emitter_max_militarism: number(0, 10), target_min_militarism: number(0, 10), target_max_militarism: number(0, 10),
    min_relation: number(-100, 100), max_relation: number(-100, 100), continent_rule: enumeration(["any", "same", "different"]),
  };
  if (Object.keys(raw).some((key) => !(key in rules))) throw new Error("Champ d'automatisation non autorisé.");
  for (const key of ["enabled_for_major", "enabled_for_minor", "weight", "requires_target", "cooldown_hours", "roll_mode", "validation_mode", "publish_failures", "article_profile", "max_context_articles", "context_window_rp_months", "discord_destination"]) {
    if (raw[key] === undefined) throw new Error(`Le réglage ${key} est requis.`);
  }
  const config = Object.fromEntries(Object.entries(raw).map(([key, row]) => [key, cleanValue(row, rules[key], key)]));
  for (const [min, max] of [["emitter_min_stability", "emitter_max_stability"], ["target_min_stability", "target_max_stability"], ["emitter_min_militarism", "emitter_max_militarism"], ["target_min_militarism", "target_max_militarism"], ["min_relation", "max_relation"]]) {
    if (config[min] !== undefined && config[max] !== undefined && Number(config[min]) > Number(config[max])) throw new Error(`Bornes incompatibles : ${min} et ${max}.`);
  }
  return config;
}

function mutation(id: string): MutationSpec | undefined {
  return MUTATIONS.find((spec) => spec.id === id);
}

function describeRule(rule: FieldRule): string {
  const nullable = "nullable" in rule && rule.nullable ? " ou null" : "";
  if (rule.type === "uuid") return `UUID${nullable}`;
  if (rule.type === "string") return `texte ≤ ${rule.max} caractères${nullable}`;
  if (rule.type === "number") return `${rule.integer ? "entier" : "nombre"} de ${rule.min} à ${rule.max}${nullable}`;
  if (rule.type === "boolean") return "booléen";
  if (rule.type === "enum") return `${rule.values.join(" | ")}${nullable}`;
  return `JSON${nullable}`;
}

export const ADMIN_ACTION_CATALOG = [
  ...MUTATIONS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    risk: spec.risk,
    parameters: {
      ...Object.fromEntries(Object.entries(spec.keys).map(([key, value]) => [key, `${describeRule(value.rule)} requis`])),
      ...(spec.mode === "delete" ? {} : { values: Object.fromEntries(Object.entries(spec.fields).map(([key, rule]) => [key, describeRule(rule)])) }),
      expectedUpdatedAt: "date de version facultative",
    },
  })),
  ...SPECIAL_ACTIONS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    risk: spec.risk,
    parameters: Object.fromEntries(Object.entries(spec.fields).map(([key, rule]) => [key, `${describeRule(rule)} · ${(spec.required ?? []).includes(key) ? "requis" : "optionnel"}`])),
  })),
] as const;

export function validateAdminPlanActions(actions: AdminPlannedAction[]): AdminPlannedAction[] {
  if (!Array.isArray(actions) || actions.length > 25) throw new Error("Le plan contient trop d'actions.");
  const validated = actions.map((action) => {
    if (!action || typeof action !== "object") throw new Error("Action invalide.");
    const spec = mutation(action.id);
    const special = SPECIAL_ACTIONS.find((candidate) => candidate.id === action.id);
    if (!spec && !special) throw new Error(`Action non autorisée : ${action.id}.`);
    if (typeof action.reason !== "string" || action.reason.length < 1 || action.reason.length > 500) throw new Error("Motif d'action invalide.");
    const parameters = spec
      ? validateMutation(spec, object(action.parameters, "Paramètres")).parameters
      : validateSpecial(special!, object(action.parameters, "Paramètres"));
    const risk = spec?.risk ?? special!.risk;
    if (action.risk !== risk) throw new Error(`Niveau de risque incorrect pour ${action.id}.`);
    return { ...action, risk, parameters } as AdminPlannedAction;
  });
  if (validated.some((action) => action.risk === "isolated") && validated.length !== 1) {
    throw new Error("Une action destructrice ou externe doit être isolée dans sa propre tâche.");
  }
  return validated;
}

async function rowFor(supabase: SupabaseClient, table: string, where: Record<string, unknown>) {
  let query = supabase.from(table).select("*");
  for (const [column, value] of Object.entries(where)) query = query.eq(column, value);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Record<string, unknown> | null;
}

export async function prepareAdminAction(
  supabase: SupabaseClient,
  action: AdminPlannedAction,
  existingAfter?: Record<string, unknown> | null
): Promise<PreparedAdminAction> {
  const spec = mutation(action.id);
  if (!spec) return prepareSpecialAction(supabase, action);
  const validated = validateMutation(spec, action.parameters);
  const before = spec.mode === "insert" ? null : await rowFor(supabase, spec.table, validated.where);
  if ((spec.mode === "update" || spec.mode === "delete") && !before) throw new Error(`${spec.label} : donnée introuvable.`);
  if (before && validated.parameters.expectedUpdatedAt !== undefined && before.updated_at !== validated.parameters.expectedUpdatedAt) {
    throw new Error("La donnée a changé. Rechargez la page avant de recommencer.");
  }
  let after: Record<string, unknown> | null;
  if (spec.mode === "delete") after = null;
  else if (spec.mode === "insert") {
    after = existingAfter ?? { ...(spec.generatedId ? { id: randomUUID() } : {}), ...validated.values };
  } else {
    after = { ...(before ?? {}), ...validated.where, ...validated.values };
  }
  if (spec.id === "country.budget.update" && after) {
    const total = Object.keys(budgetFields)
      .filter((key) => key.startsWith("pct_"))
      .reduce((sum, key) => sum + Number(after[key] ?? 0), 0);
    if (total > 100.000001) throw new Error("La somme des allocations budgétaires dépasse 100 %.");
  }
  return {
    actionId: spec.id,
    risk: spec.risk,
    reversible: spec.reversible,
    parameters: validated.parameters,
    before,
    after,
    expectedHash: hashSnapshot(before),
  };
}

async function executeMutation(
  supabase: SupabaseClient,
  prepared: PreparedAdminAction
): Promise<Record<string, unknown> | null> {
  const spec = mutation(prepared.actionId)!;
  const validated = validateMutation(spec, prepared.parameters);
  if (spec.id === "country.military.update") {
    const { error } = await supabase.rpc("save_country_military_units_guarded", {
      p_country_id: validated.where.country_id,
      p_rows: [{
        roster_unit_id: validated.where.roster_unit_id,
        current_level: validated.values.current_level,
        extra_count: validated.values.extra_count,
        expected_updated_at: prepared.before?.updated_at ?? null,
      }],
    });
    if (error) throw new Error(error.message);
    return rowFor(supabase, spec.table, validated.where);
  }
  if (spec.mode === "insert") {
    const payload = prepared.after ?? validated.values;
    const { data, error } = await supabase.from(spec.table).insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }
  if (spec.mode === "upsert") {
    const payload = { ...validated.where, ...validated.values };
    if (!prepared.before) {
      const { data, error } = await supabase.from(spec.table).insert(payload).select("*").single();
      if (error) throw new Error(error.code === "23505" ? "La donnée a été créée depuis la validation." : error.message);
      return data as Record<string, unknown>;
    }
    let update = supabase.from(spec.table).update(validated.values);
    for (const [column, value] of Object.entries(validated.where)) update = update.eq(column, value);
    if (prepared.before.updated_at) update = update.eq("updated_at", prepared.before.updated_at);
    const { data, error } = await update.select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("La donnée a changé depuis la validation.");
    return data as Record<string, unknown>;
  }
  let query = spec.mode === "delete"
    ? supabase.from(spec.table).delete()
    : supabase.from(spec.table).update(validated.values);
  for (const [column, value] of Object.entries(validated.where)) query = query.eq(column, value);
  if (prepared.before?.updated_at) query = query.eq("updated_at", prepared.before.updated_at);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La donnée a changé depuis la validation.");
  return spec.mode === "delete" ? null : data as Record<string, unknown>;
}

export async function executePreparedAdminAction(
  supabase: SupabaseClient,
  prepared: PreparedAdminAction
): Promise<Record<string, unknown> | null> {
  return mutation(prepared.actionId)
    ? executeMutation(supabase, prepared)
    : executeSpecialAction(prepared.actionId, prepared.parameters);
}

export async function restorePreparedAdminAction(
  supabase: SupabaseClient,
  prepared: PreparedAdminAction
): Promise<Record<string, unknown> | null> {
  const spec = mutation(prepared.actionId);
  if (!spec || !prepared.reversible) throw new Error("Cette action n'est pas restaurable.");
  const validated = validateMutation(spec, prepared.parameters);
  if (prepared.before === null && prepared.after) {
    const id = prepared.after.id;
    let query = supabase.from(spec.table).delete();
    if (typeof id === "string") query = query.eq("id", id);
    else for (const [column, value] of Object.entries(validated.where)) query = query.eq(column, value);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return null;
  }
  if (!prepared.before) throw new Error("Sauvegarde de restauration absente.");
  if (prepared.after === null) {
    const { data, error } = await supabase.from(spec.table).insert(prepared.before).select("*").single();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }
  const patch = Object.fromEntries(Object.keys(spec.fields).filter((field) => field in prepared.before!).map((field) => [field, prepared.before![field]]));
  let query = supabase.from(spec.table).update(patch);
  const selector = Object.keys(validated.where).length > 0
    ? validated.where
    : typeof prepared.before.id === "string" ? { id: prepared.before.id } : {};
  for (const [column, value] of Object.entries(selector)) query = query.eq(column, value);
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Restauration impossible.");
  return data as Record<string, unknown>;
}

export async function currentSnapshotForPreparedAction(
  supabase: SupabaseClient,
  prepared: PreparedAdminAction
): Promise<Record<string, unknown> | null> {
  const spec = mutation(prepared.actionId);
  if (!spec) {
    const refreshed = await prepareSpecialAction(supabase, {
      id: prepared.actionId,
      parameters: prepared.parameters,
      reason: "Nouvelle vérification",
      risk: prepared.risk,
    });
    return refreshed.before;
  }
  const validated = validateMutation(spec, prepared.parameters);
  if (spec.mode === "insert" && typeof prepared.after?.id === "string") {
    return rowFor(supabase, spec.table, { id: prepared.after.id });
  }
  return rowFor(supabase, spec.table, validated.where);
}

async function prepareSpecialAction(supabase: SupabaseClient, action: AdminPlannedAction): Promise<PreparedAdminAction> {
  const spec = SPECIAL_ACTIONS.find((candidate) => candidate.id === action.id);
  if (!spec) throw new Error(`Action non autorisée : ${action.id}.`);
  const params = validateSpecial(spec, object(action.parameters, "Paramètres"));
  let before: Record<string, unknown> | null = null;
  if (action.id === "country.delete") before = await rowFor(supabase, "countries", { id: cleanValue(params.countryId, uuid(), "countryId") });
  else if (action.id === "player.delete") before = await rowFor(supabase, "country_players", { user_id: cleanValue(params.userId, uuid(), "userId") });
  else if (action.id.startsWith("request.")) before = await rowFor(supabase, "state_action_requests", { id: cleanValue(params.requestId, uuid(), "requestId") });
  else if (action.id === "history.restore_change") before = await rowFor(supabase, "admin_change_log", { id: params.changeId });
  else if (action.id === "wiki.move") before = await rowFor(supabase, "wiki_pages", { id: params.pageId });
  else if (action.id !== "rp.action.create" && action.id.startsWith("rp.action.")) before = await rowFor(supabase, "ai_event_requests", { id: params.action_id });
  else if (action.id === "rp.job.retry") before = await rowFor(supabase, "rp_pipeline_jobs", { id: params.job_id });
  else if (action.id.startsWith("rp.article.")) before = await rowFor(supabase, "lore_articles", { id: params.article_id });
  else if (action.id === "discord.route.update") before = await rowFor(supabase, "discord_rp_channels", { id: params.route_id });
  else if (action.id === "rp.automation.update") before = await rowFor(supabase, "action_automation_configs", { action_type_id: params.action_type_id });
  else if (action.id === "discord.country_mapping") before = await rowFor(supabase, "countries", { id: params.country_id });
  else if (action.id === "rp.staff.update") before = await rowFor(supabase, "rp_staff", { user_id: params.user_id });
  const mustExist = !["player.add_state_actions", "world.reset_country_stats", "world.run_daily_update", "world.randomize_budgets", "world.randomize_ideologies", "world.reset_relations", "world.randomize_relations", "world.recompute_neighbors", "discord.sync", "discord.delivery", "rp.action.create", "discord.route.create", "rp.staff.update", "rp.pipeline.toggle"].includes(action.id);
  if (mustExist && !before) throw new Error("La donnée visée est introuvable.");
  return {
    actionId: action.id,
    risk: action.risk,
    reversible: action.risk === "reversible",
    parameters: params,
    before,
    after: action.risk === "isolated" ? { avertissement: "Action dédiée, externe ou destructrice. Elle ne peut pas être restaurée automatiquement." } : null,
    expectedHash: hashSnapshot(before),
  };
}

function formDataFrom(values: Record<string, unknown>, jsonFields: readonly string[] = []): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false) continue;
    if (jsonFields.includes(key)) form.set(key, JSON.stringify(value));
    else if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)));
    else if (typeof value === "object") form.set(key, JSON.stringify(value));
    else form.set(key, value === true ? "on" : String(value));
  }
  return form;
}

async function executeSpecialAction(actionId: string, params: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const resultError = (result: { error?: string | null; ok?: boolean } | void) => {
    if (result && result.error) throw new Error(result.error);
    return { ok: true };
  };
  if (actionId === "country.delete") {
    const { deleteCountry } = await import("@/app/admin/pays/actions");
    return resultError(await deleteCountry(String(params.countryId)));
  }
  if (actionId === "player.delete") {
    const { deletePlayer } = await import("@/app/admin/joueurs/actions");
    return resultError(await deletePlayer(String(params.userId)));
  }
  if (actionId === "player.add_state_actions") {
    const { addStateActions } = await import("@/app/admin/joueurs/actions");
    const amount = Number(params.amount ?? 25);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) throw new Error("Nombre d'actions invalide.");
    return resultError(await addStateActions(String(params.countryId), amount));
  }
  if (actionId.startsWith("request.")) {
    const actions = await import("@/app/admin/demandes/actions");
    const requestId = String(params.requestId ?? "");
    if (actionId === "request.accept") return resultError(await actions.acceptRequest(requestId));
    if (actionId === "request.refuse") return resultError(await actions.refuseRequest(requestId, params.refund === true, String(params.message ?? "")));
    if (actionId === "request.remove_impact") return resultError(await actions.removeImpactRoll(requestId));
    if (actionId === "request.effect.update") return resultError(await actions.updateRequestEffect(requestId, params.effects as AdminEffectAdded[] | null));
    if (actionId === "request.roll") {
      const rollType = params.rollType === "impact" ? "impact" : "success";
      const modifiers = Array.isArray(params.modifiers) ? params.modifiers.slice(0, 20) as Array<{ label: string; value: number }> : [];
      return resultError(await actions.rollD100(requestId, rollType, modifiers));
    }
  }
  if (actionId === "history.restore_change") {
    const { restoreAdminChange } = await import("@/app/admin/historique/actions");
    return resultError(await restoreAdminChange(String(params.changeId)));
  }
  if (actionId === "wiki.move") {
    const { moveWikiPageAction } = await import("@/app/actions/wiki");
    return resultError(await moveWikiPageAction(String(params.pageId), params.direction === "up" ? "up" : "down", String(params.expectedUpdatedAt)));
  }
  const countryActions = await import("@/app/admin/pays/actions");
  if (actionId === "world.reset_country_stats") return resultError(await countryActions.resetAllCountriesStats());
  if (actionId === "world.run_daily_update") return resultError(await countryActions.runDailyCountryUpdate());
  if (actionId === "world.randomize_budgets") return resultError(await countryActions.randomizeNationalBudgets());
  if (actionId === "world.randomize_ideologies") return resultError(await countryActions.randomizeCountryIdeologies());
  const relationActions = await import("@/app/admin/matrice-diplomatique/actions");
  if (actionId === "world.reset_relations") return resultError(await relationActions.resetAllRelations());
  if (actionId === "world.randomize_relations") return resultError(await relationActions.randomizeAllRelations());
  if (actionId === "world.recompute_neighbors") {
    const { computeMapRegionNeighbors } = await import("@/app/admin/regles/actions");
    return resultError(await computeMapRegionNeighbors());
  }
  if (actionId === "discord.sync") {
    const { queueDiscordSync } = await import("@/app/admin/event-ia/pipeline-actions");
    await queueDiscordSync();
    return { ok: true };
  }
  if (actionId === "discord.delivery") {
    const { queueDiscordDelivery } = await import("@/app/admin/event-ia/pipeline-actions");
    const form = new FormData();
    form.set("action_id", String(params.actionId ?? ""));
    form.set("article_id", String(params.articleId ?? ""));
    form.set("operation", params.operation === "delete" ? "delete" : "resend");
    await queueDiscordDelivery(form);
    return { ok: true };
  }
  const pipeline = await import("@/app/admin/event-ia/pipeline-actions");
  if (actionId === "rp.action.create") await pipeline.createManualRpAction(formDataFrom(params, ["effects_json"]));
  else if (actionId === "rp.action.effects") await pipeline.saveActionEffects(formDataFrom(params, ["effects_json"]));
  else if (actionId === "rp.job.retry") await pipeline.retryPipelineJob(formDataFrom(params));
  else if (actionId === "rp.action.decide") await pipeline.decideRpAction(formDataFrom(params));
  else if (actionId === "rp.action.change_roll") await pipeline.changeActionRoll(formDataFrom(params));
  else if (actionId === "rp.article.review") {
    const form = formDataFrom(params);
    form.delete("sections");
    for (const section of params.sections as Array<{ title: string; body: string }>) {
      form.append("section_title", section.title);
      form.append("section_body", section.body);
    }
    await pipeline.saveArticleReview(form);
  } else if (actionId === "discord.route.update") await pipeline.updateDiscordRoute(formDataFrom(params));
  else if (actionId === "discord.route.create") await pipeline.saveDiscordRoute(formDataFrom(params));
  else if (actionId === "rp.automation.update") {
    await pipeline.saveActionAutomationConfig(formDataFrom({ action_type_id: params.action_type_id, ...(params.config as Record<string, unknown>) }));
  } else if (actionId === "rp.article.classify") await pipeline.classifyLoreArticle(formDataFrom(params));
  else if (actionId === "discord.country_mapping") await pipeline.saveCountryDiscordMapping(formDataFrom(params));
  else if (actionId === "rp.staff.update") await pipeline.setRpStaffAccess(formDataFrom(params));
  else if (actionId === "rp.pipeline.toggle") {
    const form = new FormData();
    form.set("enabled", params.enabled === true ? "true" : "false");
    await pipeline.setRpPipelineEnabled(form);
  } else throw new Error(`Action non exécutée : ${actionId}.`);
  return { ok: true };
}

export async function linkAdminChanges(input: {
  supabase: SupabaseClient;
  userId: string;
  jobId: string;
  since: string;
}): Promise<string[]> {
  const { data } = await input.supabase
    .from("admin_change_log")
    .select("id")
    .eq("actor_user_id", input.userId)
    .is("assistant_job_id", null)
    .gte("created_at", input.since)
    .order("created_at")
    .limit(100);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await input.supabase.from("admin_change_log").update({ assistant_job_id: input.jobId }).in("id", ids);
  }
  return ids;
}
