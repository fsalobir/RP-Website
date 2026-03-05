"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getRelation, normalizePair, RELATION_MIN, RELATION_MAX } from "@/lib/relations";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import type { AdminEffectAdded, DiceResults, DiceRollResult, MilitaryBranch } from "@/types/database";
import { dispatchToDiscord } from "@/lib/discord-dispatch";
import { formatWorldDateForDiscord } from "@/lib/worldDate";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null, userId: user.id };
}

export async function updateRequestEffect(
  requestId: string,
  adminEffectAdded: AdminEffectAdded | null
): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const payload =
    adminEffectAdded == null
      ? null
      : {
          ...(adminEffectAdded as unknown as Record<string, unknown>),
          application: (adminEffectAdded as AdminEffectAdded).application ?? "duration",
        };

  const { error } = await supabase
    .from("state_action_requests")
    .update({ admin_effect_added: payload })
    .eq("id", requestId)
    .in("status", ["pending"]);

  if (error) return { error: error.message };
  revalidatePath("/admin/demandes");
  return {};
}

function clampRelation(value: number): number {
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.round(value)));
}

const STAT_COLUMNS = ["militarism", "industry", "science", "stability"] as const;
const STAT_CLAMP: Record<string, { min: number; max: number }> = {
  militarism: { min: 0, max: 10 },
  industry: { min: 0, max: 10 },
  science: { min: 0, max: 10 },
  stability: { min: -3, max: 3 },
};

async function applyImmediateEffect(
  supabase: SupabaseClient,
  countryId: string,
  effect: AdminEffectAdded
): Promise<{ error?: string }> {
  const kind = effect.effect_kind;
  const value = Number(effect.value);
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
      if (value < 0) return {}; // rien à retirer
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

  return { error: `Effet immédiat non géré : ${kind}` };
}

const STAT_RANGES: Record<string, { min: number; max: number }> = {
  militarism: { min: 0, max: 10 },
  industry: { min: 0, max: 10 },
  science: { min: 0, max: 10 },
  stability: { min: -3, max: 3 },
};

function computeStatModifierBreakdown(
  rangesConfig: Record<string, { min: number; max: number }>,
  stats: Record<string, number>
): { total: number; byStat: Record<string, number> } {
  const byStat: Record<string, number> = {};
  let total = 0;
  for (const [statKey, range] of Object.entries(rangesConfig)) {
    const statRange = STAT_RANGES[statKey];
    if (!statRange) continue;
    const value = stats[statKey] ?? statRange.min;
    const t = (value - statRange.min) / (statRange.max - statRange.min || 1);
    const modifier = Math.round(range.min + t * (range.max - range.min));
    byStat[statKey] = modifier;
    total += modifier;
  }
  return { total, byStat };
}

export async function rollD100(
  requestId: string,
  rollType: "success" | "impact",
  adminModifiers: Array<{ label: string; value: number }> = []
): Promise<{ error?: string; result?: DiceRollResult }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, status, payload, dice_results")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  const { data: actionType } = req.action_type_id
    ? await supabase.from("state_action_types").select("key, params_schema").eq("id", req.action_type_id).maybeSingle()
    : { data: null };
  const actionKey = (actionType as { key?: string } | null)?.key ?? "";
  const paramsSchema = (actionType?.params_schema ?? {}) as Record<string, unknown>;
  const statBonus = (paramsSchema.stat_bonus ?? {}) as Record<string, boolean>;
  const statBonusEnabled = (key: string) => (statBonus[key] === undefined ? true : !!statBonus[key]);

  let relationModifier = 0;
  let influenceModifier = 0;
  if (actionKey === "prise_influence") {
    const targetCountryId = (req.payload as Record<string, unknown>)?.target_country_id;
    const amplitudeRel = typeof paramsSchema.amplitude_relations === "number" ? paramsSchema.amplitude_relations : 0;
    if (typeof targetCountryId === "string" && targetCountryId && amplitudeRel !== 0) {
      const relation = await getRelation(supabase, req.country_id, targetCountryId);
      relationModifier = Math.round((relation / 100) * amplitudeRel);
    }
    if (typeof targetCountryId === "string" && targetCountryId) {
      const [countriesRes, cmuRes, rosterRes, levelsRes, influenceConfigRes] = await Promise.all([
        supabase.from("countries").select("id, population, gdp, stability"),
        supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
        supabase.from("military_roster_units").select("id, branch, base_count").order("name_fr"),
        supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power").order("unit_id").order("level"),
        supabase.from("rule_parameters").select("value").eq("key", "influence_config").maybeSingle(),
      ]);
      const countries = (countriesRes.data ?? []) as Array<{ id: string; population: number; gdp: number; stability: number }>;
      const rosterUnits = (rosterRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
      const rosterLevels = (levelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
      const influenceConfig = (influenceConfigRes.data?.value ?? {}) as Parameters<typeof computeInfluenceForAll>[2];
      const hardPowerByCountry = computeHardPowerByCountry(
        (cmuRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>,
        rosterUnits,
        rosterLevels
      );
      const { byCountry: influenceByCountry } = computeInfluenceForAll(countries, hardPowerByCountry, influenceConfig);
      const emitterInfluence = influenceByCountry.get(req.country_id)?.influence ?? 0;
      const targetInfluence = influenceByCountry.get(targetCountryId)?.influence ?? 0;
      const ratio = targetInfluence > 0 ? emitterInfluence / targetInfluence : 0;
      const eq = (paramsSchema.equilibre_des_forces ?? {}) as Record<string, number>;
      const ratioEquilibre = typeof eq.ratio_equilibre === "number" ? eq.ratio_equilibre : 1;
      const malusMax = typeof eq.malus_max === "number" ? eq.malus_max : 20;
      const bonusMax = typeof eq.bonus_max === "number" ? eq.bonus_max : 20;
      const ratioMin = typeof eq.ratio_min === "number" ? eq.ratio_min : 0.5;
      const ratioMax = typeof eq.ratio_max === "number" ? eq.ratio_max : 2;
      if (ratio <= ratioMin) {
        influenceModifier = -malusMax;
      } else if (ratio < ratioEquilibre) {
        influenceModifier = Math.round(-malusMax * (ratioEquilibre - ratio) / (ratioEquilibre - ratioMin));
      } else if (ratio > ratioEquilibre) {
        if (ratio >= ratioMax) {
          influenceModifier = bonusMax;
        } else {
          influenceModifier = Math.round(bonusMax * (ratio - ratioEquilibre) / (ratioMax - ratioEquilibre));
        }
      }
    }
  }

  const { data: country } = await supabase
    .from("countries")
    .select("militarism, industry, science, stability")
    .eq("id", req.country_id)
    .single();

  const stats = country
    ? {
        militarism: Number(country.militarism ?? 0),
        industry: Number(country.industry ?? 0),
        science: Number(country.science ?? 0),
        stability: Number(country.stability ?? 0),
      }
    : { militarism: 0, industry: 0, science: 0, stability: 0 };

  const { data: rangesRow } = await supabase
    .from("rule_parameters")
    .select("value")
    .eq("key", "stats_dice_modifier_ranges")
    .maybeSingle();

  const fullRangesConfig =
    (rangesRow?.value as Record<string, { min: number; max: number }>) ?? {};
  const rangesConfig: Record<string, { min: number; max: number }> = {};
  for (const key of Object.keys(fullRangesConfig)) {
    if (statBonusEnabled(key)) rangesConfig[key] = fullRangesConfig[key];
  }
  const { total: statModifier, byStat: statModifiers } = computeStatModifierBreakdown(rangesConfig, stats);
  const adminSum = adminModifiers.reduce((s, m) => s + m.value, 0);
  const totalModifier = statModifier + adminSum + relationModifier + influenceModifier;

  const roll = Math.floor(Math.random() * 100) + 1;
  const total = Math.max(1, Math.min(100, roll + totalModifier));

  const result: DiceRollResult = {
    roll,
    modifier: totalModifier,
    total,
    stat_modifiers: Object.keys(statModifiers).length > 0 ? statModifiers : undefined,
    admin_modifier: adminSum !== 0 ? adminSum : undefined,
    relation_modifier: relationModifier !== 0 ? relationModifier : undefined,
    influence_modifier: influenceModifier !== 0 ? influenceModifier : undefined,
  };

  const existing = (req.dice_results ?? {}) as DiceResults;
  const next: DiceResults = {
    ...existing,
    admin_modifiers: adminModifiers.length > 0 ? adminModifiers : existing.admin_modifiers,
    ...(rollType === "success" ? { success_roll: result } : { impact_roll: result }),
  };

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({ dice_results: next as unknown as Record<string, unknown> })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/demandes");
  return { result };
}

export async function removeImpactRoll(requestId: string): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, status, dice_results")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  const existing = (req.dice_results ?? {}) as DiceResults;
  const { impact_roll: _removed, ...rest } = existing;
  const next: DiceResults = rest as DiceResults;

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({ dice_results: next as unknown as Record<string, unknown> })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/demandes");
  return {};
}

export async function acceptRequest(requestId: string): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, status, payload, admin_effect_added, dice_results")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  const { data: actionType } = await supabase
    .from("state_action_types")
    .select("key, label_fr, params_schema")
    .eq("id", req.action_type_id)
    .single();

  const key = (actionType?.key ?? "") as string;
  const actionLabel = (actionType as { label_fr?: string } | null)?.label_fr ?? key;
  const payload = (req.payload ?? {}) as Record<string, string>;
  const params = (actionType?.params_schema ?? {}) as Record<string, number>;
  const diceResults = req.dice_results as DiceResults | null;

  if (
    (key === "prise_influence" || key === "ouverture_diplomatique" || key === "insulte_diplomatique") &&
    !diceResults?.impact_roll
  ) {
    return { error: "Un jet d'impact doit être réalisé avant d'accepter cette demande." };
  }

  const targetCountryId = typeof payload.target_country_id === "string" ? payload.target_country_id : undefined;
  const diceSuccess = diceResults?.success_roll
    ? diceResults.success_roll.total >= 50
    : true;
  let discordImpactValue: number | null = null;
  let discordImpactMagnitude: string | null = null;
  let discordImpactLabel: string = "Relations";

  function magnitudeFromAbs(absVal: number): string {
    if (absVal <= 10) return "faible";
    if (absVal <= 25) return "modéré";
    if (absVal <= 50) return "élevé";
    return "massif";
  }

  if (key === "insulte_diplomatique") {
    const targetCountryId = payload.target_country_id;
    if (!targetCountryId) return { error: "Pays cible manquant pour Insulte diplomatique." };
    const impactMax = typeof params.impact_maximum === "number" ? params.impact_maximum : 50;
    let relationDelta: number;
    if (diceResults?.impact_roll != null) {
      const total = diceResults.impact_roll.total;
      relationDelta = Math.round(-impactMax * (total / 100));
      if (relationDelta > 0) relationDelta = 0;
      if (relationDelta < -100) relationDelta = -100;
    } else {
      relationDelta = 0;
    }
    const current = await getRelation(supabase, req.country_id, targetCountryId);
    const [a, b] = normalizePair(req.country_id, targetCountryId);
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

  if (key === "ouverture_diplomatique") {
    const targetCountryId = payload.target_country_id;
    if (!targetCountryId) return { error: "Pays cible manquant pour Ouverture diplomatique." };
    const impactMax = typeof params.impact_maximum === "number" ? params.impact_maximum : 50;
    let relationDelta: number;
    if (diceResults?.impact_roll != null) {
      const total = diceResults.impact_roll.total;
      relationDelta = Math.round(impactMax * (total / 100));
      if (relationDelta < 0) relationDelta = 0;
      if (relationDelta > 100) relationDelta = 100;
    } else {
      relationDelta = 0;
    }
    const current = await getRelation(supabase, req.country_id, targetCountryId);
    const [a, b] = normalizePair(req.country_id, targetCountryId);
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

  if (key === "prise_influence") {
    const targetCountryId = payload.target_country_id;
    if (!targetCountryId) return { error: "Pays cible manquant pour Prise d'influence." };
    const impactMax = typeof params.impact_maximum === "number" ? params.impact_maximum : 100;
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
      .eq("controller_country_id", req.country_id)
      .maybeSingle();
    const currentShare = existingRow != null ? Number(existingRow.share_pct) : 0;
    const newShare = Math.min(100, currentShare + impactPct);
    const { error: ctrlErr } = await supabase
      .from("country_control")
      .upsert(
        {
          country_id: targetCountryId,
          controller_country_id: req.country_id,
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

  const effect = req.admin_effect_added as AdminEffectAdded | null;
  if (effect && typeof effect === "object" && effect.name && effect.effect_kind) {
    const targetCountryId =
      key === "prise_influence" && payload.target_country_id
        ? payload.target_country_id
        : req.country_id;

    if (effect.application === "immediate") {
      const immErr = await applyImmediateEffect(supabase, targetCountryId, effect);
      if (immErr.error) return immErr;
    } else {
      const durationKind = effect.duration_kind === "updates" ? "days" : (effect.duration_kind ?? "days");
      const durationRemaining = durationKind === "permanent" ? 0 : (Number(effect.duration_remaining) || 30);
      const row = {
        country_id: targetCountryId,
        name: effect.name,
        effect_kind: effect.effect_kind,
        effect_target: effect.effect_target ?? null,
        effect_subtype: effect.effect_subtype ?? null,
        value: Number(effect.value),
        duration_kind: durationKind,
        duration_remaining: durationRemaining,
      };
      const { error: insErr } = await supabase.from("country_effects").insert(row);
      if (insErr) return { error: insErr.message };
    }
  }

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };

  const [countryRes, targetCountryRes, worldDateRes] = await Promise.all([
    supabase.from("countries").select("name").eq("id", req.country_id).single(),
    targetCountryId
      ? supabase.from("countries").select("name").eq("id", targetCountryId).single()
      : Promise.resolve({ data: null }),
    supabase.from("rule_parameters").select("value").eq("key", "world_date").maybeSingle(),
  ]);
  const countryName = (countryRes.data as { name?: string } | null)?.name ?? "";
  const targetCountryName = (targetCountryRes.data as { name?: string } | null)?.name ?? "";
  const worldDateVal = (worldDateRes.data as { value?: { month?: number; year?: number } } | null)?.value;
  const resolutionDate =
    worldDateVal && typeof worldDateVal.month === "number" && typeof worldDateVal.year === "number"
      ? formatWorldDateForDiscord({ month: worldDateVal.month, year: worldDateVal.year })
      : new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });

  dispatchToDiscord(
    `${key}_accepted`,
    {
      country_id: req.country_id,
      country_name: countryName,
      target_country_id: targetCountryId ?? undefined,
      target_country_name: targetCountryName,
      action_label: actionLabel,
      resolution_date: resolutionDate,
      date: resolutionDate,
      dice_success: diceSuccess ? "true" : "false",
      dice_success_label: diceSuccess ? "Succès" : "Échec",
      impact_magnitude_text: discordImpactMagnitude ?? undefined,
      impact_value: discordImpactValue != null ? discordImpactValue : undefined,
      impact_label: discordImpactLabel,
    },
    supabase
  ).catch(() => {});

  revalidatePath("/admin/demandes");
  revalidatePath("/pays");
  revalidatePath("/");
  return {};
}

export async function refuseRequest(
  requestId: string,
  refundActions: boolean,
  refusalMessage: string
): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, status, payload")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  const refPayload = (req.payload ?? {}) as Record<string, string>;
  const refTargetCountryId = typeof refPayload.target_country_id === "string" ? refPayload.target_country_id : undefined;

  if (refundActions) {
    const { data: actionType } = await supabase
      .from("state_action_types")
      .select("cost")
      .eq("id", req.action_type_id)
      .single();
    const cost = actionType?.cost ?? 1;
    const { data: balanceRow } = await supabase
      .from("country_state_action_balance")
      .select("balance")
      .eq("country_id", req.country_id)
      .single();
    const current = balanceRow?.balance ?? 0;
    await supabase
      .from("country_state_action_balance")
      .upsert(
        {
          country_id: req.country_id,
          balance: current + cost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "country_id" }
      );
  }

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({
      status: "refused",
      refund_actions: refundActions,
      refusal_message: refusalMessage.trim() || null,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/demandes");
  revalidatePath("/pays");
  return {};
}
