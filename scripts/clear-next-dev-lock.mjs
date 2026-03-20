/**
 * Supprime `.next/dev/lock` si présent.
 * Next.js 15+ crée ce fichier pour éviter deux `next dev` sur le même projet ;
 * après crash, kill du terminal ou fermeture de Cursor, le verrou peut rester
 * et bloquer tout nouveau `next dev` ("Unable to acquire lock").
 *
 * Usage: appelé automatiquement avant `next dev` via npm scripts.
 * Manuel: `node scripts/clear-next-dev-lock.mjs`
 */
import fs from "node:fs";
import path from "node:path";

const lockPath = path.join(process.cwd(), ".next", "dev", "lock");

try {
  fs.rmSync(lockPath, { force: true });
} catch {
  // ignore
}
