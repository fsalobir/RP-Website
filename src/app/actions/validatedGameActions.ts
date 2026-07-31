"use server";

import { getCachedAuth } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import {
  executePreparedAdminAction,
  prepareAdminAction,
  validateAdminPlanActions,
} from "@/lib/ai/adminActionRegistry";
import type { AdminPlannedAction } from "@/lib/ai/contracts";

const PLAYER_FIELDS: Record<string, readonly string[]> = {
  "country.budget.update": [
    "pct_etat", "pct_education", "pct_recherche", "pct_infrastructure", "pct_sante",
    "pct_industrie", "pct_defense", "pct_interieur", "pct_affaires_etrangeres", "pct_procuration_militaire",
  ],
  "country.law.update": ["target_score"],
  "country.military.update": ["current_level", "extra_count"],
  "country.focus.update": [
    "design_roster_unit_id", "recrutement_roster_unit_id", "procuration_roster_unit_id", "stock_roster_unit_id",
  ],
};

function assertPlayerScope(action: AdminPlannedAction, countryId: string, before: Record<string, unknown> | null) {
  const allowedFields = PLAYER_FIELDS[action.id];
  if (!allowedFields || action.parameters.countryId !== countryId) {
    throw new Error("Vous ne pouvez modifier que les données autorisées de votre pays.");
  }
  const values = action.parameters.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Cette modification n'est pas autorisée pour un joueur.");
  }
  const submitted = values as Record<string, unknown>;
  const invalidField = Object.keys(submitted).some((field) => {
    if (allowedFields.includes(field)) return false;
    return !(action.id === "country.budget.update" && field === "budget_fraction"
      && before === null && Number(submitted[field]) === 0.3);
  });
  if (invalidField) throw new Error("Cette modification n'est pas autorisée pour un joueur.");
}

export async function executeValidatedGameActions(rawActions: AdminPlannedAction[]) {
  if (!Array.isArray(rawActions) || rawActions.length < 1 || rawActions.length > 500) {
    return { error: "Lot de modifications invalide." };
  }
  const auth = await getCachedAuth();
  if (!auth.user) return { error: "Non connecté." };

  try {
    const supabase = await createClient();
    const results: Array<Record<string, unknown> | null> = [];
    for (const rawAction of rawActions) {
      const action = validateAdminPlanActions([rawAction])[0];
      if (!auth.isAdmin && action.risk !== "reversible") throw new Error("Cette opération exige le parcours de validation renforcé.");
      const prepared = await prepareAdminAction(supabase, action);
      if (!auth.isAdmin) {
        if (!auth.playerCountryId) throw new Error("Aucun pays n'est associé à ce compte.");
        assertPlayerScope(action, auth.playerCountryId, prepared.before);
      }
      results.push(await executePreparedAdminAction(supabase, prepared));
    }
    return { data: results };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "La modification a échoué." };
  }
}

export async function executeValidatedGameAction(action: AdminPlannedAction) {
  const result = await executeValidatedGameActions([action]);
  return { error: result.error, data: result.data?.[0] ?? null };
}
