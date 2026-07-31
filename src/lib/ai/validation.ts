import type { PlayerAssistantRequest, PlayerHistoryMessage } from "./contracts";

const PAGE_PATTERN = /^\/[a-z0-9À-ÿ_?=&%#./-]{0,300}$/i;

function validHistoryMessage(value: unknown): value is PlayerHistoryMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (row.role === "user" || row.role === "assistant")
    && typeof row.content === "string"
    && row.content.length >= 1
    && row.content.length <= (row.role === "user" ? 1000 : 12000);
}
export function parsePlayerAssistantRequest(value: unknown): PlayerAssistantRequest {
  if (!value || typeof value !== "object") throw new Error("Requête invalide.");
  const body = value as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 1000) {
    throw new Error("La question doit contenir entre 1 et 1 000 caractères.");
  }
  const history = Array.isArray(body.history) ? body.history : [];
  if (history.length > 20 || !history.every(validHistoryMessage)) {
    throw new Error("L’historique est invalide.");
  }
  const page = typeof body.page === "string" && PAGE_PATTERN.test(body.page) ? body.page : "/";
  const currentCountryId = typeof body.currentCountryId === "string" && body.currentCountryId.length <= 64
    ? body.currentCountryId
    : null;
  return { message, history, page, currentCountryId };
}
