/**
 * Route API pour déclencher le passage de jour (run_daily_country_update).
 * À appeler par un cron externe (ex. cron-job.org, une fois par jour).
 * Protégée par CRON_SECRET (en-tête x-cron-secret ou query secret).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { persistWorldIdeologies } from "@/lib/ideologyServer";

function getCronSecret(request: NextRequest): string | null {
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header) return header;
  return request.nextUrl.searchParams.get("secret");
}

export async function GET(request: NextRequest) {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: cronPausedRow } = await supabase
    .from("rule_parameters")
    .select("value")
    .eq("key", "cron_paused")
    .maybeSingle();

  const cronPaused =
    cronPausedRow?.value != null &&
    (typeof cronPausedRow.value === "boolean"
      ? cronPausedRow.value
      : String(cronPausedRow.value) === "true");

  if (cronPaused) {
    return NextResponse.json({ ok: true, paused: true });
  }

  const { error } = await supabase.rpc("run_daily_country_update");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await persistWorldIdeologies(supabase);

  return NextResponse.json({ ok: true });
}
