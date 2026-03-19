import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const INPUT_PATH = process.env.MAP_PRECOMPUTE_INPUT || "tmp/routes-lod.json";
const OUT_DIR = process.env.MAP_PRECOMPUTE_OUT_DIR || "tmp/map-artifacts";
const MANIFEST_PATH = process.env.MAP_PRECOMPUTE_MANIFEST || path.join(OUT_DIR, "manifest.json");
const SCHEMA_VERSION = 1;

function hashJson(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const data = JSON.parse(raw);
  const versionHash = hashJson(data);
  const createdAt = new Date().toISOString();
  const artifactFile = `routes-lod-${versionHash}.json`;
  const artifactPath = path.join(OUT_DIR, artifactFile);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    artifactPath,
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        versionHash,
        createdAt,
        source: INPUT_PATH,
        data,
      },
      null,
      2
    ),
    "utf8"
  );

  let previous = null;
  try {
    const existing = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
    previous = existing?.active ?? null;
  } catch {
    // first run
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: createdAt,
    active: {
      versionHash,
      artifactFile,
    },
    previous,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[precompute-map-artifacts] active=${artifactFile} previous=${previous?.artifactFile ?? "none"}`);
}

main().catch((e) => {
  console.error("[precompute-map-artifacts] failed:", e);
  process.exit(1);
});

