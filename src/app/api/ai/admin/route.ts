import { getCachedAuth } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import {
  approveAdminJobFirst,
  approveAdminJobSecond,
  cancelAdminJob,
  createAdminJob,
  createRestoreJob,
  getAdminAssistantAvailability,
  getAdminJobView,
} from "@/lib/ai/adminJobs";
import { createWorkerToken, getAiAdminDashboard, revokeWorker, updateAiSettings } from "@/lib/ai/adminDashboard";

export const runtime = "nodejs";
export const maxDuration = 300;

async function authorizedAdmin() {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.isAdmin) return null;
  return auth;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inattendue.";
  if (message === "LOCAL_CODE_UNAVAILABLE") {
    return Response.json({ error: "Le relais local est hors ligne. Le diagnostic du code reste indisponible." }, { status: 503 });
  }
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const auth = await authorizedAdmin();
  if (!auth) return Response.json({ error: "Accès refusé." }, { status: 403 });
  const userId = auth.user!.id;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("view") === "settings") {
      return Response.json(await getAiAdminDashboard(userId));
    }
    const jobId = url.searchParams.get("jobId");
    if (jobId) return Response.json(await getAdminJobView(userId, jobId));
    return Response.json(await getAdminAssistantAvailability());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authorizedAdmin();
  if (!auth) return Response.json({ error: "Accès refusé." }, { status: 403 });
  const userId = auth.user!.id;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.operation !== "string") return Response.json({ error: "Requête invalide." }, { status: 400 });
  const supabase = await createClient();

  try {
    if (body.operation === "create") {
      const result = await createAdminJob({
        userId,
        message: String(body.message ?? ""),
        fallbackConfirmed: body.fallbackConfirmed === true,
        userSupabase: supabase,
      });
      if (result.fallbackRequired) {
        return Response.json({ fallbackRequired: true }, { status: 409 });
      }
      return Response.json({ job: await getAdminJobView(userId, result.jobId) });
    }
    const jobId = String(body.jobId ?? "");
    if (body.operation === "approve_first") {
      await approveAdminJobFirst({ userId, jobId, userSupabase: supabase });
      return Response.json({ job: await getAdminJobView(userId, jobId) });
    }
    if (body.operation === "approve_second") {
      const result = await approveAdminJobSecond({ userId, jobId, userSupabase: supabase });
      return Response.json({ ...result, job: await getAdminJobView(userId, jobId) });
    }
    if (body.operation === "cancel") {
      await cancelAdminJob(userId, jobId);
      return Response.json({ job: await getAdminJobView(userId, jobId) });
    }
    if (body.operation === "restore") {
      const restoreJobId = await createRestoreJob(userId, jobId);
      return Response.json({ job: await getAdminJobView(userId, restoreJobId) });
    }
    if (body.operation === "update_settings") {
      await updateAiSettings(userId, body);
      return Response.json({ ok: true });
    }
    if (body.operation === "create_worker_token") {
      const created = await createWorkerToken(userId);
      const siteUrl = new URL(request.url).origin;
      return Response.json({
        ...created,
        installCommand: `powershell -ExecutionPolicy Bypass -File .\\scripts\\ai-worker\\install.ps1 -SiteUrl "${siteUrl}" -Token "${created.token}"`,
      });
    }
    if (body.operation === "revoke_worker") {
      await revokeWorker(String(body.workerId ?? ""));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Opération inconnue." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
