import { appendFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LOG_FILENAME = "debug-5b6b8a.log";

/**
 * Append une ligne NDJSON pour la session debug carte (local uniquement).
 * - `next dev` : activé automatiquement (NODE_ENV=development).
 * - `next start` / `prod:local` : définir DEBUG_MAP_SESSION=1 dans .env.local
 */
export async function POST(req: Request) {
  const enabled =
    process.env.NODE_ENV === "development" || process.env.DEBUG_MAP_SESSION === "1";
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Définir DEBUG_MAP_SESSION=1 pour next start (prod:local), ou utiliser next dev." },
      { status: 403 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const line =
    JSON.stringify({
      ...payload,
      _serverReceivedAt: Date.now(),
      _nodeEnv: process.env.NODE_ENV,
    }) + "\n";

  const filePath = path.join(process.cwd(), LOG_FILENAME);
  try {
    await appendFile(filePath, line, "utf8");
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
