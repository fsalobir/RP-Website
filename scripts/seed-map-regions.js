/**
 * Seed map_regions et map_region_countries à partir du TopoJSON world-atlas.
 * À lancer une fois après la migration 064 : node scripts/seed-map-regions.js
 * Charge .env.local si présent. Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * world-atlas utilise l'id numérique ISO 3166-1 ; on mappe nos pays (slug -> iso2 -> numeric).
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

const { createClient } = require("@supabase/supabase-js");
const { feature } = require("topojson-client");

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

// ISO 3166-1 alpha-2 -> numeric (world-atlas countries-110m id)
const ISO2_TO_NUMERIC = {
  fr: 250, de: 276, gb: 826, it: 380, es: 724, ru: 643, cn: 156, jp: 392, in: 356,
  us: 840, br: 76, ca: 124, au: 36, mx: 484, id: 360, tr: 792, sa: 682, za: 710,
  ng: 566, eg: 818, ir: 364, pk: 586, kr: 410, pl: 616, ua: 804, ar: 32, co: 170,
  th: 764, vn: 704, nl: 528, be: 56, se: 752, ch: 756, no: 578, pt: 620, gr: 300,
  cz: 203, ro: 642, il: 376, ae: 784,
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  let topology;
  try {
    topology = require("world-atlas/countries-110m.json");
  } catch (e) {
    console.error("world-atlas non trouvé. Lancez: npm install world-atlas --save-dev");
    process.exit(1);
  }

  const fc = feature(topology, topology.objects.countries);
  if (!fc || !fc.features) {
    console.error("TopoJSON invalide (FeatureCollection attendu).");
    process.exit(1);
  }

  const byNumeric = new Map();
  for (const f of fc.features) {
    if (f.id != null) byNumeric.set(Number(f.id), f);
  }

  const { data: countries, error: countriesError } = await supabase
    .from("countries")
    .select("id, name, slug")
    .order("name");
  if (countriesError) {
    console.error("Erreur pays:", countriesError.message);
    process.exit(1);
  }
  if (!countries.length) {
    console.error("Aucun pays en base.");
    process.exit(1);
  }

  const existing = await supabase.from("map_regions").select("id");
  if (existing.data && existing.data.length > 0) {
    console.log("Des régions existent déjà. Supprimez-les ou lancez le script sur une base vide.");
    process.exit(1);
  }

  let order = 0;
  for (const c of countries) {
    const iso2 = SLUG_TO_ISO2[c.slug];
    if (!iso2) continue;
    const numeric = ISO2_TO_NUMERIC[iso2.toLowerCase()];
    if (numeric == null) continue;
    const geoFeature = byNumeric.get(numeric);
    if (!geoFeature || !geoFeature.geometry) continue;

    const { data: region, error: insertRegion } = await supabase
      .from("map_regions")
      .insert({
        name: c.name,
        slug: c.slug,
        geometry: geoFeature.geometry,
        sort_order: order++,
      })
      .select("id")
      .single();
    if (insertRegion) {
      console.error("Insert map_regions:", c.slug, insertRegion.message);
      continue;
    }
    await supabase.from("map_region_countries").insert({
      region_id: region.id,
      country_id: c.id,
    });
  }
  console.log("Seed map_regions terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
