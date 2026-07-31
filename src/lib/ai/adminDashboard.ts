import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAiEffort, isAiModel } from "./budget";

export async function getAiAdminDashboard(userId: string) {
  const supabase = createServiceRoleClient();
  const [settings, usage, players, feedback, workers, jobs] = await Promise.all([
    supabase.from("ai_assistant_settings").select("*").eq("id", true).single(),
    supabase.from("ai_usage_events").select("user_id,surface,status,reserved_cost_usd,actual_cost_usd,input_tokens,cached_input_tokens,output_tokens,created_at").order("created_at", { ascending: false }),
    supabase.from("country_players").select("user_id,name,email,country_id,countries(name)"),
    supabase.from("ai_feedback").select("id,user_id,country_id,rating,is_report,question,answer,created_at,countries(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("ai_admin_workers").select("id,label,token_hint,enabled,sandbox_verified_at,last_seen_at,codex_version,worker_version,status,current_job_id,created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("ai_admin_jobs").select("id,status,stage,summary,execution_mode,request_kind,error_message,created_at,expires_at").eq("author_user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const result of [settings, usage, players, feedback, workers, jobs]) {
    if (result.error) throw new Error(result.error.message);
  }

  const playerById = new Map((players.data ?? []).map((player) => [player.user_id, player]));
  const usageRows = usage.data ?? [];
  const costOf = (row: typeof usageRows[number]) => Number(row.status === "settled" ? row.actual_cost_usd : row.status === "reserved" ? row.reserved_cost_usd : 0);
  const perPlayer = new Map<string, { userId: string; name: string; country: string | null; costUsd: number; calls: number }>();
  for (const row of usageRows.filter((entry) => entry.surface === "player" && entry.status !== "released")) {
    const player = playerById.get(row.user_id);
    const current = perPlayer.get(row.user_id) ?? {
      userId: row.user_id,
      name: player?.name || player?.email || "Joueur",
      country: (player?.countries as { name?: string } | null)?.name ?? null,
      costUsd: 0,
      calls: 0,
    };
    current.costUsd += costOf(row);
    current.calls++;
    perPlayer.set(row.user_id, current);
  }

  return {
    settings: settings.data,
    usage: {
      committedUsd: usageRows.reduce((total, row) => total + costOf(row), 0),
      settledUsd: usageRows.filter((row) => row.status === "settled").reduce((total, row) => total + costOf(row), 0),
      reservedUsd: usageRows.filter((row) => row.status === "reserved").reduce((total, row) => total + costOf(row), 0),
      calls: usageRows.filter((row) => row.status === "settled").length,
      inputTokens: usageRows.reduce((total, row) => total + Number(row.input_tokens ?? 0), 0),
      cachedInputTokens: usageRows.reduce((total, row) => total + Number(row.cached_input_tokens ?? 0), 0),
      outputTokens: usageRows.reduce((total, row) => total + Number(row.output_tokens ?? 0), 0),
      perPlayer: [...perPlayer.values()].sort((a, b) => b.costUsd - a.costUsd),
    },
    feedback: feedback.data ?? [],
    reportCount: (feedback.data ?? []).filter((row) => row.is_report).length,
    worker: workers.data?.[0] ?? null,
    jobs: jobs.data ?? [],
  };
}

export async function updateAiSettings(userId: string, raw: Record<string, unknown>) {
  const playerModel = raw.playerModel;
  const playerEffort = raw.playerEffort;
  const simpleModel = raw.adminSimpleModel;
  const complexModel = raw.adminComplexModel;
  const adminEffort = raw.adminEffort;
  const budgetUsd = Number(raw.budgetUsd);
  if (!isAiModel(playerModel) || !isAiEffort(playerEffort) || !isAiEffort(adminEffort)
      || !["gpt-5.6-terra", "gpt-5.6-sol"].includes(String(simpleModel))
      || !["gpt-5.6-terra", "gpt-5.6-sol"].includes(String(complexModel))
      || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 100_000) {
    throw new Error("Réglages IA invalides.");
  }
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("ai_assistant_settings").update({
    player_enabled: raw.playerEnabled === true,
    player_model: playerModel,
    player_effort: playerEffort,
    admin_simple_model: simpleModel,
    admin_complex_model: complexModel,
    admin_effort: adminEffort,
    budget_usd: budgetUsd,
    updated_by: userId,
  }).eq("id", true);
  if (error) throw new Error(error.message);
}

export async function createWorkerToken(userId: string): Promise<{ token: string; workerId: string }> {
  const token = `fonw_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("ai_rotate_admin_worker", {
    p_token_hash: hash,
    p_token_hint: token.slice(-6),
    p_created_by: userId,
  });
  if (error || typeof data !== "string") throw new Error(error?.message ?? "Création du jeton impossible.");
  return { token, workerId: data };
}

export async function revokeWorker(workerId: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("ai_admin_workers").update({ enabled: false, status: "disabled", current_job_id: null }).eq("id", workerId);
  if (error) throw new Error(error.message);
}
