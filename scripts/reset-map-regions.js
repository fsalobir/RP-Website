/**
 * Vide map_region_countries et map_regions (avec SUPABASE_SERVICE_ROLE_KEY).
 * À lancer avant le seed si des régions existent déjà.
 * Charge .env.local. Puis lancer : node scripts/seed-map-regions.js
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local).");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { error: delLinks } = await supabase.from("map_region_countries").delete().neq("region_id", "00000000-0000-0000-0000-000000000000");
  if (delLinks) {
    console.error("Erreur suppression map_region_countries:", delLinks.message);
    process.exit(1);
  }
  const { error: delRegions } = await supabase.from("map_regions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delRegions) {
    console.error("Erreur suppression map_regions:", delRegions.message);
    process.exit(1);
  }
  console.log("Carte réinitialisée (régions et liens supprimés).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
