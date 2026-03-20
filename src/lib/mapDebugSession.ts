/** Tampon navigateur pour comparer local vs prod (Vercel n’écrit pas debug-5b6b8a.log sur ton disque). */

const MAX_ENTRIES = 100;

/**
 * POST /api/debug-map-session n’est activé côté serveur qu’en dev ou si DEBUG_MAP_SESSION=1 (local).
 * En prod déployée (Vercel), l’API répond 403 : ne pas appeler pour éviter le bruit console.
 */
export function shouldPostDebugMapSessionToServer(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_DEBUG_MAP_SESSION === "1";
}

export function postDebugMapSessionToServer(payload: Record<string, unknown>): void {
  if (!shouldPostDebugMapSessionToServer()) return;
  fetch("/api/debug-map-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

declare global {
  interface Window {
    __MAP_DEBUG_LOGS__?: Array<Record<string, unknown>>;
  }
}

export function pushMapDebugSessionLog(entry: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.__MAP_DEBUG_LOGS__ ??= [];
  window.__MAP_DEBUG_LOGS__.push({ t: Date.now(), ...entry });
  if (window.__MAP_DEBUG_LOGS__.length > MAX_ENTRIES) {
    window.__MAP_DEBUG_LOGS__.splice(0, window.__MAP_DEBUG_LOGS__.length - MAX_ENTRIES);
  }
}
