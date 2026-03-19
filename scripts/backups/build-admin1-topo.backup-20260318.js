/**
 * BACKUP (2026-03-18)
 * Ancienne génération "clusters/quotas" avant bascule vers frontières image.
 */
/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const { topology } = require("topojson-server");
const { presimplify, simplify } = require("topojson-simplify");
const { merge, feature } = require("topojson-client");
const turf = require("@turf/turf");

// Ce fichier est dans `scripts/backups/` → remonter à la racine du repo
const ROOT = path.resolve(__dirname, "..", "..");
const INPUT_ADMIN1 = path.join(ROOT, "scripts", "geo", "ne_50m_admin_1_states_provinces.geojson");
const INPUT_ADMIN0 = path.join(ROOT, "scripts", "geo", "ne_50m_admin_0_countries.geojson");
const INPUT_ADMIN1_10M = path.join(ROOT, "scripts", "geo", "ne_10m_admin_1_states_provinces.geojson");
const OUTPUT = path.join(ROOT, "public", "geo", "admin1.topo.json");

function pickProps(p) {
  const regionId = String(p.adm1_code ?? "").trim();
  return {
    regionId,
    name: p.name ?? null,
    admin: p.admin ?? null,
    iso_3166_2: p.iso_3166_2 ?? null,
    iso_a2: p.iso_a2 ?? null,
    type: p.type_en ?? p.type ?? null,
    region: p.region ?? null,
    region_cod: p.region_cod ?? null,
  };
}

function normalizeIsoA2(isoA2, postal) {
  const iso = isoA2 && isoA2 !== "-99" ? String(isoA2) : null;
  if (iso) return iso;
  const p = postal ? String(postal) : null;
  if (!p) return null;
  const overrides = new Map([
    ["F", "FR"],
    ["N", "NO"],
    ["KO", "XK"],
  ]);
  return overrides.get(p) ?? p;
}

function clampInt(n, min, max) {
  const v = Math.round(Number(n) || 0);
  return Math.max(min, Math.min(max, v));
}

function hashStringToInt(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function meanPointOfCoords(coords) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const push = (pt) => {
    if (!pt || pt.length < 2) return;
    const x = Number(pt[0]);
    const y = Number(pt[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    sx += x;
    sy += y;
    n += 1;
  };
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      push(c);
      return;
    }
    for (const child of c) walk(child);
  };
  walk(coords);
  if (!n) return [0, 0];
  return [sx / n, sy / n];
}

function centroidOfFeatureGeometry(geometry) {
  if (!geometry) return [0, 0];
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return meanPointOfCoords(geometry.coordinates);
  }
  return [0, 0];
}

function kmeans(points, k, seed) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const kk = clampInt(k, 1, points.length);
  const rng = makeRng(seed);
  const centers = [];
  const used = new Set();
  while (centers.length < kk && used.size < points.length) {
    const idx = Math.floor(rng() * points.length);
    if (used.has(idx)) continue;
    used.add(idx);
    centers.push([points[idx][0], points[idx][1]]);
  }
  while (centers.length < kk) {
    centers.push([points[centers.length % points.length][0], points[centers.length % points.length][1]]);
  }

  const assign = new Array(points.length).fill(0);
  for (let iter = 0; iter < 20; iter += 1) {
    let changed = false;
    for (let i = 0; i < points.length; i += 1) {
      const [x, y] = points[i];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const dx = x - centers[c][0];
        const dy = y - centers[c][1];
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    const sx = new Array(centers.length).fill(0);
    const sy = new Array(centers.length).fill(0);
    const cnt = new Array(centers.length).fill(0);
    for (let i = 0; i < points.length; i += 1) {
      const c = assign[i];
      sx[c] += points[i][0];
      sy[c] += points[i][1];
      cnt[c] += 1;
    }
    for (let c = 0; c < centers.length; c += 1) {
      if (!cnt[c]) {
        const idx = Math.floor(rng() * points.length);
        centers[c] = [points[idx][0], points[idx][1]];
      } else {
        centers[c] = [sx[c] / cnt[c], sy[c] / cnt[c]];
      }
    }
    if (!changed) break;
  }
  return assign;
}

function ensureNonEmptyClusters(assign, k, points) {
  const kk = clampInt(k, 1, points.length);
  const counts = new Array(kk).fill(0);
  for (const c of assign) counts[c] = (counts[c] ?? 0) + 1;
  const empties = [];
  for (let c = 0; c < kk; c += 1) if (!counts[c]) empties.push(c);
  if (!empties.length) return assign;
  for (const emptyCid of empties) {
    let largestCid = 0;
    for (let c = 1; c < kk; c += 1) if (counts[c] > counts[largestCid]) largestCid = c;
    if (counts[largestCid] <= 1) continue;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < assign.length; i += 1) {
      if (assign[i] !== largestCid) continue;
      sx += points[i][0];
      sy += points[i][1];
      n += 1;
    }
    const cx = n ? sx / n : 0;
    const cy = n ? sy / n : 0;
    let bestI = -1;
    let bestD = -1;
    for (let i = 0; i < assign.length; i += 1) {
      if (assign[i] !== largestCid) continue;
      const dx = points[i][0] - cx;
      const dy = points[i][1] - cy;
      const d = dx * dx + dy * dy;
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      assign[bestI] = emptyCid;
      counts[largestCid] -= 1;
      counts[emptyCid] += 1;
    }
  }
  return assign;
}

function dissolveByGroups(features, isoA2, adminName, groupKeyFn, groupNameFn) {
  if (!features.length) return [];
  const tmpTopo = topology({ tmp: { type: "FeatureCollection", features } }, 5e4);
  const geoms = tmpTopo.objects.tmp.geometries;
  const groups = new Map();
  for (const g of geoms) {
    const p = g.properties || {};
    const k = groupKeyFn(p);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(g);
    groups.set(k, arr);
  }
  const out = [];
  let idx = 1;
  for (const [k, arr] of groups.entries()) {
    if (!arr || arr.length === 0) continue;
    const mergedGeom = merge(tmpTopo, arr);
    const name = groupNameFn(k, idx);
    out.push({
      type: "Feature",
      geometry: mergedGeom,
      properties: {
        regionId: `${isoA2}-${k}`,
        name,
        admin: adminName,
        iso_3166_2: null,
        iso_a2: isoA2,
        type: "Province",
      },
    });
    idx += 1;
  }
  return out;
}

function main() {
  const geoAdmin1 = JSON.parse(fs.readFileSync(INPUT_ADMIN1, "utf8"));
  const geoAdmin0 = JSON.parse(fs.readFileSync(INPUT_ADMIN0, "utf8"));
  const geoAdmin1_10m = JSON.parse(fs.readFileSync(INPUT_ADMIN1_10M, "utf8"));

  const admin1Features = geoAdmin1.features
    .filter((f) => f && f.type === "Feature" && f.geometry && f.properties)
    .map((f) => ({ type: "Feature", geometry: f.geometry, properties: pickProps(f.properties) }))
    .filter((f) => f.properties.regionId && f.properties.regionId.length > 0);

  // Continent par ISO_A2 (d'après admin0) : utile pour des règles de simplification.
  const continentByIso = new Map();
  for (const f of geoAdmin0.features) {
    const p = f?.properties;
    if (!p) continue;
    const isoA2 = normalizeIsoA2(p.ISO_A2 ?? null, p.POSTAL ?? null);
    const continent = p.CONTINENT ?? null;
    if (!isoA2 || isoA2 === "AQ") continue;
    if (continent) continentByIso.set(isoA2, continent);
  }

  // Pays à charger depuis l'Admin1 10m : Europe + Afrique + extensions explicites pour les blocs (Moyen‑Orient).
  const extraIsoA2 = new Set([
    // Turquie + Levant
    "TR",
    "SY",
    "IL",
    "LB",
    "PS",
    // Bloc Arabie (union)
    "SA",
    "JO",
    "YE",
    "OM",
    "AE",
    "QA",
    "BH",
    "KW",
    "IQ",
    "IR",
  ]);

  const targetIsoA2 = new Set(
    geoAdmin0.features
      .map((f) => f?.properties)
      .filter(Boolean)
      .map((p) => ({ isoA2: normalizeIsoA2(p.ISO_A2 ?? null, p.POSTAL ?? null), continent: p.CONTINENT ?? null }))
      .filter((x) => x.isoA2 && x.isoA2 !== "AQ")
      .filter((x) => x.continent === "Europe" || x.continent === "Africa" || extraIsoA2.has(x.isoA2))
      .map((x) => x.isoA2),
  );

  // Au cas où certains ISO n'existent pas dans admin0 (rare), on les force quand même.
  for (const iso of extraIsoA2) targetIsoA2.add(iso);

  const coveredIsoA2 = new Set(admin1Features.map((f) => f.properties.iso_a2).filter(Boolean));
  const admin0Fallback = geoAdmin0.features
    .filter((f) => f && f.type === "Feature" && f.geometry && f.properties)
    .map((f) => {
      const p = f.properties || {};
      const isoA2 = normalizeIsoA2(p.ISO_A2 ?? null, p.POSTAL ?? null);
      const adm0A3 = p.ADM0_A3 ?? p.SOV_A3 ?? null;
      const name = p.NAME ?? p.ADMIN ?? null;
      const continent = p.CONTINENT ?? null;
      if (continent === "Antarctica" || isoA2 === "AQ") return null;
      if (!isoA2 || coveredIsoA2.has(isoA2)) return null;
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: { regionId: `${String(adm0A3 ?? isoA2)}-0`, name, admin: name, iso_3166_2: null, iso_a2: isoA2, type: "Pays" },
      };
    })
    .filter(Boolean);

  const admin1_10m_features = geoAdmin1_10m.features
    .filter((f) => f && f.type === "Feature" && f.geometry && f.properties)
    .map((f) => ({ type: "Feature", geometry: f.geometry, properties: pickProps(f.properties) }))
    .filter((f) => f.properties.regionId && f.properties.regionId.length > 0)
    .filter((f) => f.properties.iso_a2 && f.properties.iso_a2 !== "AQ")
    .filter((f) => f.properties.iso_a2 && targetIsoA2.has(f.properties.iso_a2));

  const unitsByIso = new Map();
  for (const f of admin1_10m_features) {
    const iso = f.properties.iso_a2;
    if (!iso) continue;
    const arr = unitsByIso.get(iso) ?? [];
    arr.push(f);
    unitsByIso.set(iso, arr);
  }

  const adminNameByIso = new Map();
  for (const f of admin0Fallback) {
    if (!f?.properties?.iso_a2) continue;
    adminNameByIso.set(f.properties.iso_a2, { admin: f.properties.admin ?? null });
  }
  for (const f of admin1_10m_features) {
    const iso = f.properties.iso_a2;
    if (!iso) continue;
    if (!adminNameByIso.has(iso)) adminNameByIso.set(iso, { admin: f.properties.admin ?? null });
  }

  const targetDetailed = [];
  const desiredKByIso = {
    // Quotas existants
    IE: 4,
    CH: 2,
    // Nouveaux quotas demandés
    PT: 4,
    CZ: 2,
    HU: 2,
    AT: 2,
    MD: 1,
  };
  const beneluxIso = new Set(["BE", "NL", "LU"]);
  const yugoIso = new Set(["SI", "HR", "BA", "RS", "ME", "MK", "XK"]);
  const turLevIso = new Set(["TR", "SY", "IL", "LB", "PS"]);
  const arabiaIso = new Set(["SA", "JO", "YE", "OM", "AE", "QA", "BH", "KW", "IQ", "IR"]);

  // Simplification Afrique :
  // - MA/DZ/TN/LY/EG restent détaillés comme avant
  // - tout le reste de l'Afrique est dissous en un SEUL bloc "Afrique" vide
  const africaKeepDetailed = new Set(["MA", "DZ", "TN", "LY", "EG"]);
  const africaUnionUnits = [];
  const turLevUnits = [];
  const arabiaUnits = [];

  for (const iso of targetIsoA2) {
    if (yugoIso.has(iso)) continue;
    if (beneluxIso.has(iso)) continue;
    if (turLevIso.has(iso)) {
      (unitsByIso.get(iso) ?? []).forEach((u) => turLevUnits.push(u));
      continue;
    }
    if (arabiaIso.has(iso)) {
      (unitsByIso.get(iso) ?? []).forEach((u) => arabiaUnits.push(u));
      continue;
    }
    const units = unitsByIso.get(iso) ?? [];
    if (!units.length) continue;
    const adminName = adminNameByIso.get(iso)?.admin ?? null;

    const continent = continentByIso.get(iso) ?? null;
    if (continent === "Africa" && !africaKeepDetailed.has(iso)) {
      // On ne garde plus le pays individuellement : il est absorbé dans le bloc "Afrique".
      for (const u of units) africaUnionUnits.push(u);
      continue;
    }

    const desiredKOverride = desiredKByIso[iso] ?? null;
    if (desiredKOverride) {
      const desiredK = clampInt(desiredKOverride, 1, units.length);
      const seed = hashStringToInt(`${iso}::quota`);
      const pts = units.map((u) => centroidOfFeatureGeometry(u.geometry));
      const assignment = ensureNonEmptyClusters(kmeans(pts, desiredK, seed), desiredK, pts);
      const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: units } }, 5e4);
      const geoms = tmpTopo.objects.tmp.geometries;
      const clusters = new Map();
      for (let i = 0; i < geoms.length; i += 1) {
        const c = assignment[i] ?? 0;
        const arr = clusters.get(c) ?? [];
        arr.push(geoms[i]);
        clusters.set(c, arr);
      }
      const sorted = [...clusters.keys()].sort((a, b) => a - b);
      let idx = 1;
      for (const cid of sorted) {
        const arr = clusters.get(cid) ?? [];
        if (!arr.length) continue;
        targetDetailed.push({
          type: "Feature",
          geometry: merge(tmpTopo, arr),
          properties: { regionId: `${iso}-${idx}`, name: `Province ${idx}`, admin: adminName, iso_3166_2: null, iso_a2: iso, type: "Province" },
        });
        idx += 1;
      }
      continue;
    }
    const desiredK = units.length < 6 ? units.length : 8;
    const seed = hashStringToInt(iso);
    const pts = units.map((u) => centroidOfFeatureGeometry(u.geometry));
    const assignment = ensureNonEmptyClusters(kmeans(pts, desiredK, seed), desiredK, pts);
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: units } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    const clusters = new Map();
    for (let i = 0; i < geoms.length; i += 1) {
      const c = assignment[i] ?? 0;
      const arr = clusters.get(c) ?? [];
      arr.push(geoms[i]);
      clusters.set(c, arr);
    }
    const sorted = [...clusters.keys()].sort((a, b) => a - b);
    let idx = 1;
    for (const cid of sorted) {
      const arr = clusters.get(cid) ?? [];
      if (!arr.length) continue;
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, arr),
        properties: { regionId: `${iso}-${idx}`, name: `Province ${idx}`, admin: adminName, iso_3166_2: null, iso_a2: iso, type: "Province" },
      });
      idx += 1;
    }
  }

  // Ajouter le bloc "Afrique" (toute l'Afrique hors MA/DZ/TN/LY/EG) en une seule région.
  if (africaUnionUnits.length) {
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: africaUnionUnits } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    if (geoms && geoms.length) {
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, geoms),
        properties: {
          regionId: "AFR-1",
          name: "Afrique",
          admin: "Afrique",
          iso_3166_2: null,
          // "AF" est déjà l'Afghanistan. On utilise un code interne non-collisionnant.
          iso_a2: "XA",
          type: "Bloc",
        },
      });
    }
  }

  // Bloc Turquie + Levant : fusionner TR/SY/IL/LB/PS puis découper en 8 provinces.
  if (turLevUnits.length) {
    const desiredK = clampInt(8, 1, turLevUnits.length);
    const seed = hashStringToInt("TURLEV::quota");
    const pts = turLevUnits.map((u) => centroidOfFeatureGeometry(u.geometry));
    const assignment = ensureNonEmptyClusters(kmeans(pts, desiredK, seed), desiredK, pts);
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: turLevUnits } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    const clusters = new Map();
    for (let i = 0; i < geoms.length; i += 1) {
      const c = assignment[i] ?? 0;
      const arr = clusters.get(c) ?? [];
      arr.push(geoms[i]);
      clusters.set(c, arr);
    }
    const sorted = [...clusters.keys()].sort((a, b) => a - b);
    let idx = 1;
    for (const cid of sorted) {
      const arr = clusters.get(cid) ?? [];
      if (!arr.length) continue;
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, arr),
        properties: {
          regionId: `TL-${idx}`,
          name: `Province ${idx}`,
          admin: "Turquie & Levant",
          iso_3166_2: null,
          // Code interne : ne pas collisionner avec TL (Timor‑Leste)
          iso_a2: "XL",
          type: "Province",
        },
      });
      idx += 1;
    }
  }

  // Bloc Arabie : un seul bloc (sans provinces internes).
  if (arabiaUnits.length) {
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: arabiaUnits } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    if (geoms && geoms.length) {
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, geoms),
        properties: {
          regionId: "ARB-1",
          name: "Arabie",
          admin: "Arabie",
          iso_3166_2: null,
          // Code interne non‑collisionnant
          iso_a2: "XB",
          type: "Bloc",
        },
      });
    }
  }

  const beneluxUnits = [];
  for (const iso of beneluxIso) (unitsByIso.get(iso) ?? []).forEach((u) => beneluxUnits.push(u));
  if (beneluxUnits.length) {
    const desiredK = 4;
    const seed = hashStringToInt("BENELUX::quota");
    const pts = beneluxUnits.map((u) => centroidOfFeatureGeometry(u.geometry));
    const assignment = ensureNonEmptyClusters(kmeans(pts, desiredK, seed), desiredK, pts);
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: beneluxUnits } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    const clusters = new Map();
    for (let i = 0; i < geoms.length; i += 1) {
      const c = assignment[i] ?? 0;
      const arr = clusters.get(c) ?? [];
      arr.push(geoms[i]);
      clusters.set(c, arr);
    }
    const sorted = [...clusters.keys()].sort((a, b) => a - b);
    let idx = 1;
    for (const cid of sorted) {
      const arr = clusters.get(cid) ?? [];
      if (!arr.length) continue;
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, arr),
        properties: { regionId: `BX-${idx}`, name: `Benelux ${idx}`, admin: "Benelux", iso_3166_2: null, iso_a2: "BX", type: "Province" },
      });
      idx += 1;
    }
  }

  const yugoUnits = [];
  for (const iso of yugoIso) (unitsByIso.get(iso) ?? []).forEach((u) => yugoUnits.push(u));
  if (yugoUnits.length) {
    const desiredK = 4;
    const seed = hashStringToInt("YUGO::quota");
    const pts = yugoUnits.map((u) => centroidOfFeatureGeometry(u.geometry));
    const assignment = ensureNonEmptyClusters(kmeans(pts, desiredK, seed), desiredK, pts);
    const tmpTopo = topology({ tmp: { type: "FeatureCollection", features: yugoUnits } }, 5e4);
    const geoms = tmpTopo.objects.tmp.geometries;
    const clusters = new Map();
    for (let i = 0; i < geoms.length; i += 1) {
      const c = assignment[i] ?? 0;
      const arr = clusters.get(c) ?? [];
      arr.push(geoms[i]);
      clusters.set(c, arr);
    }
    const sorted = [...clusters.keys()].sort((a, b) => a - b);
    let idx = 1;
    for (const cid of sorted) {
      const arr = clusters.get(cid) ?? [];
      if (!arr.length) continue;
      targetDetailed.push({
        type: "Feature",
        geometry: merge(tmpTopo, arr),
        properties: { regionId: `YU-${idx}`, name: `Yougoslavie ${idx}`, admin: "Yougoslavie", iso_3166_2: null, iso_a2: "YU", type: "Province" },
      });
      idx += 1;
    }
  }

  const baseFeatures = [...admin1Features, ...(admin0Fallback ?? [])].filter(
    (f) => !(f.properties.iso_a2 && targetIsoA2.has(f.properties.iso_a2)),
  );

  const cleaned = { type: "FeatureCollection", features: [...baseFeatures, ...targetDetailed] };
  let topo = topology({ admin1: cleaned }, 2e4);
  topo = presimplify(topo);
  topo = simplify(topo, 4e-4);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(topo));
  console.log(`OK: ${OUTPUT}`);
}

main();

