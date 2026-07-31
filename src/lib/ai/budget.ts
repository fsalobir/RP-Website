import "server-only";

import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AI_EFFORTS, AI_MODELS, type AiEffort, type AiModel } from "./contracts";
import {
  calculateAiCost,
  calculateReservationCost,
  parseModelPrices,
  type ModelPrices,
  type TokenUsage,
} from "./pricing";

export type AiSettings = {
  player_enabled: boolean;
  player_model: AiModel;
  player_effort: AiEffort;
  admin_simple_model: "gpt-5.6-terra" | "gpt-5.6-sol";
  admin_complex_model: "gpt-5.6-terra" | "gpt-5.6-sol";
  admin_effort: AiEffort;
  budget_usd: number;
  prices: unknown;
  updated_at: string;
};

export function isAiModel(value: unknown): value is AiModel {
  return typeof value === "string" && (AI_MODELS as readonly string[]).includes(value);
}
export function isAiEffort(value: unknown): value is AiEffort {
  return typeof value === "string" && (AI_EFFORTS as readonly string[]).includes(value);
}

export async function getAiSettings(): Promise<AiSettings> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("ai_assistant_settings").select("*").eq("id", true).single();
  if (error || !data) throw new Error(error?.message ?? "Réglages IA introuvables.");
  if (!isAiModel(data.player_model) || !isAiEffort(data.player_effort) || !isAiEffort(data.admin_effort)) {
    throw new Error("Les réglages IA sont invalides.");
  }
  return {
    ...data,
    player_model: data.player_model,
    player_effort: data.player_effort,
    admin_simple_model: data.admin_simple_model === "gpt-5.6-sol" ? "gpt-5.6-sol" : "gpt-5.6-terra",
    admin_complex_model: data.admin_complex_model === "gpt-5.6-terra" ? "gpt-5.6-terra" : "gpt-5.6-sol",
    admin_effort: data.admin_effort,
    budget_usd: Number(data.budget_usd),
  };
}

export function stableSafetyIdentifier(userId: string): string {
  return createHash("sha256").update(`fates-of-nations:ai:v1:${userId}`).digest("hex");
}

export async function reserveAiCall(input: {
  userId: string;
  surface: "player" | "admin_fallback";
  model: AiModel;
  effort: AiEffort;
  prompt: string;
  maxOutputTokens: number;
  prices: unknown;
}): Promise<{ eventId: string; prices: ModelPrices; reservedCostUsd: number }> {
  const prices = parseModelPrices(input.prices, input.model);
  const reservedCostUsd = calculateReservationCost(input.prompt, input.maxOutputTokens, prices);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("ai_reserve_usage", {
    p_user_id: input.userId,
    p_surface: input.surface,
    p_model: input.model,
    p_effort: input.effort,
    p_reserved_cost_usd: reservedCostUsd,
  });
  if (error || typeof data !== "string") {
    if (error?.message.includes("budget IA commun")) throw new Error("AI_BUDGET_EXHAUSTED");
    throw new Error(error?.message ?? "Impossible de réserver le budget IA.");
  }
  return { eventId: data, prices, reservedCostUsd };
}

export async function settleAiCall(eventId: string, usage: TokenUsage, prices: ModelPrices): Promise<number> {
  const costUsd = calculateAiCost(usage, prices);
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("ai_settle_usage", {
    p_event_id: eventId,
    p_input_tokens: usage.inputTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_output_tokens: usage.outputTokens,
    p_actual_cost_usd: costUsd,
  });
  if (error) throw new Error(error.message);
  return costUsd;
}

export async function releaseAiCall(eventId: string, errorCode: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.rpc("ai_release_usage", {
    p_event_id: eventId,
    p_error_code: errorCode.slice(0, 120),
  });
}
