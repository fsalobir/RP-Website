import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["src", "docs", "scripts", "supabase"];
const TARGET_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".sql", ".yml", ".yaml", ".json"]);

const REPLACEMENTS = new Map([
  ["é", "é"],
  ["è", "è"],
  ["ê", "ê"],
  ["ë", "ë"],
  ["à", "à"],
  ["â", "â"],
  ["î", "î"],
  ["ï", "ï"],
  ["ô", "ô"],
  ["ö", "ö"],
  ["ù", "ù"],
  ["û", "û"],
  ["ü", "ü"],
  ["ç", "ç"],
  ["É", "É"],
  ["À", "À"],
  ["Â", "Â"],
  ["Î", "Î"],
  ["Ù", "Ù"],
  ["Ç", "Ç"],
  ["’", "’"],
  ["‘", "‘"],
  ["“", "“"],
  ["”", "”"],
  ["–", "–"],
  ["—", "—"],
  ["...", "..."],
  ["·", "·"],
  ["«", "«"],
  ["»", "»"],
  [" ", " "],
  ["→", "→"],
  ["↔", "↔"],
  ["≈", "≈"],
  ["▼", "▼"],
  ["▶", "▶"],
]);

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!TARGET_EXT.has(path.extname(entry.name))) continue;
    out.push(full);
  }
  return out;
}

async function main() {
  let changed = 0;
  for (const rel of TARGET_DIRS) {
    const abs = path.join(ROOT, rel);
    let files = [];
    try {
      files = await walk(abs);
    } catch {
      continue;
    }
    for (const file of files) {
      let txt;
      try {
        txt = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      let next = txt;
      for (const [from, to] of REPLACEMENTS) next = next.replaceAll(from, to);
      if (next !== txt) {
        await fs.writeFile(file, next, "utf8");
        changed += 1;
      }
    }
  }
  console.log(`[fix-mojibake] fichiers modifiés: ${changed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

