"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  getEffectsForCountry,
  getForcedMinPcts,
  getAllocationCapPercent,
  type EffectResolutionContext,
  type ResolvedEffect,
} from "@/lib/countryEffects";
import { resolveAllLawEffectsForCountry, type CountryLawRow } from "@/lib/laws";
import { persistWorldIdeologies } from "@/lib/ideologyServer";
import { normalizeIdeologyScores } from "@/lib/ideology";

const BUDGET_PCT_KEYS = [
  "pct_etat",
  "pct_education",
  "pct_recherche",
  "pct_infrastructure",
  "pct_sante",
  "pct_industrie",
  "pct_defense",
  "pct_interieur",
  "pct_affaires_etrangeres",
] as const;

type BudgetPcts = Record<(typeof BUDGET_PCT_KEYS)[number], number>;

function getMobilisationLevelKey(
  score: number,
  levelThresholds: Record<string, number> | undefined
): string | null {
  if (!levelThresholds || typeof score !== "number") return null;
  const entries = Object.entries(levelThresholds)
    .filter(([, val]) => typeof val === "number")
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const found = entries.find(([, val]) => (val as number) <= score);
  return found ? found[0] : null;
}

function buildMobilisationLevelEffects(
  levelKey: string | null,
  raw: unknown
): Array<{ effect_kind: string; effect_target: string | null; value: number }> {
  if (!Array.isArray(raw) || !levelKey) return [];
  return raw
    .filter(
      (e: unknown): e is { level: string; effect_kind: string; effect_target: string | null; value: number } =>
        e != null &&
        typeof (e as { level?: string }).level === "string" &&
        (e as { level: string }).level === levelKey &&
        typeof (e as { effect_kind?: unknown }).effect_kind === "string" &&
        typeof (e as { value?: unknown }).value === "number"
    )
    .map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
    }));
}

function buildGlobalGrowthEffects(raw: unknown): Array<{ effect_kind: string; effect_target: string | null; value: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e: unknown): e is { effect_kind: string; effect_target: string | null; value: number } =>
        e != null &&
        typeof (e as { effect_kind?: unknown }).effect_kind === "string" &&
        typeof (e as { value?: unknown }).value === "number"
    )
    .map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: (e.effect_target ?? null) as string | null,
      value: Number(e.value),
    }));
}

function buildAiEffects(raw: unknown): Array<{ effect_kind: string; effect_target: string | null; value: number }> {
  return buildGlobalGrowthEffects(raw);
}

/** Génère des pcts aléatoires respectant mins et cap (somme <= effectiveCap, chaque pct >= min). */
function randomizeBudgetPcts(forcedMinPcts: Record<string, number>, allocationCap: number): BudgetPcts {
  const effectiveCap = Math.min(100, Math.max(0, allocationCap));
  const mins: BudgetPcts = {
    pct_etat: Math.max(0, forcedMinPcts.pct_etat ?? 0),
    pct_education: Math.max(0, forcedMinPcts.pct_education ?? 0),
    pct_recherche: Math.max(0, forcedMinPcts.pct_recherche ?? 0),
    pct_infrastructure: Math.max(0, forcedMinPcts.pct_infrastructure ?? 0),
    pct_sante: Math.max(0, forcedMinPcts.pct_sante ?? 0),
    pct_industrie: Math.max(0, forcedMinPcts.pct_industrie ?? 0),
    pct_defense: Math.max(0, forcedMinPcts.pct_defense ?? 0),
    pct_interieur: Math.max(0, forcedMinPcts.pct_interieur ?? 0),
    pct_affaires_etrangeres: Math.max(0, forcedMinPcts.pct_affaires_etrangeres ?? 0),
  };
  const sumMin = BUDGET_PCT_KEYS.reduce((s, k) => s + mins[k], 0);
  if (sumMin >= effectiveCap) {
    const scale = sumMin > 0 ? effectiveCap / sumMin : 0;
    BUDGET_PCT_KEYS.forEach((k) => {
      mins[k] = Math.round(mins[k] * scale * 100) / 100;
    });
    return mins;
  }
  const remaining = effectiveCap - sumMin;
  const weights = BUDGET_PCT_KEYS.map(() => Math.random());
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const pcts: BudgetPcts = { ...mins };
  const lastKey = BUDGET_PCT_KEYS[BUDGET_PCT_KEYS.length - 1];
  const firstKeys = BUDGET_PCT_KEYS.slice(0, -1);
  let sumFirst = 0;
  firstKeys.forEach((k, i) => {
    const add = (remaining * weights[i]) / sumWeights;
    pcts[k] = Math.round((mins[k] + add) * 100) / 100;
    sumFirst += pcts[k];
  });
  pcts[lastKey] = Math.floor((effectiveCap - sumFirst) * 100) / 100;
  pcts[lastKey] = Math.max(mins[lastKey], pcts[lastKey]);
  const total = BUDGET_PCT_KEYS.reduce((s, k) => s + pcts[k], 0);
  if (Math.round(total * 100) / 100 > effectiveCap) {
    const excess = Math.ceil((total - effectiveCap) * 100) / 100;
    const donor = firstKeys.find((k) => pcts[k] - mins[k] >= excess);
    if (donor) {
      pcts[donor] = Math.floor((pcts[donor] - excess) * 100) / 100;
      pcts[donor] = Math.max(mins[donor], pcts[donor]);
    } else {
      pcts[lastKey] = Math.floor((pcts[lastKey] - excess) * 100) / 100;
      pcts[lastKey] = Math.max(mins[lastKey], pcts[lastKey]);
    }
  }
  return pcts;
}

const RESET_POPULATION = 50_000_000;
const RESET_GDP = 600_000_000_000;
const RESET_STABILITY = 0;
const RESET_STAT = 5;

/**
 * Réinitialise les stats de tous les pays (réservé aux admins).
 * - Population : 50 Mio
 * - PIB : 600 Bn
 * - Stabilité : 0
 * - Militarisme, Industrie, Science : 5
 */
export async function resetAllCountriesStats(): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { data: countries, error: fetchError } = await supabase
    .from("countries")
    .select("id");

  if (fetchError) return { error: fetchError.message };
  if (!countries?.length) return { updated: 0 };

  const ids = countries.map((c) => c.id);
  const { error: updateError } = await supabase
    .from("countries")
    .update({
      population: RESET_POPULATION,
      gdp: RESET_GDP,
      stability: RESET_STABILITY,
      militarism: RESET_STAT,
      industry: RESET_STAT,
      science: RESET_STAT,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateError) return { error: updateError.message };

  revalidatePath("/admin/pays");
  revalidatePath("/");
  revalidatePath("/classement");
  revalidatePath("/ideologie");
  return { updated: ids.length };
}

/**
 * Lance le cron de mise à jour quotidienne (snapshot + mise à jour des pays).
 * Réservé aux admins. Utilise le service role pour exécuter run_daily_country_update().
 */
export async function runDailyCountryUpdate(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const serviceSupabase = createServiceRoleClient();
  const { error } = await serviceSupabase.rpc("run_daily_country_update");

  if (error) return { error: error.message };
  await persistWorldIdeologies(serviceSupabase);

  revalidatePath("/admin/pays");
  revalidatePath("/");
  revalidatePath("/classement");
  revalidatePath("/ideologie");
  revalidateTag("country-page-globals", "max");
  return {};
}

/**
 * Assigne des budgets nationaux aléatoires à tous les pays (respect des mins forcés et du plafond d'allocation).
 * Réservé aux admins.
 */
export async function randomizeNationalBudgets(): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const [countriesRes, effectsRes, lawsRes, rulesRes, budgetsRes] = await Promise.all([
    supabase.from("countries").select("id, ai_status"),
    supabase.from("country_effects").select("country_id, effect_kind, effect_target, value, duration_remaining, duration_kind").or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("country_laws").select("country_id, law_key, score, target_score"),
    supabase.from("rule_parameters").select("key, value").in("key", [
      "mobilisation_config", "mobilisation_level_effects",
      "law_auto_industry_config", "law_auto_industry_level_effects",
      "law_air_industry_config", "law_air_industry_level_effects",
      "law_naval_industry_config", "law_naval_industry_level_effects",
      "law_research_config", "law_research_level_effects",
      "global_growth_effects", "ai_major_effects", "ai_minor_effects",
    ]),
    supabase.from("country_budget").select("id, country_id, budget_fraction"),
  ]);

  if (countriesRes.error) return { error: countriesRes.error.message };
  const countries = countriesRes.data ?? [];
  if (!countries.length) return { updated: 0 };

  const rulesByKey: Record<string, { value: unknown }> = {};
  (rulesRes.data ?? []).forEach((r: { key: string; value: unknown }) => {
    rulesByKey[r.key] = { value: r.value };
  });
  const globalGrowthEffectsRaw = rulesByKey.global_growth_effects?.value;
  const globalGrowthEffects = buildGlobalGrowthEffects(globalGrowthEffectsRaw);
  const aiMajorEffects = buildAiEffects(rulesByKey.ai_major_effects?.value);
  const aiMinorEffects = buildAiEffects(rulesByKey.ai_minor_effects?.value);

  const effectsByCountry = new Map<string, Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number }>>();
  (effectsRes.data ?? []).forEach((e: { country_id: string; effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number }) => {
    if (!effectsByCountry.has(e.country_id)) effectsByCountry.set(e.country_id, []);
    effectsByCountry.get(e.country_id)!.push({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
      duration_remaining: e.duration_remaining,
    });
  });
  const lawsByCountry = new Map<string, CountryLawRow[]>();
  (lawsRes.data ?? []).forEach((m: { country_id: string; law_key: string; score: number; target_score: number }) => {
    const list = lawsByCountry.get(m.country_id) ?? [];
    list.push({ country_id: m.country_id, law_key: m.law_key, score: Number(m.score ?? 0), target_score: Number(m.target_score ?? 0) });
    lawsByCountry.set(m.country_id, list);
  });
  const budgetByCountry = new Map<string, { id: string; budget_fraction: number }>();
  (budgetsRes.data ?? []).forEach((b: { id: string; country_id: string; budget_fraction?: number }) => {
    budgetByCountry.set(b.country_id, { id: b.id, budget_fraction: Number(b.budget_fraction ?? 0.1) });
  });

  let updated = 0;
  for (const country of countries) {
    const lawRows = lawsByCountry.get(country.id) ?? [];
    const lawLevelEffects = resolveAllLawEffectsForCountry(lawRows, rulesByKey);
    const countryEffects = (effectsByCountry.get(country.id) ?? []).map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target,
      value: e.value,
      duration_remaining: e.duration_remaining,
    }));

    const ctx: EffectResolutionContext = {
      countryId: country.id,
      countryEffects: countryEffects as Parameters<typeof getEffectsForCountry>[0]["countryEffects"],
      lawLevelEffects: lawLevelEffects,
      globalGrowthEffects,
      ai_status: (country as { ai_status?: string | null }).ai_status ?? null,
      aiMajorEffects,
      aiMinorEffects,
    };
    const resolvedEffects: ResolvedEffect[] = getEffectsForCountry(ctx);
    const forcedMinPcts = getForcedMinPcts(resolvedEffects);
    const allocationCap = getAllocationCapPercent(resolvedEffects);
    const pcts = randomizeBudgetPcts(forcedMinPcts, allocationCap);

    const existing = budgetByCountry.get(country.id);
    const row = {
      ...pcts,
      budget_fraction: existing?.budget_fraction ?? 0.1,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await supabase.from("country_budget").update(row).eq("id", existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("country_budget").insert({
        country_id: country.id,
        ...row,
      });
      if (error) return { error: error.message };
    }
    updated++;
  }

  revalidatePath("/admin/pays");
  revalidatePath("/");
  return { updated };
}

/**
 * Randomise les idéologies de tous les pays pour les tests UI / gameplay.
 * Réservé aux admins.
 */
export async function randomizeCountryIdeologies(): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { data: countries, error: fetchError } = await supabase.from("countries").select("id, name");
  if (fetchError) return { error: fetchError.message };
  if (!countries?.length) return { updated: 0 };

  const serviceSupabase = createServiceRoleClient();
  for (const country of countries) {
    const scores = normalizeIdeologyScores({
      monarchism: Math.random(),
      republicanism: Math.random(),
      cultism: Math.random(),
    });
    const dominant =
      scores.monarchism >= scores.republicanism && scores.monarchism >= scores.cultism
        ? "monarchism"
        : scores.republicanism >= scores.cultism
          ? "republicanism"
          : "cultism";
    const { error } = await serviceSupabase
      .from("countries")
      .update({
        ideology_monarchism: Number(scores.monarchism.toFixed(4)),
        ideology_republicanism: Number(scores.republicanism.toFixed(4)),
        ideology_cultism: Number(scores.cultism.toFixed(4)),
        ideology_drift_monarchism: 0,
        ideology_drift_republicanism: 0,
        ideology_drift_cultism: 0,
        ideology_breakdown: {
          dominant,
          source: "admin_randomize",
          top_factors: [{ label: "Randomisation de test", ideology: dominant, value: 100 }],
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", country.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/pays");
  revalidatePath("/");
  revalidatePath("/classement");
  revalidatePath("/ideologie");
  revalidateTag("country-page-globals", "max");
  return { updated: countries.length };
}

/**
 * Supprime un pays (admin uniquement). Avec confirmation côté client.
 * Les lignes liées (relations, effets, budget, etc.) sont supprimées en cascade.
 */
export async function deleteCountry(countryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { error } = await supabase.from("countries").delete().eq("id", countryId);
  if (error) return { error: error.message };

  revalidatePath("/admin/pays");
  revalidatePath("/");
  revalidatePath("/classement");
  revalidatePath("/ideologie");
  revalidateTag("country-page-globals", "max");
  return {};
}

/** Met à jour le statut IA d'un pays (admin uniquement). Refusé si le pays est joué par un joueur. */
export async function updateCountryAiStatus(
  countryId: string,
  aiStatus: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: adminRow } = await supabase.from("admins").select("id").limit(1).single();
  if (!adminRow) return { error: "Non autorisé." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("country_id", countryId)
    .maybeSingle();
  if (playerRow) return { error: "Ce pays est joué par un joueur, le statut IA ne peut pas être modifié." };

  const value = aiStatus === "major" || aiStatus === "minor" ? aiStatus : null;
  const { error } = await supabase
    .from("countries")
    .update({ ai_status: value, updated_at: new Date().toISOString() })
    .eq("id", countryId);
  if (error) return { error: error.message };
  revalidatePath("/admin/pays");
  revalidatePath("/");
  return {};
}

/** Met à jour le continent d'un pays (admin uniquement). */
export async function updateCountryContinent(
  countryId: string,
  continentId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: adminRow } = await supabase.from("admins").select("id").limit(1).single();
  if (!adminRow) return { error: "Non autorisé." };

  const { error } = await supabase
    .from("countries")
    .update({ continent_id: continentId || null, updated_at: new Date().toISOString() })
    .eq("id", countryId);
  if (error) return { error: error.message };
  revalidatePath("/admin/pays");
  revalidatePath("/");
  return {};
}
