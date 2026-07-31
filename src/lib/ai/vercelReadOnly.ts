import "server-only";

function redact(value: string): string {
  return value
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{32,}\b/g, "[secret masqué]")
    .replace(/\b(?:API|AUTH|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*\s*[=:]\s*\S+/gi, "[secret masqué]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[identifiants masqués]@");
}
async function vercelFetch(path: string) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN absent.");
  const response = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Vercel ${response.status}`);
  return response.json() as Promise<Record<string, unknown> | unknown[]>;
}

export async function getSanitizedVercelStatus(): Promise<Record<string, unknown>> {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!process.env.VERCEL_TOKEN || !projectId) return { configured: false };
  const params = new URLSearchParams({ projectId, limit: "5" });
  if (process.env.VERCEL_TEAM_ID) params.set("teamId", process.env.VERCEL_TEAM_ID);
  try {
    const list = await vercelFetch(`/v6/deployments?${params}`) as Record<string, unknown>;
    const rows = Array.isArray(list.deployments) ? list.deployments as Array<Record<string, unknown>> : [];
    const deployments = rows.map((row) => ({
      id: row.uid,
      url: row.url,
      state: row.state ?? row.readyState,
      target: row.target,
      createdAt: row.createdAt ?? row.created,
      readyAt: row.ready,
      commit: typeof row.meta === "object" && row.meta
        ? {
            sha: String((row.meta as Record<string, unknown>).githubCommitSha ?? "").slice(0, 12),
            message: redact(String((row.meta as Record<string, unknown>).githubCommitMessage ?? "")).slice(0, 300),
          }
        : null,
    }));
    const latestId = typeof rows[0]?.uid === "string" ? rows[0].uid : null;
    let errors: Array<Record<string, unknown>> = [];
    if (latestId) {
      const eventParams = new URLSearchParams({ direction: "backward", limit: "100", builds: "1" });
      if (process.env.VERCEL_TEAM_ID) eventParams.set("teamId", process.env.VERCEL_TEAM_ID);
      const eventRows = await vercelFetch(`/v3/deployments/${encodeURIComponent(latestId)}/events?${eventParams}`);
      if (Array.isArray(eventRows)) {
        errors = eventRows
          .filter((event): event is Record<string, unknown> => !!event && typeof event === "object")
          .map((event) => {
            const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
            return {
              type: event.type,
              createdAt: event.created,
              statusCode: payload.statusCode,
              text: redact(String(payload.text ?? "")).slice(0, 500),
            };
          })
          .filter((event) => ["stderr", "fatal", "exit"].includes(String(event.type)) || Number(event.statusCode) >= 400)
          .slice(0, 20);
      }
    }
    return { configured: true, deployments, recentErrors: errors };
  } catch {
    return { configured: true, unavailable: true };
  }
}
