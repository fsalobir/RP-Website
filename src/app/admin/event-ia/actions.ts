"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getRelation } from "@/lib/relations";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import type { DiceResults, DiceRollResult, MilitaryBranch } from "@/types/database";
import {
  applyStateActionConsequences,
  ACTION_KEYS_REQUIRING_IMPACT_ROLL,
} from "@/lib/stateActionConsequences";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null, userId: user.id };
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

export async function rollD100ForAiEvent(
  eventId: string,
  rollType: "success" | "impact",
  adminModifiers: Array<{ label: string; value: number }> = []
): Promise<{ error?: string; result?: DiceRollResult }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, country_id, action_type_id, status, payload, dice_results")
    .eq("id", eventId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (req.status !== "pending") return { error: "Cet événement a déjà été traité." };

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
        influenceModifier = Math.round((-malusMax * (ratioEquilibre - ratio)) / (ratioEquilibre - ratioMin));
      } else if (ratio > ratioEquilibre) {
        if (ratio >= ratioMax) {
          influenceModifier = bonusMax;
        } else {
          influenceModifier = Math.round((bonusMax * (ratio - ratioEquilibre)) / (ratioMax - ratioEquilibre));
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

  const fullRangesConfig = (rangesRow?.value as Record<string, { min: number; max: number }>) ?? {};
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
    .from("ai_event_requests")
    .update({ dice_results: next as unknown as Record<string, unknown> })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/event-ia");
  return { result };
}

export async function acceptAiEvent(
  eventId: string,
  options?: { scheduleWithAmplitude?: boolean }
): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: ev, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, country_id, action_type_id, status, payload, admin_effect_added, dice_results")
    .eq("id", eventId)
    .single();

  if (fetchErr || !ev) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (ev.status !== "pending") return { error: "Cet événement a déjà été traité." };

  const { data: actionType } = await supabase
    .from("state_action_types")
    .select("key, label_fr, params_schema")
    .eq("id", ev.action_type_id)
    .single();

  const key = (actionType?.key ?? "") as string;
  const actionLabel = (actionType as { label_fr?: string } | null)?.label_fr ?? key;
  const payload = (ev.payload ?? {}) as Record<string, string>;
  const params = (actionType?.params_schema ?? {}) as Record<string, number>;
  const diceResults = ev.dice_results as DiceResults | null;

  if (ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(key) && !diceResults?.impact_roll) {
    return { error: "Un jet d'impact doit être réalisé avant d'accepter cet événement." };
  }

  const scheduleWithAmplitude = options?.scheduleWithAmplitude ?? false;

  if (scheduleWithAmplitude) {
    const { data: configRow } = await supabase
      .from("rule_parameters")
      .select("value")
      .eq("key", "ai_events_config")
      .maybeSingle();
    const config = (configRow?.value ?? {}) as { trigger_amplitude_minutes?: number };
    const amplitude = Math.max(0, Number(config.trigger_amplitude_minutes) || 0);
    const delayMinutes = Math.random() * amplitude;
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("ai_event_requests")
      .update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        scheduled_trigger_at: scheduledAt,
      })
      .eq("id", eventId);

    if (upErr) return { error: upErr.message };
    revalidatePath("/admin/event-ia");
    revalidatePath("/pays");
    revalidatePath("/");
    return {};
  }

  const applyErr = await applyStateActionConsequences({
    supabase,
    countryId: ev.country_id,
    payload,
    adminEffectAdded: ev.admin_effect_added,
    diceResults,
    actionKey: key,
    actionLabel,
    paramsSchema: params,
  });
  if (applyErr.error) return applyErr;

  const { error: upErr } = await supabase
    .from("ai_event_requests")
    .update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      consequences_applied_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/event-ia");
  revalidatePath("/pays");
  revalidatePath("/");
  return {};
}

export async function refuseAiEvent(eventId: string, refusalMessage: string): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: ev, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, status")
    .eq("id", eventId)
    .single();

  if (fetchErr || !ev) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (ev.status !== "pending") return { error: "Cet événement a déjà été traité." };

  const { error: upErr } = await supabase
    .from("ai_event_requests")
    .update({
      status: "refused",
      refusal_message: refusalMessage.trim() || null,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/event-ia");
  return {};
}

export async function createAiEvent(payload: {
  actionTypeId: string;
  countryId: string;
  targetCountryId: string;
}): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { actionTypeId, countryId, targetCountryId } = payload;
  if (targetCountryId === countryId) {
    return { error: "La cible ne doit pas être l'émetteur." };
  }

  const { error: insErr } = await supabase.from("ai_event_requests").insert({
    country_id: countryId,
    action_type_id: actionTypeId,
    status: "pending",
    payload: { target_country_id: targetCountryId },
    source: "manual",
  });

  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/event-ia");
  return {};
}

/** Simule un passage du cron de génération des events IA (appelle run_ai_events_cron). Réservé aux admins. */
export async function simulateAiEventsCron(): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { error } = await supabase.rpc("run_ai_events_cron", { p_force: true });
  if (error) return { error: error.message };

  revalidatePath("/admin/event-ia");
  return {};
}
