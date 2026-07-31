import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminInstructions, buildAdminGameContext, ADMIN_PLAN_SCHEMA } from "@/lib/ai/adminAssistant";
import { finalizeWorkerPlan } from "@/lib/ai/adminJobs";
import type { AdminRequestKind } from "@/lib/ai/contracts";
import { getSanitizedVercelStatus } from "@/lib/ai/vercelReadOnly";

export const runtime = "nodejs";
export const maxDuration = 60;

type WorkerRow = {
  id: string;
  enabled: boolean;
  status: string;
  current_job_id: string | null;
  token_hash: string;
};

async function workerFromRequest(request: Request): Promise<WorkerRow | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^fonw_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("ai_admin_workers").select("id,enabled,status,current_job_id,token_hash").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  const expected = Buffer.from(data.token_hash, "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? data as WorkerRow : null;
}

export async function GET(request: Request) {
  const worker = await workerFromRequest(request);
  if (!worker) return Response.json({ error: "Jeton invalide." }, { status: 401 });
  return Response.json({ enabled: worker.enabled, status: worker.status, currentJobId: worker.current_job_id });
}

export async function POST(request: Request) {
  const worker = await workerFromRequest(request);
  if (!worker) return Response.json({ error: "Jeton invalide." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.operation !== "string") return Response.json({ error: "Requête invalide." }, { status: 400 });
  const supabase = createServiceRoleClient();

  try {
    if (body.operation === "heartbeat") {
      const elevated = body.sandboxMode === "elevated" && body.sandboxCheck === "FON_CODEX_SANDBOX_OK";
      await supabase.from("ai_admin_workers").update({
        enabled: elevated,
        sandbox_verified_at: elevated ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
        codex_version: String(body.codexVersion ?? "").slice(0, 120) || null,
        worker_version: String(body.workerVersion ?? "").slice(0, 40) || null,
        status: elevated ? (worker.current_job_id ? "busy" : "idle") : "disabled",
      }).eq("id", worker.id);
      if (!elevated) return Response.json({ error: "Le bac à sable Windows élevé est obligatoire." }, { status: 412 });
      return Response.json({ ok: true });
    }

    if (!worker.enabled) return Response.json({ error: "Relais désactivé." }, { status: 403 });
    await supabase.from("ai_admin_workers").update({ last_seen_at: new Date().toISOString() }).eq("id", worker.id);

    if (body.operation === "claim") {
      const { data, error } = await supabase.rpc("ai_claim_admin_job", { p_worker_id: worker.id });
      if (error) throw new Error(error.message);
      const job = Array.isArray(data) ? data[0] : data;
      if (!job) return Response.json({ job: null });
      const { data: analyzing } = await supabase.from("ai_admin_jobs").update({ status: "analyzing", stage: "lecture" })
        .eq("id", job.id).eq("status", "claimed").eq("worker_id", worker.id).select("id").maybeSingle();
      if (!analyzing) {
        await supabase.from("ai_admin_workers").update({ current_job_id: null, status: "idle" }).eq("id", worker.id).eq("current_job_id", job.id);
        return Response.json({ job: null });
      }
      const requestKind = job.request_kind as AdminRequestKind;
      const gameContext = requestKind === "code_read" ? null : await buildAdminGameContext(supabase, job.prompt_text ?? "");
      const deploymentContext = requestKind === "code_read" ? await getSanitizedVercelStatus() : null;
      return Response.json({
        job: {
          id: job.id,
          model: job.model,
          effort: job.effort,
          requestKind,
          prompt: job.prompt_text,
          instructions: adminInstructions(requestKind),
          gameContext,
          deploymentContext,
          outputSchema: ADMIN_PLAN_SCHEMA,
          expiresAt: job.expires_at,
        },
      });
    }

    const jobId = String(body.jobId ?? "");
    const { data: job } = await supabase.from("ai_admin_jobs").select("id,worker_id,status,prompt_text,request_kind").eq("id", jobId).maybeSingle();
    if (!job || job.worker_id !== worker.id) return Response.json({ error: "Tâche non attribuée." }, { status: 403 });

    if (body.operation === "progress") {
      const stage = String(body.stage ?? "");
      if (!["analysis", "lecture", "plan"].includes(stage)) return Response.json({ error: "Étape invalide." }, { status: 400 });
      await supabase.from("ai_admin_jobs").update({ status: "analyzing", stage }).eq("id", jobId).in("status", ["claimed", "analyzing"]);
      return Response.json({ ok: true });
    }

    if (body.operation === "data") {
      if (body.kind === "deployment_status" && job.request_kind === "code_read") {
        return Response.json({ data: await getSanitizedVercelStatus() });
      }
      if (body.kind !== "game_context" || job.request_kind === "code_read") return Response.json({ error: "Donnée non autorisée." }, { status: 400 });
      return Response.json({ data: await buildAdminGameContext(supabase, job.prompt_text ?? "") });
    }

    if (body.operation === "result") {
      const output = String(body.output ?? "");
      if (output.length < 2 || output.length > 100_000) throw new Error("Résultat local invalide.");
      await finalizeWorkerPlan({ workerId: worker.id, jobId, output });
      return Response.json({ ok: true });
    }

    if (body.operation === "failure") {
      await supabase.from("ai_admin_jobs").update({ status: "failed", error_message: "Le relais local n'a pas terminé la tâche." })
        .eq("id", jobId).in("status", ["claimed", "analyzing"]);
      await supabase.from("ai_admin_workers").update({ current_job_id: null, status: "idle" })
        .eq("id", worker.id).eq("current_job_id", jobId);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Opération inconnue." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur du relais." }, { status: 400 });
  }
}
