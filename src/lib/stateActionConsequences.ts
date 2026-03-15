/**
 * Logique partagée d'application des conséquences d'une action d'État acceptée
 * (relations, influence, effets admin, Discord). Utilisée par les demandes joueur
 * et par le job Process due des events IA.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelation, normalizePair, RELATION_MIN, RELATION_MAX } from "@/lib/relations";
import { dispatchToDiscord } from "@/lib/discord-dispatch";
import { formatWorldDateForDiscord } from "@/lib/worldDate";
import {
  normalizeAdminEffectsAdded,
  formatAdminEffectLabel,
  formatAdminEffectShortForDiscord,
  DURATION_DAYS_MAX,
} from "@/lib/countryEffects";
import { IDEOLOGY_IDS, ideologyColumnName, normalizeIdeologyScoresWithAxioms, type IdeologyId } from "@/lib/ideology";
import type { AdminEffectAdded, DiceResults } from "@/types/database";

function clampRelation(value: number): number {
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.round(value)));
}

const EFFECT_VALUE_MIN = -1000;
const EFFECT_VALUE_MAX = 1000;
export function clampEffectValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, value));
}

const STAT_COLUMNS = ["militarism", "industry", "science", "stability"] as const;
const STAT_CLAMP: Record<string, { min: number; max: number }> = {
  militarism: { min: 0, max: 10 },
  industry: { min: 0, max: 10 },
  science: { min: 0, max: 10 },
  stability: { min: -3, max: 3 },
};

export async function applyImmediateEffect(
  supabase: SupabaseClient,
  countryId: string,
  effect: AdminEffectAdded
): Promise<{ error?: string }> {
  const kind = effect.effect_kind;
  const value = clampEffectValue(Number(effect.value));
  const target = effect.effect_target ?? null;

  if (kind === "military_unit_extra" && target) {
    const { data: existing } = await supabase
      .from("country_military_units")
      .select("id, extra_count")
      .eq("country_id", countryId)
      .eq("roster_unit_id", target)
      .maybeSingle();
    if (existing) {
      const newExtra = Math.max(0, (existing.extra_count ?? 0) + value);
      const { error: upErr } = await supabase
        .from("country_military_units")
        .update({ extra_count: newExtra })
        .eq("id", existing.id);
      if (upErr) return { error: upErr.message };
    } else {
      if (value < 0) return {};
      const { error: insErr } = await supabase.from("country_military_units").insert({
        country_id: countryId,
        roster_unit_id: target,
        current_level: 0,
        extra_count: value,
      });
      if (insErr) return { error: insErr.message };
    }
    return {};
  }

  if (kind === "military_unit_tech_rate" && target) {
    const { data: roster } = await supabase
      .from("military_roster_units")
      .select("level_count")
      .eq("id", target)
      .single();
    const cap = roster?.level_count != null ? roster.level_count * 100 : 9999;
    const { data: cmu } = await supabase
      .from("country_military_units")
      .select("id, current_level")
      .eq("country_id", countryId)
      .eq("roster_unit_id", target)
      .maybeSingle();
    if (cmu) {
      const newLevel = Math.min(cap, Math.max(0, (cmu.current_level ?? 0) + value));
      const { error: upErr } = await supabase
        .from("country_military_units")
        .update({ current_level: newLevel })
        .eq("id", cmu.id);
      if (upErr) return { error: upErr.message };
    } else {
      const newLevel = Math.min(cap, Math.max(0, value));
      const { error: insErr } = await supabase.from("country_military_units").insert({
        country_id: countryId,
        roster_unit_id: target,
        current_level: newLevel,
        extra_count: 0,
      });
      if (insErr) return { error: insErr.message };
    }
    return {};
  }

  if (kind === "stat_delta" && target && STAT_COLUMNS.includes(target as (typeof STAT_COLUMNS)[number])) {
    const col = target as (typeof STAT_COLUMNS)[number];
    const clamp = STAT_CLAMP[col];
    if (!clamp) return {};
    const { data: row } = await supabase.from("countries").select(col).eq("id", countryId).single();
    const current = Number((row as Record<string, number>)?.[col] ?? 0);
    const newVal = Math.max(clamp.min, Math.min(clamp.max, current + value));
    const { error: upErr } = await supabase
      .from("countries")
      .update({ [col]: newVal })
      .eq("id", countryId);
    if (upErr) return { error: upErr.message };
    return {};
  }

  if (kind === "relation_delta" && target) {
    const current = await getRelation(supabase, countryId, target);
    const [a, b] = normalizePair(countryId, target);
    const newValue = clampRelation(current + value);
    const { error: relErr } = await supabase
      .from("country_relations")
      .upsert(
        { country_a_id: a, country_b_id: b, value: newValue, updated_at: new Date().toISOString() },
        { onConflict: "country_a_id,country_b_id" }
      );
    if (relErr) return { error: relErr.message };
    return {};
  }

  if (kind.startsWith("ideology_snap_")) {
    const ideologyId = kind.replace("ideology_snap_", "") as IdeologyId;
    if (!IDEOLOGY_IDS.includes(ideologyId)) return { error: `Idéologie inconnue : ${ideologyId}` };
    const columns = IDEOLOGY_IDS.map((id) => ideologyColumnName(id));
    const { data: row } = await supabase
      .from("countries")
      .select(columns.join(", "))
      .eq("id", countryId)
      .single();
    const currentRaw: Record<string, number> = {};
    const rowData = row as unknown as Record<string, unknown> | null;
    for (const id of IDEOLOGY_IDS) {
      currentRaw[id] = Number(rowData?.[ideologyColumnName(id)] ?? 100 / 6);
    }
    const current = normalizeIdeologyScoresWithAxioms(currentRaw);
    const shiftedRaw = { ...current };
    shiftedRaw[ideologyId] = current[ideologyId] + value;
    const shifted = normalizeIdeologyScoresWithAxioms(shiftedRaw);
    const updatePayload: Record<string, number> = {};
    for (const id of IDEOLOGY_IDS) {
      updatePayload[ideologyColumnName(id)] = Number(shifted[id].toFixed(4));
    }
    const { error: upErr } = await supabase.from("countries").update(updatePayload).eq("id", countryId);
    if (upErr) return { error: upErr.message };
    return {};
  }

  return { error: `Effet immédiat non géré : ${kind}` };
}

export type ApplyStateActionConsequencesParams = {
  supabase: SupabaseClient;
  countryId: string;
  payload: Record<string, string>;
  adminEffectAdded: unknown;
  diceResults: DiceResults | null;
  actionKey: string;
  actionLabel: string;
  paramsSchema: Record<string, number>;
  options?: { skipDiscord?: boolean };
};

/**
 * Applique les conséquences d'une action d'État acceptée : relations, influence,
 * effets admin (immédiats et durée), puis envoi Discord.
 */
export async function applyStateActionConsequences({
  supabase,
  countryId,
  payload,
  adminEffectAdded,
  diceResults,
  actionKey,
  actionLabel,
  paramsSchema,
  options = {},
}: ApplyStateActionConsequencesParams): Promise<{ error?: string }> {
  const targetCountryId = typeof payload.target_country_id === "string" ? payload.target_country_id : undefined;
  const diceSuccess = diceResults?.success_roll ? diceResults.success_roll.total >= 50 : true;
  let discordImpactValue: number | null = null;
  let discordImpactMagnitude: string | null = null;
  let discordImpactLabel = "Relations";

  function magnitudeFromAbs(absVal: number): string {
    if (absVal <= 10) return "faible";
    if (absVal <= 25) return "modéré";
    if (absVal <= 50) return "élevé";
    return "massif";
  }

  // Insulte diplomatique ou types militaires (baisse de relations)
  if (
    actionKey === "insulte_diplomatique" ||
    actionKey === "escarmouche_militaire" ||
    actionKey === "conflit_arme" ||
    actionKey === "guerre_ouverte"
  ) {
    if (!targetCountryId) return { error: "Pays cible manquant." };
    const impactMax = typeof paramsSchema.impact_maximum === "number" ? paramsSchema.impact_maximum : 50;
    let relationDelta = 0;
    if (diceResults?.impact_roll != null) {
      const total = diceResults.impact_roll.total;
      relationDelta = Math.round(-impactMax * (total / 100));
      if (relationDelta > 0) relationDelta = 0;
      if (relationDelta < -100) relationDelta = -100;
    }
    const current = await getRelation(supabase, countryId, targetCountryId);
    const [a, b] = normalizePair(countryId, targetCountryId);
    const newValue = clampRelation(current + relationDelta);
    const { error: relErr } = await supabase
      .from("country_relations")
      .upsert(
        { country_a_id: a, country_b_id: b, value: newValue, updated_at: new Date().toISOString() },
        { onConflict: "country_a_id,country_b_id" }
      );
    if (relErr) return { error: relErr.message };
    discordImpactValue = relationDelta;
    discordImpactMagnitude = magnitudeFromAbs(Math.abs(relationDelta));
  }

  // Ouverture diplomatique (hausse de relations)
  if (actionKey === "ouverture_diplomatique") {
    if (!targetCountryId) return { error: "Pays cible manquant pour Ouverture diplomatique." };
    const impactMax = typeof paramsSchema.impact_maximum === "number" ? paramsSchema.impact_maximum : 50;
    let relationDelta = 0;
    if (diceResults?.impact_roll != null) {
      const total = diceResults.impact_roll.total;
      relationDelta = Math.round(impactMax * (total / 100));
      if (relationDelta < 0) relationDelta = 0;
      if (relationDelta > 100) relationDelta = 100;
    }
    const current = await getRelation(supabase, countryId, targetCountryId);
    const [a, b] = normalizePair(countryId, targetCountryId);
    const newValue = clampRelation(current + relationDelta);
    const { error: relErr } = await supabase
      .from("country_relations")
      .upsert(
        { country_a_id: a, country_b_id: b, value: newValue, updated_at: new Date().toISOString() },
        { onConflict: "country_a_id,country_b_id" }
      );
    if (relErr) return { error: relErr.message };
    discordImpactValue = relationDelta;
    discordImpactMagnitude = magnitudeFromAbs(Math.abs(relationDelta));
  }

  // Prise d'influence
  if (actionKey === "prise_influence") {
    if (!targetCountryId) return { error: "Pays cible manquant pour Prise d'influence." };
    const impactMax = typeof paramsSchema.impact_maximum === "number" ? paramsSchema.impact_maximum : 100;
    let impactPct = 0;
    if (diceResults?.impact_roll != null) {
      const total = diceResults.impact_roll.total;
      impactPct = Math.round(impactMax * (total / 100));
      impactPct = Math.max(0, Math.min(100, impactPct));
    }
    const { data: existingRow } = await supabase
      .from("country_control")
      .select("id, share_pct")
      .eq("country_id", targetCountryId)
      .eq("controller_country_id", countryId)
      .maybeSingle();
    const currentShare = existingRow != null ? Number(existingRow.share_pct) : 0;
    const newShare = Math.min(100, currentShare + impactPct);
    const { error: ctrlErr } = await supabase
      .from("country_control")
      .upsert(
        {
          country_id: targetCountryId,
          controller_country_id: countryId,
          share_pct: newShare,
          is_annexed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "country_id,controller_country_id" }
      );
    if (ctrlErr) return { error: ctrlErr.message };
    discordImpactValue = impactPct;
    discordImpactMagnitude = magnitudeFromAbs(impactPct);
    discordImpactLabel = "Influence";
  }

  const effects = normalizeAdminEffectsAdded(adminEffectAdded);
  const targetCountryIdBase =
    actionKey === "prise_influence" && payload.target_country_id ? payload.target_country_id : countryId;

  for (const effect of effects) {
    if (!effect.name || !effect.effect_kind) continue;
    const targetId = targetCountryIdBase;
    if (effect.application === "immediate") {
      const err = await applyImmediateEffect(supabase, targetId, effect);
      if (err.error) return err;
    } else {
      const durationKind = effect.duration_kind === "updates" ? "days" : (effect.duration_kind ?? "days");
      const rawRemaining = durationKind === "permanent" ? 0 : (Number(effect.duration_remaining) || 30);
      const durationRemaining =
        durationKind === "permanent" ? 0 : Math.max(0, Math.min(DURATION_DAYS_MAX, Math.round(rawRemaining)));
      const row = {
        country_id: targetId,
        name: effect.name,
        effect_kind: effect.effect_kind,
        effect_target: effect.effect_target ?? null,
        effect_subtype: effect.effect_subtype ?? null,
        value: clampEffectValue(Number(effect.value)),
        duration_kind: durationKind,
        duration_remaining: durationRemaining,
      };
      const { error: insErr } = await supabase.from("country_effects").insert(row);
      if (insErr) return { error: insErr.message };
    }
  }

  if (options.skipDiscord) return {};

  const [countryRes, targetCountryRes, worldDateRes, rosterRes, countriesRes] = await Promise.all([
    supabase.from("countries").select("name").eq("id", countryId).single(),
    targetCountryId
      ? supabase.from("countries").select("name").eq("id", targetCountryId).single()
      : Promise.resolve({ data: null }),
    supabase.from("rule_parameters").select("value").eq("key", "world_date").maybeSingle(),
    supabase.from("military_roster_units").select("id, name_fr").order("name_fr"),
    supabase.from("countries").select("id, name").order("name"),
  ]);
  const countryName = (countryRes.data as { name?: string } | null)?.name ?? "";
  const targetCountryName = (targetCountryRes.data as { name?: string } | null)?.name ?? "";
  const worldDateVal = (worldDateRes.data as { value?: { month?: number; year?: number } } | null)?.value;
  const resolutionDate =
    worldDateVal && typeof worldDateVal.month === "number" && typeof worldDateVal.year === "number"
      ? formatWorldDateForDiscord({ month: worldDateVal.month, year: worldDateVal.year })
      : new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });

  const rosterUnits = (rosterRes.data ?? []) as { id: string; name_fr: string }[];
  const countriesList = (countriesRes.data ?? []) as { id: string; name: string }[];
  const adminEffectsSummary =
    effects.length > 0
      ? effects.map((e) => formatAdminEffectLabel(e, { rosterUnits, countries: countriesList })).join("\n")
      : undefined;

  const hasStatUp = effects.some((e) => e.effect_kind === "stat_delta");
  const hasTechUp = effects.some((e) => e.effect_kind === "military_unit_tech_rate");
  const hasNombreUp = effects.some((e) => e.effect_kind === "military_unit_extra");
  const hasOtherUpKind = effects.some(
    (e) =>
      e.effect_kind !== "stat_delta" &&
      e.effect_kind !== "military_unit_tech_rate" &&
      e.effect_kind !== "military_unit_extra"
  );
  const upKind =
    !hasOtherUpKind && hasStatUp && !hasTechUp && !hasNombreUp
      ? "stat"
      : !hasOtherUpKind && hasTechUp && !hasStatUp && !hasNombreUp
        ? "tech"
        : !hasOtherUpKind && hasNombreUp && !hasStatUp && !hasTechUp
          ? "nombre"
          : "mixed";

  const upSummary =
    effects.length > 0
      ? effects
          .map((e) => formatAdminEffectShortForDiscord(e, { rosterUnits, countries: countriesList }))
          .filter((s) => s.trim().length > 0)
          .join(" · ")
      : "";

  const discordKey = `${actionKey}_accepted`;
  const basePayload: Record<string, string | number | null | undefined> = {
    country_id: countryId,
    country_name: countryName,
    action_label: actionLabel,
    resolution_date: resolutionDate,
    date: resolutionDate,
    dice_success: diceSuccess ? "true" : "false",
    dice_success_label: diceSuccess ? "Succès" : "Échec",
    admin_effects_summary: adminEffectsSummary,
  };
  if (actionKey === "demande_up") {
    basePayload.up_kind = upKind;
    basePayload.up_summary = diceSuccess ? upSummary : "Aucun effet";
  } else {
    if (targetCountryId) basePayload.target_country_id = targetCountryId;
    if (targetCountryName) basePayload.target_country_name = targetCountryName;
    if (discordImpactMagnitude != null) basePayload.impact_magnitude_text = discordImpactMagnitude;
    if (discordImpactValue != null) basePayload.impact_value = discordImpactValue;
    if (discordImpactMagnitude != null) basePayload.impact_label = discordImpactLabel;
  }
  dispatchToDiscord(discordKey, basePayload, supabase).catch(() => {});

  return {};
}

export { ACTION_KEYS_REQUIRING_IMPACT_ROLL } from "@/lib/actionKeys";
