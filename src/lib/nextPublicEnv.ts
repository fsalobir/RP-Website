/**
 * Next.js exposes `process.env.KEY` as `""` when a variable is set but empty in the shell / Vercel UI.
 * `?? default` does not treat `""` as missing — use this helper for public env reads.
 */
export function readNextPublicEnvKey(key: string, defaultValue: string): string {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return defaultValue;
  const trimmed = String(raw).trim();
  return trimmed === "" ? defaultValue : trimmed;
}

export function isNextPublicEnvEmptyOrWhitespace(key: string): boolean {
  const v = process.env[key];
  return v !== undefined && v !== null && String(v).trim() === "";
}
