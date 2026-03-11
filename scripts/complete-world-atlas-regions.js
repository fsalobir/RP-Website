/**
 * Complète la carte en ajoutant toutes les régions world-atlas manquantes.
 * - Crée map_regions (géométrie), countries (nom/régime/drapeau), map_region_countries (lien)
 * - Idempotent : ignore les features déjà couvertes.
 *
 * Usage:
 *   node scripts/complete-world-atlas-regions.js
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { feature } = require("topojson-client");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0 || line.startsWith("#")) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  }
}

function normalizeNumeric(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/^0+/, "") || "0");
  return Number.isFinite(n) ? n : null;
}

function slugify(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchRestCountriesAll() {
  const url =
    "https://restcountries.com/v3.1/all?fields=name,translations,cca2,ccn3,flags";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RestCountries indisponible: HTTP ${res.status}`);
  }
  /** @type {Array<any>} */
  const rows = await res.json();
  return rows;
}

function pickFrenchName(row) {
  return (
    row?.translations?.fra?.common ||
    row?.translations?.fra?.official ||
    row?.name?.common ||
    row?.name?.official ||
    null
  );
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  }

  const mappingPath = path.join(__dirname, "region-country-mapping.json");
  const staticMapping = fs.existsSync(mappingPath)
    ? JSON.parse(fs.readFileSync(mappingPath, "utf8"))
    : {};

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // world-atlas features
  const topology = require("world-atlas/countries-110m.json");
  const fc = feature(topology, topology.objects.countries);
  if (!fc?.features?.length) throw new Error("world-atlas invalide");

  // RestCountries mapping numeric <-> iso2 + names
  const restRows = await fetchRestCountriesAll();
  /** @type {Map<number, string>} */
  const numericToIso2 = new Map();
  /** @type {Map<string, number>} */
  const iso2ToNumeric = new Map();
  /** @type {Map<string, {name: string|null, flag: string|null}>} */
  const iso2Meta = new Map();

  for (const row of restRows) {
    const iso2 = String(row?.cca2 || "").toLowerCase();
    const numeric = normalizeNumeric(row?.ccn3);
    if (!iso2 || numeric == null) continue;
    numericToIso2.set(numeric, iso2);
    iso2ToNumeric.set(iso2, numeric);
    iso2Meta.set(iso2, {
      name: pickFrenchName(row),
      flag: row?.flags?.png || null,
    });
  }

  const [{ data: countries }, { data: regions }, { data: links }] = await Promise.all([
    supabase.from("countries").select("id, slug, name"),
    supabase.from("map_regions").select("id, slug, name, sort_order"),
    supabase.from("map_region_countries").select("region_id, country_id"),
  ]);

  const countriesArr = countries || [];
  const regionsArr = regions || [];
  const linksArr = links || [];

  const countriesBySlug = new Map(countriesArr.map((c) => [c.slug, c]));
  const regionsBySlug = new Map(regionsArr.map((r) => [r.slug, r]));
  const regionsById = new Map(regionsArr.map((r) => [r.id, r]));
  const linksByRegion = new Map();
  for (const l of linksArr) {
    const arr = linksByRegion.get(l.region_id) || [];
    arr.push(l.country_id);
    linksByRegion.set(l.region_id, arr);
  }

  // Determine already covered numeric ids from linked regions/countries.
  const coveredNumerics = new Set();
  for (const l of linksArr) {
    const region = regionsById.get(l.region_id);
    const country = countriesArr.find((c) => c.id === l.country_id);
    const candidates = [
      region?.slug || "",
      country?.slug || "",
      staticMapping[region?.slug || ""]?.iso2 || "",
      staticMapping[country?.slug || ""]?.iso2 || "",
    ];
    let iso2 = null;
    for (const candidate of candidates) {
      const value = String(candidate || "").toLowerCase();
      if (!value) continue;
      if (value.length === 2 && iso2ToNumeric.has(value)) {
        iso2 = value;
        break;
      }
    }
    if (!iso2) continue;
    const numeric = iso2ToNumeric.get(iso2);
    if (numeric != null) coveredNumerics.add(numeric);
  }

  let maxSort = regionsArr.reduce((acc, r) => Math.max(acc, Number(r.sort_order || 0)), 0);
  let createdRegions = 0;
  let createdCountries = 0;
  let createdLinks = 0;
  let skippedNoIso = 0;

  for (const f of fc.features) {
    const numeric = normalizeNumeric(f.id);
    if (numeric == null) continue;
    if (coveredNumerics.has(numeric)) continue;

    const iso2 = numericToIso2.get(numeric);
    if (!iso2) {
      skippedNoIso++;
      continue;
    }

    const regionSlug = iso2;
    const countrySlug = iso2;
    const mappingEntry = staticMapping[regionSlug] || null;
    const meta = iso2Meta.get(iso2) || { name: null, flag: null };

    const countryName = mappingEntry?.name || meta.name || `Pays ${iso2.toUpperCase()}`;
    const regime = mappingEntry?.regime || "République";
    const flagUrl = `https://flagcdn.com/w80/${iso2}.png`;
    const regionName = countryName;

    let regionId = regionsBySlug.get(regionSlug)?.id || null;
    if (!regionId) {
      maxSort += 1;
      const { data: insRegion, error: regionErr } = await supabase
        .from("map_regions")
        .insert({
          name: regionName,
          slug: regionSlug,
          geometry: f.geometry,
          sort_order: maxSort,
        })
        .select("id, slug, name, sort_order")
        .single();
      if (regionErr) {
        console.error(`Echec insert region ${regionSlug}:`, regionErr.message);
        continue;
      }
      regionId = insRegion.id;
      regionsBySlug.set(regionSlug, insRegion);
      regionsById.set(insRegion.id, insRegion);
      createdRegions++;
    }

    let countryId = countriesBySlug.get(countrySlug)?.id || null;
    if (!countryId) {
      const { data: insCountry, error: countryErr } = await supabase
        .from("countries")
        .insert({
          name: countryName,
          slug: countrySlug,
          regime,
          flag_url: flagUrl || meta.flag || null,
          population: 50000000,
          gdp: 600000000000,
          militarism: 5,
          industry: 5,
          science: 5,
          stability: 0,
          ai_status: null,
        })
        .select("id, slug, name")
        .single();
      if (countryErr) {
        // If slug already exists from race/manual insert, reload and continue.
        const { data: existingCountry } = await supabase
          .from("countries")
          .select("id, slug, name")
          .eq("slug", countrySlug)
          .maybeSingle();
        if (!existingCountry) {
          console.error(`Echec insert country ${countrySlug}:`, countryErr.message);
          continue;
        }
        countryId = existingCountry.id;
      } else {
        countryId = insCountry.id;
        countriesBySlug.set(countrySlug, insCountry);
        createdCountries++;
      }
    }

    const existingLinks = linksByRegion.get(regionId) || [];
    if (!existingLinks.includes(countryId)) {
      const { error: linkErr } = await supabase
        .from("map_region_countries")
        .insert({ region_id: regionId, country_id: countryId });
      if (linkErr) {
        console.error(`Echec insert link ${regionSlug} -> ${countrySlug}:`, linkErr.message);
      } else {
        const arr = linksByRegion.get(regionId) || [];
        arr.push(countryId);
        linksByRegion.set(regionId, arr);
        createdLinks++;
      }
    }

    coveredNumerics.add(numeric);
  }

  console.log(
    JSON.stringify(
      {
        createdRegions,
        createdCountries,
        createdLinks,
        skippedNoIso,
        coveredNumerics: coveredNumerics.size,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
