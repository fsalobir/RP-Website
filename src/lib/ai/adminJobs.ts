import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  currentSnapshotForPreparedAction,
  executePreparedAdminAction,
  hashSnapshot,
  linkAdminChanges,
  prepareAdminAction,
  restorePreparedAdminAction,
  type PreparedAdminAction,
} from "./adminActionRegistry";
import {
  adminInstructions,
  buildAdminGameContext,
  classifyAdminRequest,
  parseAdminActionPlan,
  ADMIN_PLAN_SCHEMA,
} from "./adminAssistant";
import { createOpenAIText } from "./openai";
import { getAiSettings, releaseAiCall, reserveAiCall, settleAiCall, stableSafetyIdentifier } from "./budget";
import type { AdminActionPlan, AdminJobView, AdminRequestKind } from "./contracts";

type JobRow = Record<string, unknown> & {
  id: string;
  author_user_id: string;
  worker_id: string | null;
  execution_mode: "local" | "api_fallback";
  request_kind: AdminRequestKind;
  model: string | null;
  effort: string | null;
  status: string;
  stage: AdminJobView["stage"];
  prompt_text: string | null;
  summary: string | null;
  plan: AdminActionPlan | null;
  preview: unknown;
  result: unknown;
  error_message: string | null;
  first_approved_by: string | null;
  expires_at: string;
  created_at: string;
  restore_of_job_id: string | null;
};

type ItemRow = Record<string, unknown> & {
  id: string;
  job_id: string;
  sequence: number;
  action_id: string;
  parameters: Record<string, unknown>;
  risk: "read" | "reversible" | "isolated";
  reversible: boolean;
  status: "planned" | "previewed" | "completed" | "failed" | "restored";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  expected_hash: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
};

const TERMINAL = ["completed", "partial", "failed", "cancelled", "expired"];

async function rejectExpired(service: SupabaseClient, job: JobRow) {
  if (!TERMINAL.includes(job.status) && job.status !== "executing" && new Date(job.expires_at).getTime() <= Date.now()) {
    await service.from("ai_admin_jobs").update({ status: "expired" }).eq("id", job.id).eq("status", job.status);
    throw new Error("Cette tâche a expiré après 24 heures sans validation.");
  }
}

async function adminJob(service: SupabaseClient, jobId: string, userId?: string): Promise<JobRow> {
  let query = service.from("ai_admin_jobs").select("*").eq("id", jobId);
  if (userId) query = query.eq("author_user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("Tâche introuvable.");
  return data as JobRow;
}

async function jobItems(service: SupabaseClient, jobId: string): Promise<ItemRow[]> {
  const { data, error } = await service.from("ai_admin_job_items").select("*").eq("job_id", jobId).order("sequence");
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemRow[];
}

async function workerOnline(service: SupabaseClient): Promise<boolean> {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data } = await service
    .from("ai_admin_workers")
    .select("id")
    .eq("enabled", true)
    .not("sandbox_verified_at", "is", null)
    .gte("last_seen_at", cutoff)
    .neq("status", "disabled")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function insertPlanItems(service: SupabaseClient, jobId: string, plan: AdminActionPlan) {
  if (plan.actions.length === 0) return;
  const { error } = await service.from("ai_admin_job_items").insert(plan.actions.map((action, sequence) => ({
    job_id: jobId,
    sequence,
    action_id: action.id,
    parameters: action.parameters,
    risk: action.risk,
    reversible: action.risk === "reversible",
  })));
  if (error) throw new Error(error.message);
}

async function finishPlan(service: SupabaseClient, job: JobRow, plan: AdminActionPlan) {
  const hasActions = plan.actions.length > 0;
  const { data: finalized, error } = await service.from("ai_admin_jobs").update({
    summary: plan.summary,
    plan,
    result: hasActions ? null : { answer: plan.answer },
    status: hasActions ? "awaiting_first_approval" : "completed",
    stage: hasActions ? "plan" : "lecture",
  }).eq("id", job.id).in("status", ["claimed", "analyzing"]).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!finalized) throw new Error("Cette tâche a été annulée ou a expiré.");
  await insertPlanItems(service, job.id, plan);
  if (job.worker_id) {
    await service.from("ai_admin_workers").update({ current_job_id: null, status: "idle" }).eq("id", job.worker_id);
  }
}

async function failJob(service: SupabaseClient, job: JobRow, message: string) {
  await service.from("ai_admin_jobs").update({ status: "failed", error_message: message.slice(0, 1000) })
    .eq("id", job.id).in("status", ["claimed", "analyzing", "awaiting_first_approval"]);
  if (job.worker_id) {
    await service.from("ai_admin_workers").update({ current_job_id: null, status: "idle" }).eq("id", job.worker_id);
  }
}

export async function createAdminJob(input: {
  userId: string;
  message: string;
  fallbackConfirmed: boolean;
  userSupabase: SupabaseClient;
}): Promise<{ jobId: string; fallbackRequired?: boolean }> {
  const message = input.message.trim();
  if (message.length < 1 || message.length > 4000) throw new Error("La demande doit contenir entre 1 et 4 000 caractères.");
  const service = createServiceRoleClient();
  const settings = await getAiSettings();
  const classification = classifyAdminRequest(message);
  const online = await workerOnline(service);
  if (!online && classification.requestKind === "code_read") throw new Error("LOCAL_CODE_UNAVAILABLE");
  if (!online && !input.fallbackConfirmed) return { jobId: "", fallbackRequired: true };

  const executionMode = online ? "local" : "api_fallback";
  const model = classification.complexity === "complex" ? settings.admin_complex_model : settings.admin_simple_model;
  const { data, error } = await service.from("ai_admin_jobs").insert({
    author_user_id: input.userId,
    execution_mode: executionMode,
    request_kind: classification.requestKind,
    model,
    effort: settings.admin_effort,
    status: executionMode === "local" ? "queued" : "analyzing",
    stage: executionMode === "local" ? "file" : "analysis",
    prompt_text: message,
    paid_confirmed_at: executionMode === "api_fallback" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Création de tâche impossible.");
  const job = data as JobRow;
  if (executionMode === "api_fallback") {
    await runAdminFallback(job, input.userSupabase, settings);
  }
  return { jobId: job.id };
}

async function runAdminFallback(job: JobRow, userSupabase: SupabaseClient, settings: Awaited<ReturnType<typeof getAiSettings>>) {
  const service = createServiceRoleClient();
  let reservation: Awaited<ReturnType<typeof reserveAiCall>> | null = null;
  try {
    const context = await buildAdminGameContext(userSupabase, job.prompt_text ?? "");
    const instructions = adminInstructions(job.request_kind);
    const input = [{ role: "user" as const, content: `DONNÉES VIVANTES AUTORISÉES\n${context}\n\nDEMANDE\n${job.prompt_text}` }];
    const maxOutputTokens = 3500;
    reservation = await reserveAiCall({
      userId: job.author_user_id,
      surface: "admin_fallback",
      model: job.model as "gpt-5.6-terra" | "gpt-5.6-sol",
      effort: settings.admin_effort,
      prompt: `${instructions}\n${JSON.stringify(input)}`,
      maxOutputTokens,
      prices: settings.prices,
    });
    const response = await createOpenAIText({
      model: job.model as "gpt-5.6-terra" | "gpt-5.6-sol",
      effort: settings.admin_effort,
      instructions,
      input,
      safetyIdentifier: stableSafetyIdentifier(job.author_user_id),
      maxOutputTokens,
      jsonSchema: { name: "admin_action_plan", schema: ADMIN_PLAN_SCHEMA },
    });
    await settleAiCall(reservation.eventId, response.usage, reservation.prices);
    reservation = null;
    await finishPlan(service, job, parseAdminActionPlan(response.text, job.request_kind));
  } catch (error) {
    if (reservation) await releaseAiCall(reservation.eventId, error instanceof Error ? error.message : "admin_fallback_error");
    await failJob(service, job, error instanceof Error && error.message === "AI_BUDGET_EXHAUSTED"
      ? "Le budget IA commun est atteint."
      : "L'assistant API n'a pas pu traiter la demande.");
  }
}

export async function finalizeWorkerPlan(input: { workerId: string; jobId: string; output: string }) {
  const service = createServiceRoleClient();
  const job = await adminJob(service, input.jobId);
  await rejectExpired(service, job);
  if (job.worker_id !== input.workerId || !["claimed", "analyzing"].includes(job.status)) throw new Error("Tâche non attribuée à ce relais.");
  try {
    await finishPlan(service, job, parseAdminActionPlan(input.output, job.request_kind));
  } catch (error) {
    await failJob(service, job, error instanceof Error ? error.message : "Résultat local invalide.");
    throw error;
  }
}

function preparedFromItem(item: ItemRow): PreparedAdminAction {
  if (!item.expected_hash) throw new Error("Aperçu incomplet.");
  return {
    actionId: item.action_id,
    risk: item.risk,
    reversible: item.reversible,
    parameters: item.parameters,
    before: item.before_data,
    after: item.after_data,
    expectedHash: item.expected_hash,
  };
}

async function prepareNormalJob(service: SupabaseClient, userSupabase: SupabaseClient, job: JobRow, items: ItemRow[]) {
  const previews = [];
  for (const item of items) {
    const prepared = await prepareAdminAction(userSupabase, {
      id: item.action_id,
      parameters: item.parameters,
      reason: String((job.plan?.actions[item.sequence] as { reason?: string } | undefined)?.reason ?? "Action validée"),
      risk: item.risk,
    }, item.after_data);
    previews.push({ sequence: item.sequence, actionId: item.action_id, before: prepared.before, after: prepared.after, risk: prepared.risk });
    await service.from("ai_admin_job_items").update({
      parameters: prepared.parameters,
      reversible: prepared.reversible,
      before_data: prepared.before,
      after_data: prepared.after,
      expected_hash: prepared.expectedHash,
      status: "previewed",
      error_message: null,
    }).eq("id", item.id);
  }
  await service.from("ai_admin_jobs").update({ preview: previews, preview_hash: hashSnapshot(previews), status: "awaiting_second_approval", stage: "validations", error_message: null })
    .eq("id", job.id).in("status", ["preparing_preview", "awaiting_second_approval"]);
}

async function prepareRestoreJob(service: SupabaseClient, userSupabase: SupabaseClient, job: JobRow, items: ItemRow[]) {
  const previews = [];
  for (const item of items) {
    const metadata = item.result as { originalPrepared?: PreparedAdminAction; expectedCurrent?: Record<string, unknown> | null } | null;
    if (!metadata?.originalPrepared) throw new Error("Sauvegarde de restauration absente.");
    const current = await currentSnapshotForPreparedAction(userSupabase, metadata.originalPrepared);
    if (hashSnapshot(current) !== hashSnapshot(metadata.expectedCurrent ?? null)) {
      throw new Error("Les données ont changé depuis l'opération d'origine. Restauration bloquée.");
    }
    previews.push({ sequence: item.sequence, actionId: item.action_id, before: current, after: metadata.originalPrepared.before, risk: "reversible" });
    await service.from("ai_admin_job_items").update({
      before_data: current,
      after_data: metadata.originalPrepared.before,
      expected_hash: hashSnapshot(current),
      status: "previewed",
    }).eq("id", item.id);
  }
  await service.from("ai_admin_jobs").update({ preview: previews, preview_hash: hashSnapshot(previews), status: "awaiting_second_approval", stage: "validations", error_message: null })
    .eq("id", job.id).in("status", ["preparing_preview", "awaiting_second_approval"]);
}

export async function approveAdminJobFirst(input: { userId: string; jobId: string; userSupabase: SupabaseClient }) {
  const service = createServiceRoleClient();
  const job = await adminJob(service, input.jobId, input.userId);
  await rejectExpired(service, job);
  if (job.status !== "awaiting_first_approval") throw new Error("Cette tâche n'attend pas cette validation.");
  const now = new Date().toISOString();
  const { data: claimed } = await service.from("ai_admin_jobs").update({
    status: "preparing_preview", stage: "sauvegarde", first_approved_at: now, first_approved_by: input.userId,
  }).eq("id", job.id).eq("status", "awaiting_first_approval").eq("author_user_id", input.userId).select("id").maybeSingle();
  if (!claimed) throw new Error("Cette validation a déjà été prise en compte.");
  try {
    const items = await jobItems(service, job.id);
    if (job.restore_of_job_id) await prepareRestoreJob(service, input.userSupabase, job, items);
    else await prepareNormalJob(service, input.userSupabase, job, items);
  } catch (error) {
    await service.from("ai_admin_jobs").update({ status: "awaiting_first_approval", stage: "plan", error_message: error instanceof Error ? error.message : "Aperçu impossible." })
      .eq("id", job.id).eq("status", "preparing_preview");
    throw error;
  }
}

async function refreshChangedPreview(service: SupabaseClient, userSupabase: SupabaseClient, job: JobRow, items: ItemRow[]): Promise<boolean> {
  let changed = false;
  for (const item of items) {
    if (job.restore_of_job_id) {
      const metadata = item.result as { originalPrepared?: PreparedAdminAction } | null;
      if (!metadata?.originalPrepared) throw new Error("Sauvegarde de restauration absente.");
      const current = await currentSnapshotForPreparedAction(userSupabase, metadata.originalPrepared);
      if (hashSnapshot(current) !== item.expected_hash) changed = true;
    } else {
      const current = await prepareAdminAction(userSupabase, {
        id: item.action_id, parameters: item.parameters, reason: "Validation finale", risk: item.risk,
      }, item.after_data);
      if (current.expectedHash !== item.expected_hash) changed = true;
    }
  }
  if (changed) {
    if (job.restore_of_job_id) await prepareRestoreJob(service, userSupabase, job, items);
    else await prepareNormalJob(service, userSupabase, job, items);
  }
  return changed;
}

export async function approveAdminJobSecond(input: { userId: string; jobId: string; userSupabase: SupabaseClient }): Promise<{ changed: boolean }> {
  const service = createServiceRoleClient();
  const job = await adminJob(service, input.jobId, input.userId);
  await rejectExpired(service, job);
  if (job.status !== "awaiting_second_approval" || job.first_approved_by !== input.userId) throw new Error("La seconde validation doit venir de l'auteur du plan.");
  const items = await jobItems(service, job.id);
  if (await refreshChangedPreview(service, input.userSupabase, job, items)) return { changed: true };

  const { data: claimed } = await service.from("ai_admin_jobs").update({
    status: "executing", stage: "execution", second_approved_at: new Date().toISOString(), second_approved_by: input.userId,
  }).eq("id", job.id).eq("status", "awaiting_second_approval").eq("first_approved_by", input.userId).select("id").maybeSingle();
  if (!claimed) throw new Error("Cette validation a déjà été prise en compte.");
  await executeJob(service, input.userSupabase, job, items, input.userId);
  return { changed: false };
}

async function executeJob(service: SupabaseClient, userSupabase: SupabaseClient, job: JobRow, items: ItemRow[], userId: string) {
  const results = [];
  let succeeded = 0;
  for (const item of items) {
    const since = new Date().toISOString();
    try {
      let result: Record<string, unknown> | null;
      if (job.restore_of_job_id) {
        const metadata = item.result as { originalPrepared?: PreparedAdminAction } | null;
        if (!metadata?.originalPrepared) throw new Error("Sauvegarde de restauration absente.");
        const current = await currentSnapshotForPreparedAction(userSupabase, metadata.originalPrepared);
        if (hashSnapshot(current) !== item.expected_hash) throw new Error("Les données ont changé depuis la dernière validation.");
        result = await restorePreparedAdminAction(userSupabase, metadata.originalPrepared);
      } else {
        const prepared = preparedFromItem(item);
        const current = await currentSnapshotForPreparedAction(userSupabase, prepared);
        if (hashSnapshot(current) !== item.expected_hash) throw new Error("Les données ont changé depuis la dernière validation.");
        result = await executePreparedAdminAction(userSupabase, prepared);
      }
      const logIds = await linkAdminChanges({ supabase: userSupabase, userId, jobId: job.id, since });
      await service.from("ai_admin_job_items").update({
        status: job.restore_of_job_id ? "restored" : "completed", result, admin_change_log_ids: logIds, error_message: null,
      }).eq("id", item.id);
      results.push({ sequence: item.sequence, ok: true, result });
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec de l'action.";
      await service.from("ai_admin_job_items").update({ status: "failed", error_message: message }).eq("id", item.id);
      results.push({ sequence: item.sequence, ok: false, error: message });
    }
  }
  const status = succeeded === items.length ? "completed" : succeeded > 0 ? "partial" : "failed";
  await service.from("ai_admin_jobs").update({ status, result: { items: results }, error_message: status === "completed" ? null : "Certaines actions n'ont pas abouti." }).eq("id", job.id);
}

export async function cancelAdminJob(userId: string, jobId: string) {
  const service = createServiceRoleClient();
  const job = await adminJob(service, jobId, userId);
  await rejectExpired(service, job);
  if (["executing", ...TERMINAL].includes(job.status)) throw new Error("Cette tâche ne peut plus être annulée.");
  const { data: cancelled } = await service.from("ai_admin_jobs").update({ status: "cancelled" })
    .eq("id", job.id)
    .in("status", ["queued", "claimed", "analyzing", "awaiting_first_approval", "preparing_preview", "awaiting_second_approval"])
    .select("id").maybeSingle();
  if (!cancelled) throw new Error("Cette tâche ne peut plus être annulée.");
  if (job.worker_id) await service.from("ai_admin_workers").update({ current_job_id: null, status: "idle" }).eq("id", job.worker_id);
}

export async function createRestoreJob(userId: string, originalJobId: string): Promise<string> {
  const service = createServiceRoleClient();
  const original = await adminJob(service, originalJobId, userId);
  if (!['completed', 'partial'].includes(original.status)) throw new Error("Cette opération n'est pas restaurable.");
  const originals = (await jobItems(service, original.id)).filter((item) => item.status === "completed");
  if (originals.length === 0 || originals.some((item) => !item.reversible || item.risk !== "reversible")) {
    throw new Error("Le lot contient une action qui ne peut pas être restaurée.");
  }
  const { data: job, error } = await service.from("ai_admin_jobs").insert({
    author_user_id: userId,
    restore_of_job_id: original.id,
    execution_mode: "local",
    request_kind: "game_action",
    model: original.model,
    effort: original.effort,
    status: "awaiting_first_approval",
    stage: "plan",
    summary: `Restaurer : ${original.summary ?? "opération de l'assistant"}`,
    plan: { summary: `Restauration de ${original.id}`, requestKind: "game_action", complexity: "simple", answer: null, actions: [] },
  }).select("id").single();
  if (error || !job) throw new Error(error?.message ?? "Création de la restauration impossible.");
  const rows = [...originals].reverse().map((item, sequence) => ({
    job_id: job.id,
    sequence,
    action_id: item.action_id,
    parameters: item.parameters,
    risk: "reversible",
    reversible: true,
    result: {
      originalPrepared: preparedFromItem(item),
      expectedCurrent: item.result,
    },
  }));
  const { error: itemsError } = await service.from("ai_admin_job_items").insert(rows);
  if (itemsError) throw new Error(itemsError.message);
  return job.id;
}

export async function getAdminJobView(userId: string, jobId: string): Promise<AdminJobView> {
  const service = createServiceRoleClient();
  let job = await adminJob(service, jobId, userId);
  if (!TERMINAL.includes(job.status) && new Date(job.expires_at).getTime() <= Date.now() && job.status !== "executing") {
    await service.from("ai_admin_jobs").update({ status: "expired" }).eq("id", job.id);
    job = await adminJob(service, jobId, userId);
  }
  const items = await jobItems(service, job.id);
  let queuePosition: number | null = null;
  if (job.status === "queued") {
    const { count } = await service.from("ai_admin_jobs").select("id", { count: "exact", head: true })
      .eq("execution_mode", "local").eq("status", "queued").lt("created_at", job.created_at);
    queuePosition = (count ?? 0) + 1;
  }
  return {
    id: job.id,
    status: job.status as AdminJobView["status"],
    stage: job.stage,
    executionMode: job.execution_mode,
    requestKind: job.request_kind,
    summary: job.summary,
    plan: job.plan,
    preview: job.preview,
    result: job.result,
    error: job.error_message,
    queuePosition,
    expiresAt: job.expires_at,
    createdAt: job.created_at,
    items: items.map((item) => ({
      id: item.action_id,
      parameters: item.parameters,
      reason: String((job.plan?.actions[item.sequence] as { reason?: string } | undefined)?.reason ?? ""),
      risk: item.risk,
      sequence: item.sequence,
      reversible: item.reversible,
      status: item.status,
      before: item.before_data,
      after: item.after_data,
      result: item.result,
      error: item.error_message ?? undefined,
    })),
  };
}

export async function getAdminAssistantAvailability() {
  const service = createServiceRoleClient();
  return { localOnline: await workerOnline(service) };
}
