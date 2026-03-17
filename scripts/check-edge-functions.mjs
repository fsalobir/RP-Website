import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const edgeRoot = path.join(repoRoot, "supabase", "functions", "process-ai-events-due");
const sharedDir = path.join(edgeRoot, "_shared");
const syncedDir = path.join(sharedDir, "_synced");

const FORBIDDEN_IMPORT_SNIPPETS = [
  'from "@/',
  'from "next/',
  'from "node:',
  "from '@/",
  "from 'next/",
  "from 'node:",
  "require(",
];

async function readUtf8(p) {
  return fs.readFile(p, "utf8");
}

async function listTsFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listTsFiles(full)));
    else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(repoRoot, p).replaceAll("\\", "/");
}

function scanForbiddenImports(filePath, content) {
  const hits = [];
  for (const s of FORBIDDEN_IMPORT_SNIPPETS) {
    if (content.includes(s)) hits.push(s);
  }
  return hits.length ? { file: rel(filePath), hits } : null;
}

async function main() {
  const problems = [];

  // 1) Ensure synced directory exists and has at least one file.
  let syncedFiles = [];
  try {
    syncedFiles = await listTsFiles(syncedDir);
  } catch {
    problems.push({ file: rel(syncedDir), error: "Dossier _synced introuvable. Lancez: npm run sync:edge-shared" });
  }
  if (syncedFiles.length === 0) {
    problems.push({ file: rel(syncedDir), error: "Aucun fichier _synced trouvé. Lancez: npm run sync:edge-shared" });
  }

  // 2) Scan edge function & shared code for forbidden imports.
  const edgeFiles = await listTsFiles(edgeRoot);
  for (const f of edgeFiles) {
    const c = await readUtf8(f);
    const bad = scanForbiddenImports(f, c);
    if (bad) problems.push(bad);
  }

  // 3) Ensure shared entry points are re-exports into _synced.
  const expectedReexportFiles = ["relations.ts", "worldDate.ts", "actionKeys.ts", "discord-format.ts"];
  for (const name of expectedReexportFiles) {
    const p = path.join(sharedDir, name);
    const c = await readUtf8(p);
    if (!c.trim().startsWith("export * from \"./_synced/")) {
      problems.push({
        file: rel(p),
        error: "Ce fichier devrait ré-exporter depuis ./_synced/* pour éviter la duplication.",
      });
    }
  }

  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error("Problèmes détectés dans la fonction Edge (imports/structure):");
    for (const p of problems) {
      // eslint-disable-next-line no-console
      console.error("-", JSON.stringify(p));
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("OK: structure Edge + imports compatibles (check statique).");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Échec du check Edge:", e);
  process.exit(1);
});

