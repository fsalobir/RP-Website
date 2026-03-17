import { describe, expect, it } from "vitest";
import {
  computeWorldIdeologies,
  createZeroScores,
  DEFAULT_IDEOLOGY_CONFIG,
  IDEOLOGY_IDS,
  normalizeIdeologyScores,
  normalizeIdeologyScoresWithAxioms,
  relationKey,
} from "@/lib/ideology";

function sumScores(scores: Record<string, number>): number {
  return Object.values(scores).reduce((a, b) => a + b, 0);
}

describe("PLAN_SCENARIOS_TEST — Section 7 (Idéologie)", () => {
  it("Scénario 7.1 — Normalisation simple à 100", () => {
    const scores = normalizeIdeologyScores({
      germanic_monarchy: 10,
      satoiste_cultism: 30,
    } as any);

    expect(scores.germanic_monarchy).toBe(25);
    expect(scores.satoiste_cultism).toBe(75);
    for (const id of IDEOLOGY_IDS) {
      if (id !== "germanic_monarchy" && id !== "satoiste_cultism") expect(scores[id]).toBe(0);
    }
    expect(sumScores(scores)).toBe(100);
  });

  it("Scénario 7.2 — Axiomes : winner takes all par paire + renormalisation à 100", () => {
    const out = normalizeIdeologyScoresWithAxioms({
      germanic_monarchy: 40,
      mughal_republicanism: 10,
      french_republicanism: 5,
      satoiste_cultism: 25,
      nilotique_cultism: 15,
      merina_monarchy: 5,
    } as any);

    expect(out.germanic_monarchy).toBe(50);
    expect(out.mughal_republicanism).toBe(0);

    expect(out.satoiste_cultism).toBe(30);
    expect(out.french_republicanism).toBe(0);

    expect(out.nilotique_cultism).toBe(20);
    expect(out.merina_monarchy).toBe(0);

    expect(sumScores(out)).toBe(100);
  });

  it("Scénario 7.3 — Pull voisin + drift + axiomes => germanic=82, satoiste=18, somme=100", () => {
    const cfg = { ...DEFAULT_IDEOLOGY_CONFIG };

    // Prior(X) = germanic=100 ; prior(Y)=satoiste=100
    const X: any = {
      id: "X",
      name: "X",
      slug: "x",
      flag_url: null,
      regime: null,
      militarism: null,
      industry: null,
      science: null,
      stability: null,
      gdp: null,
      population: null,
      ideology_germanic_monarchy: 100,
      ideology_satoiste_cultism: 0,
      ideology_nilotique_cultism: 0,
      ideology_mughal_republicanism: 0,
      ideology_french_republicanism: 0,
      ideology_merina_monarchy: 0,
    };
    const Y: any = {
      id: "Y",
      name: "Y",
      slug: "y",
      flag_url: null,
      regime: null,
      militarism: null,
      industry: null,
      science: null,
      stability: null,
      gdp: null,
      population: null,
      ideology_germanic_monarchy: 0,
      ideology_satoiste_cultism: 100,
      ideology_nilotique_cultism: 0,
      ideology_mughal_republicanism: 0,
      ideology_french_republicanism: 0,
      ideology_merina_monarchy: 0,
    };

    const neighborIdsByCountry = new Map<string, string[]>([["X", ["Y"]]]);
    const relationMap = new Map<string, number>([[relationKey("X", "Y"), 50]]);
    const influenceByCountry = new Map<string, number>([
      ["X", 0],
      ["Y", 1], // maxInfluence
    ]);

    const res = computeWorldIdeologies({
      countries: [X, Y],
      config: cfg,
      neighborIdsByCountry,
      relationMap,
      influenceByCountry,
    });

    const x = res.get("X")!;
    expect(x.scores.germanic_monarchy).toBe(82);
    expect(x.scores.satoiste_cultism).toBe(18);
    for (const id of IDEOLOGY_IDS) {
      if (id !== "germanic_monarchy" && id !== "satoiste_cultism") expect(x.scores[id]).toBe(0);
    }
    expect(sumScores(x.scores)).toBe(100);
  });

  it("Scénario 7.4 — Effet snap domine (invariants: somme=100, axiomes, satoiste dominant)", () => {
    const X: any = {
      id: "X",
      name: "X",
      slug: "x",
      flag_url: null,
      regime: null,
      militarism: null,
      industry: null,
      science: null,
      stability: null,
      gdp: null,
      population: null,
      // Prior neutre (aucune colonne fournie) => neutral
    };

    const effectsByCountry = new Map<string, any>([
      [
        "X",
        {
          drift: createZeroScores(),
          snap: { ...createZeroScores(), satoiste_cultism: 1 },
        },
      ],
    ]);

    const res = computeWorldIdeologies({
      countries: [X],
      effectsByCountry,
      // pas de voisins
    });

    const x = res.get("X")!;
    expect(sumScores(x.scores)).toBe(100);

    // Axiomes => exactement 3 non nuls (sauf cas de neutralité parfaite, qui n'est pas le cas ici car snap introduit une direction)
    const nonZero = Object.entries(x.scores).filter(([, v]) => v > 0);
    expect(nonZero).toHaveLength(3);
    expect(x.dominant).toBe("satoiste_cultism");
  });
});

