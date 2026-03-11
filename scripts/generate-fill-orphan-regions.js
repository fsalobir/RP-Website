/**
 * Génère le mapping région orphelines -> pays réel (nom, slug, iso2) et met à jour la migration 103.
 * À lancer en local avant d'appliquer la migration : node scripts/generate-fill-orphan-regions.js
 * Charge .env.local. Variables optionnelles : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * pour récupérer la liste des régions orphelines depuis la DB.
 */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0 || line.startsWith("#")) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key) process.env[key] = val;
  }
}

// Slug (code) -> nom français (référence seed 007 / carte)
const SLUG_TO_NAME = {
  france: "France", allemagne: "Allemagne", "royaume-uni": "Royaume-Uni", italie: "Italie",
  espagne: "Espagne", russie: "Russie", chine: "Chine", japon: "Japon", inde: "Inde",
  "etats-unis": "États-Unis", bresil: "Brésil", canada: "Canada", australie: "Australie",
  mexique: "Mexique", indonesie: "Indonésie", turquie: "Turquie", "arabie-saoudite": "Arabie saoudite",
  "afrique-du-sud": "Afrique du Sud", nigeria: "Nigeria", egypte: "Égypte", iran: "Iran",
  pakistan: "Pakistan", "coree-du-sud": "Corée du Sud", pologne: "Pologne", ukraine: "Ukraine",
  argentine: "Argentine", colombie: "Colombie", thailande: "Thaïlande", vietnam: "Vietnam",
  "pays-bas": "Pays-Bas", belgique: "Belgique", suede: "Suède", suisse: "Suisse",
  norvege: "Norvège", portugal: "Portugal", grece: "Grèce", "republique-tcheque": "République tchèque",
  roumanie: "Roumanie", israel: "Israël", "emirats-arabes-unis": "Émirats arabes unis",
};

const SLUG_TO_ISO2 = {
  france: "fr", allemagne: "de", "royaume-uni": "gb", italie: "it", espagne: "es",
  russie: "ru", chine: "cn", japon: "jp", inde: "in", "etats-unis": "us", bresil: "br",
  canada: "ca", australie: "au", mexique: "mx", indonesie: "id", turquie: "tr",
  "arabie-saoudite": "sa", "afrique-du-sud": "za", nigeria: "ng", egypte: "eg",
  iran: "ir", pakistan: "pk", "coree-du-sud": "kr", pologne: "pl", ukraine: "ua",
  argentine: "ar", colombie: "co", thailande: "th", vietnam: "vn", "pays-bas": "nl",
  belgique: "be", suede: "se", suisse: "ch", norvege: "no", portugal: "pt",
  grece: "gr", "republique-tcheque": "cz", roumanie: "ro", israel: "il",
  "emirats-arabes-unis": "ae",
};

function resolveOrphan(regionSlug, regionName) {
  const slug = (regionSlug || "").toLowerCase().trim();
  const iso2 = SLUG_TO_ISO2[slug] || null;
  const name = SLUG_TO_NAME[slug] || regionName || regionSlug || slug;
  return { name, slug: slug || regionSlug, iso2 };
}

async function fetchOrphanRegions(supabase) {
  const { data: regions } = await supabase.from("map_regions").select("id, name, slug");
  if (!regions?.length) return [];
  const { data: linked } = await supabase.from("map_region_countries").select("region_id");
  const linkedIds = new Set((linked || []).map((r) => r.region_id));
  return regions.filter((r) => !linkedIds.has(r.id));
}

async function main() {
  const mappingPath = path.join(__dirname, "orphan_regions_mapping.json");
  const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "103_fill_orphan_map_regions.sql");

  let mapping = {};
  try {
    mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  } catch {
    // keep {}
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(url, key);
    const orphans = await fetchOrphanRegions(supabase);
    for (const r of orphans) {
      if (mapping[r.slug]) continue;
          const { name, slug, iso2 } = resolveOrphan(r.slug, r.name);
          mapping[r.slug] = { name, slug, iso2: iso2 || undefined };
        }
    if (orphans.length) {
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), "utf8");
      console.log("Mapping mis à jour pour", orphans.length, "région(s) orphelines.");
    }
  } else {
    console.log("Pas de connexion Supabase : utilisation du mapping existant.");
  }

  const mappingJson = JSON.stringify(mapping);
  const migrationContent = fs.readFileSync(migrationPath, "utf8");
  const newContent = migrationContent.replace(
    /mapping jsonb := '\{\}'::jsonb;/,
    `mapping jsonb := '${mappingJson.replace(/'/g, "''")}'::jsonb;`
  );
  if (newContent !== migrationContent) {
    fs.writeFileSync(migrationPath, newContent, "utf8");
    console.log("Migration 103 mise à jour avec le mapping.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
