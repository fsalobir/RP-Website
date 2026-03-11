#!/usr/bin/env node
/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_BASE_URL = "http://localhost:3000",
  CRON_SECRET,
  PROCESS_DUE_EDGE_SECRET,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables manquantes: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!CRON_SECRET) {
  console.error("Variable manquante: CRON_SECRET (pour appeler la route app)");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function countPendingTagged() {
  const { count, error } = await supabase
    .from("ai_event_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "accepted")
    .is("consequences_applied_at", null)
    .eq("payload->>test_tag", "process_due_parity");
  if (error) throw error;
  return count ?? 0;
}

async function callAppRoute() {
  const url = `${APP_BASE_URL}/api/cron/process-ai-events?secret=${encodeURIComponent(CRON_SECRET)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function callEdgeDryRun() {
  const fnUrl = `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-ai-events-due?dry_run=true`;
  const headers = { "Content-Type": "application/json" };
  if (PROCESS_DUE_EDGE_SECRET) headers["x-process-secret"] = PROCESS_DUE_EDGE_SECRET;
  const res = await fetch(fnUrl, { method: "POST", headers, body: "{}" });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("=== Process due parity quick check ===");
  const before = await countPendingTagged();
  console.log("pending(test_tag=process_due_parity) avant:", before);

  const edge = await callEdgeDryRun();
  console.log("Edge dry_run:", edge.status, edge.body);
  const afterDryRun = await countPendingTagged();
  console.log("pending après dry_run:", afterDryRun);

  if (afterDryRun !== before) {
    console.error("ERREUR: le dry_run a modifié des données.");
    process.exit(2);
  }

  const app = await callAppRoute();
  console.log("Route app:", app.status, app.body);
  const afterApp = await countPendingTagged();
  console.log("pending après route app:", afterApp);

  console.log("OK: dry_run n'a pas modifié les données. Vérifier la parité métier avec la matrice docs/process-due-parity-matrix.md.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
