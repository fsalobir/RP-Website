import { describe, expect, it } from "vitest";
import { computeRealmLabelAnchors } from "@/lib/realmMapLabels";

function squareFeature(regionId: string, minX: number, minY: number, size: number) {
  return {
    type: "Feature",
    properties: { regionId },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minX, minY],
        [minX + size, minY],
        [minX + size, minY + size],
        [minX, minY + size],
        [minX, minY],
      ]],
    },
  };
}

describe("computeRealmLabelAnchors", () => {
  it("choisit la composante principale par somme d'aires", () => {
    const landGeoJson = {
      type: "FeatureCollection",
      features: [
        squareFeature("r1", 0, 0, 1),
        squareFeature("r2", 1, 0, 1), // touche r1 => composante A = aire 2
        squareFeature("r3", 10, 0, 1.3), // composante B = aire 1.69
      ],
    } as any;

    const out = computeRealmLabelAnchors({
      landGeoJson,
      provinceByRegionId: new Map([
        ["r1", { id: "p1", realm_id: "realm-1" }],
        ["r2", { id: "p2", realm_id: "realm-1" }],
        ["r3", { id: "p3", realm_id: "realm-1" }],
      ]),
      realmById: new Map([["realm-1", { id: "realm-1", name: "Royaume 1" }]]),
    });

    expect(out).toHaveLength(1);
    expect(out[0].lon).toBeLessThan(5);
  });

  it("utilise la capitale nationale si elle est dans la composante principale", () => {
    const landGeoJson = {
      type: "FeatureCollection",
      features: [
        squareFeature("r1", 0, 0, 1),
        squareFeature("r2", 1, 0, 1),
        squareFeature("r3", 10, 0, 1.3),
      ],
    } as any;

    const out = computeRealmLabelAnchors({
      landGeoJson,
      provinceByRegionId: new Map([
        ["r1", { id: "p1", realm_id: "realm-1" }],
        ["r2", { id: "p2", realm_id: "realm-1" }],
        ["r3", { id: "p3", realm_id: "realm-1" }],
      ]),
      realmById: new Map([["realm-1", { id: "realm-1", name: "Royaume 1", capital_city_id: "c-main" }]]),
      cityById: new Map([["c-main", { id: "c-main", province_id: "p1", lon: 0.25, lat: 0.25 }]]),
    });

    expect(out[0].usedNationalCapital).toBe(true);
    expect(out[0].lon).toBeCloseTo(0.25, 6);
    expect(out[0].lat).toBeCloseTo(0.25, 6);
  });

  it("ignore la capitale nationale si elle est dans une exclave", () => {
    const landGeoJson = {
      type: "FeatureCollection",
      features: [
        squareFeature("r1", 0, 0, 1),
        squareFeature("r2", 1, 0, 1),
        squareFeature("r3", 10, 0, 1.3),
      ],
    } as any;

    const out = computeRealmLabelAnchors({
      landGeoJson,
      provinceByRegionId: new Map([
        ["r1", { id: "p1", realm_id: "realm-1" }],
        ["r2", { id: "p2", realm_id: "realm-1" }],
        ["r3", { id: "p3", realm_id: "realm-1" }],
      ]),
      realmById: new Map([["realm-1", { id: "realm-1", name: "Royaume 1", capital_city_id: "c-exclave" }]]),
      cityById: new Map([["c-exclave", { id: "c-exclave", province_id: "p3", lon: 10.3, lat: 0.3 }]]),
    });

    expect(out[0].usedNationalCapital).toBe(false);
    expect(out[0].lon).toBeLessThan(5);
  });
});
