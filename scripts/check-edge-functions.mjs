import { readFile } from "node:fs/promises";
import path from "node:path";

const entry = path.resolve("supabase", "functions", "rp-pipeline", "index.ts");
const source = await readFile(entry, "utf8");
const forbidden = ['from "@/', 'from "next/', 'from "node:', "require("];
const hits = forbidden.filter((snippet) => source.includes(snippet));

if (hits.length) {
  console.error(`Imports incompatibles avec Edge dans ${entry}: ${hits.join(", ")}`);
  process.exit(1);
}
if (!source.includes("anthracite-org-magnum-v4-72b-FP8-Dynamic")) {
  console.error("Le worker n'utilise pas le modèle Magnum verrouillé.");
  process.exit(1);
}
console.log("OK: worker rp-pipeline compatible et modèle Magnum verrouillé.");
