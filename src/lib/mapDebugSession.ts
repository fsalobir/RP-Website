/** Tampon navigateur pour comparer local vs prod (Vercel n’écrit pas debug-5b6b8a.log sur ton disque). */

const MAX_ENTRIES = 100;

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
