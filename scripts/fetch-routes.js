/**
 * Liste les routes existantes dans la base Supabase (pour debug).
 * Usage: node --env-file=.env.local scripts/fetch-routes.js
 *    ou: node scripts/fetch-routes.js (charge .env.local manuellement)
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Manque NEXT_PUBLIC_SUPABASE_URL ou clé Supabase (SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: routes, error } = await supabase
    .from("routes")
    .select("id, name, city_a_id, city_b_id, pathway_point_a_id, pathway_point_b_id, poi_a_id, poi_b_id, tier, distance_km, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur Supabase:", error.message);
    process.exit(1);
  }

  console.log("Nombre de routes:", routes?.length ?? 0);
  console.log("");
  (routes || []).forEach((r, i) => {
    console.log(`--- Route ${i + 1}: ${r.name ?? "(sans nom)"} (id: ${r.id}) ---`);
    console.log("  tier:", r.tier, "| distance_km:", r.distance_km);
    console.log("  city_a_id:", r.city_a_id, "| city_b_id:", r.city_b_id);
    console.log("  pathway_point_a_id:", r.pathway_point_a_id, "| pathway_point_b_id:", r.pathway_point_b_id);
    console.log("  poi_a_id:", r.poi_a_id, "| poi_b_id:", r.poi_b_id);
    console.log("  created_at:", r.created_at);
    console.log("");
  });
}

main();
