export const AI_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
export const AI_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;

export type AiModel = (typeof AI_MODELS)[number];
export type AiEffort = (typeof AI_EFFORTS)[number];

export type PlayerHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};
export type PlayerAssistantRequest = {
  message: string;
  history: PlayerHistoryMessage[];
  page: string;
  currentCountryId?: string | null;
};

export type AssistantSource = {
  id: string;
  title: string;
  href: string;
  kind: "live" | "wiki" | "rule";
  updatedAt?: string | null;
};

export type PlayerStreamEvent =
  | { type: "text"; text: string }
  | { type: "sources"; sources: AssistantSource[] }
  | {
      type: "usage";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | { type: "done" }
  | { type: "error"; message: string; wikiHref: string };

export const ADMIN_JOB_STATUSES = [
  "queued",
  "claimed",
  "analyzing",
  "awaiting_first_approval",
  "preparing_preview",
  "awaiting_second_approval",
  "executing",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "expired",
] as const;

export type AdminJobStatus = (typeof ADMIN_JOB_STATUSES)[number];
export type AdminRequestKind = "code_read" | "game_read" | "game_action";
export type AdminRisk = "read" | "reversible" | "isolated";

export type AdminPlannedAction = {
  id: string;
  parameters: Record<string, unknown>;
  reason: string;
  risk: AdminRisk;
};

export type AdminActionPlan = {
  summary: string;
  requestKind: AdminRequestKind;
  complexity: "simple" | "complex";
  answer: string | null;
  actions: AdminPlannedAction[];
};

export type AdminJobItem = AdminPlannedAction & {
  sequence: number;
  reversible: boolean;
  status: "planned" | "previewed" | "completed" | "failed" | "restored";
  before?: unknown;
  after?: unknown;
  result?: unknown;
  error?: string;
};

export type AdminJobView = {
  id: string;
  status: AdminJobStatus;
  stage: "file" | "analysis" | "lecture" | "plan" | "sauvegarde" | "validations" | "execution";
  executionMode: "local" | "api_fallback";
  requestKind: AdminRequestKind;
  summary: string | null;
  plan: AdminActionPlan | null;
  preview: unknown;
  result: unknown;
  error: string | null;
  queuePosition: number | null;
  expiresAt: string;
  createdAt: string;
  items: AdminJobItem[];
};
