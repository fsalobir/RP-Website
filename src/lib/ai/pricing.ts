import type { AiModel } from "./contracts";

export type ModelPrices = {
  input: number;
  cached_input: number;
  output: number;
};

export const DEFAULT_AI_PRICES: Record<AiModel, ModelPrices> = {
  "gpt-5.6-luna": { input: 0.2, cached_input: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cached_input: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 5, cached_input: 0.5, output: 30 },
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

const RESERVATION_INPUT_OVERHEAD_TOKENS = 4096;

export function calculateAiCost(usage: TokenUsage, prices: ModelPrices): number {
  const input = Math.max(0, Math.floor(usage.inputTokens));
  const cached = Math.min(input, Math.max(0, Math.floor(usage.cachedInputTokens)));
  const output = Math.max(0, Math.floor(usage.outputTokens));
  const raw = ((input - cached) * prices.input + cached * prices.cached_input + output * prices.output) / 1_000_000;
  return Math.ceil(raw * 1.1 * 100_000_000) / 100_000_000;
}

/** Les tokens BPE ne peuvent pas être plus nombreux que les octets UTF-8 fournis. */
export function estimateMaximumInputTokens(value: string): number {
  return Math.max(1, Buffer.byteLength(value, "utf8"));
}

export function calculateReservationCost(input: string, maxOutputTokens: number, prices: ModelPrices): number {
  return Math.max(
    0.00000001,
    calculateAiCost(
      {
        // Marge pour l'enveloppe Responses, le schéma structuré et les jetons de cadrage facturés.
        inputTokens: estimateMaximumInputTokens(input) + RESERVATION_INPUT_OVERHEAD_TOKENS,
        cachedInputTokens: 0,
        outputTokens: Math.max(1, maxOutputTokens),
      },
      prices
    )
  );
}

export function parseModelPrices(raw: unknown, model: AiModel): ModelPrices {
  if (!raw || typeof raw !== "object") return DEFAULT_AI_PRICES[model];
  const value = (raw as Record<string, unknown>)[model];
  if (!value || typeof value !== "object") return DEFAULT_AI_PRICES[model];
  const row = value as Record<string, unknown>;
  const input = Number(row.input);
  const cachedInput = Number(row.cached_input);
  const output = Number(row.output);
  return input > 0 && cachedInput >= 0 && output > 0
    ? { input, cached_input: cachedInput, output }
    : DEFAULT_AI_PRICES[model];
}
