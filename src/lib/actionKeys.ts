/**
 * Constantes partagées côté client et serveur pour les types d'actions d'État.
 * Ce fichier ne doit pas importer next/headers ni supabase/server.
 */

/** Clés des types d'action qui requièrent un jet d'impact avant acceptation. */
export const ACTION_KEYS_REQUIRING_IMPACT_ROLL = new Set([
  "insulte_diplomatique",
  "ouverture_diplomatique",
  "prise_influence",
  "escarmouche_militaire",
  "conflit_arme",
  "guerre_ouverte",
]);

export const MILITARY_STATE_ACTION_KEYS = [
  "escarmouche_militaire",
  "conflit_arme",
  "guerre_ouverte",
] as const;

export const ACTION_KEYS_REQUIRING_TARGET = new Set([
  "insulte_diplomatique",
  "ouverture_diplomatique",
  "prise_influence",
  ...MILITARY_STATE_ACTION_KEYS,
  "accord_commercial_politique",
  "cooperation_militaire",
  "alliance",
  "espionnage",
  "sabotage",
]);

/** Types nécessitant acceptation par la cible avant validation admin. */
export const ACTION_KEYS_REQUIRING_TARGET_ACCEPTANCE = new Set([
  "accord_commercial_politique",
  "cooperation_militaire",
  "alliance",
]);

const DEFAULT_IMPACT_MAXIMUM_BY_ACTION_KEY: Record<string, number> = {
  insulte_diplomatique: 50,
  ouverture_diplomatique: 50,
  prise_influence: 100,
  escarmouche_militaire: 50,
  conflit_arme: 60,
  guerre_ouverte: 80,
};

const DEFAULT_MIN_RELATION_REQUIRED_BY_ACTION_KEY: Record<string, number> = {
  escarmouche_militaire: -25,
  conflit_arme: -50,
  guerre_ouverte: -75,
};

export function isMilitaryStateActionKey(actionKey: string): actionKey is (typeof MILITARY_STATE_ACTION_KEYS)[number] {
  return (MILITARY_STATE_ACTION_KEYS as readonly string[]).includes(actionKey);
}

export function actionRequiresTarget(actionKey: string): boolean {
  return ACTION_KEYS_REQUIRING_TARGET.has(actionKey);
}

export function actionRequiresTargetAcceptance(
  actionKey: string,
  paramsSchema?: Record<string, unknown> | null
): boolean {
  if (ACTION_KEYS_REQUIRING_TARGET_ACCEPTANCE.has(actionKey)) return true;
  const raw = paramsSchema?.requires_target_acceptance;
  return raw === true || raw === "true";
}

export function getDefaultImpactMaximum(actionKey: string): number {
  return DEFAULT_IMPACT_MAXIMUM_BY_ACTION_KEY[actionKey] ?? 50;
}

export function getStateActionMinRelationRequired(
  actionKey: string,
  paramsSchema?: Record<string, unknown> | null
): number | null {
  if (!isMilitaryStateActionKey(actionKey)) return null;
  const raw = paramsSchema?.min_relation_required;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  return DEFAULT_MIN_RELATION_REQUIRED_BY_ACTION_KEY[actionKey];
}

export function getStateActionImpactPreviewLabel(actionKey: string, impactMaximum: number, total: number): string | null {
  const impactValue = Math.round((total / 100) * impactMaximum);
  if (actionKey === "prise_influence") return `${impactValue} %`;
  if (actionKey === "ouverture_diplomatique") return `+${impactValue}`;
  if (actionKey === "insulte_diplomatique" || isMilitaryStateActionKey(actionKey)) return `−${impactValue}`;
  return null;
}
