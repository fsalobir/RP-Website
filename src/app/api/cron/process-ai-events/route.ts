import { NextRequest, NextResponse } from "next/server";

function bearer(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || bearer(request) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const edgeSecret = process.env.RP_PIPELINE_EDGE_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!edgeSecret || !baseUrl) {
    return NextResponse.json(
      { error: "Configuration du worker RP incomplète." },
      { status: 503 },
    );
  }

  const response = await fetch(`${baseUrl}/functions/v1/rp-pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rp-pipeline-secret": edgeSecret,
    },
    body: "{}",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({ error: `Worker HTTP ${response.status}` }));
  return NextResponse.json(result, { status: response.status });
}

export const POST = GET;
