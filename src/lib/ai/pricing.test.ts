import { describe, expect, it } from "vitest";
import {
  calculateAiCost,
  calculateReservationCost,
  DEFAULT_AI_PRICES,
  estimateMaximumInputTokens,
  parseModelPrices,
} from "./pricing";

describe("coût IA", () => {
  it("facture séparément entrée, cache et sortie avec la marge de 10 %", () => {
    expect(calculateAiCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 1_000_000,
    }, DEFAULT_AI_PRICES["gpt-5.6-luna"])).toBeCloseTo(1.441, 7);
  });

  it("réserve toujours au moins le coût réel couvert", () => {
    const prompt = "Question française avec des accents";
    const prices = DEFAULT_AI_PRICES["gpt-5.6-terra"];
    const reservation = calculateReservationCost(prompt, 300, prices);
    const actual = calculateAiCost({
      inputTokens: estimateMaximumInputTokens(prompt),
      cachedInputTokens: 0,
      outputTokens: 300,
    }, prices);
    expect(reservation).toBeGreaterThanOrEqual(actual);
  });

  it("ignore une grille tarifaire invalide", () => {
    expect(parseModelPrices({ "gpt-5.6-sol": { input: -1, cached_input: 0, output: 0 } }, "gpt-5.6-sol"))
      .toEqual(DEFAULT_AI_PRICES["gpt-5.6-sol"]);
  });
});
