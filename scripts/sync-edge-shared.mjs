import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const PAIRS = [
  {
    src: "src/lib/relations.ts",
    dest: "supabase/functions/process-ai-events-due/_shared/_synced/relations.ts",
  },
  {
    src: "src/lib/worldDate.ts",
    dest: "supabase/functions/process-ai-events-due/_shared/_synced/worldDate.ts",
  },
  {
    src: "src/lib/actionKeys.ts",
    dest: "supabase/functions/process-ai-events-due/_shared/_synced/actionKeys.ts",
  },
  {
    src: "src/lib/discord-format.ts",
    dest: "supabase/functions/process-ai-events-due/_shared/_synced/discord-format.ts",
  },
];

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function syncOne({ src, dest }) {
  const absSrc = path.join(repoRoot, src);
  const absDest = path.join(repoRoot, dest);
  await ensureDir(absDest);
  const content = await fs.readFile(absSrc, "utf8");
  await fs.writeFile(absDest, content, "utf8");
}

async function main() {
  await Promise.all(PAIRS.map(syncOne));
  console.log(`Synchro terminée (${PAIRS.length} fichiers).`);
}

main().catch((e) => {
  console.error("Échec de la synchro edge-shared:", e);
  process.exit(1);
});

