export type D100Outcome =
  | "critical_failure"
  | "major_failure"
  | "minor_failure"
  | "minor_success"
  | "major_success"
  | "critical_success";

export type ArticleProfile = "brief" | "standard" | "dossier";
export type StaffDecisionMode = "auto" | "mj";

export interface ActionAutomationConfig {
  action_type_id: string;
  enabled_for_major: boolean;
  enabled_for_minor: boolean;
  weight: number;
  requires_target: boolean;
  preconditions: Record<string, unknown>;
  cooldown_hours: number;
  roll_mode: StaffDecisionMode;
  validation_mode: StaffDecisionMode;
  publish_failures: boolean;
  article_profile: ArticleProfile;
  max_context_articles: number;
  context_window_rp_months: number;
  discord_destination: "national" | "international";
  embed_color: number;
  image_urls: string[];
}

export interface MagnumArticleSection {
  title: string;
  body: string;
}

export interface MagnumArticleOutput {
  title: string;
  description: string;
  sections?: MagnumArticleSection[];
}

export type LoreArticleAuthority = "engine" | "mj" | "official" | "player" | "unclassified";

export interface LoreArticle {
  id: string;
  source_kind: LoreArticleAuthority;
  source_platform: "engine" | "discord" | "manual";
  action_id: string | null;
  countries: Array<{
    country_id: string;
    relation_role: "author" | "target" | "mentioned";
    continent_id?: string | null;
  }>;
  tags: string[];
  rp_year: number | null;
  rp_month: number | null;
  rp_day: number | null;
  rp_week: number | null;
  real_published_at: string | null;
  title: string;
  description: string;
  raw_content: string;
  clean_content: string;
  current_output: MagnumArticleOutput | Record<string, never>;
  embeds: unknown[];
  links: string[];
  discord_channel_id: string | null;
  discord_message_id: string | null;
  editorial_status: "draft" | "review" | "approved" | "published" | "quarantined";
  deleted_at: string | null;
  nsfw_quarantined: boolean;
}

export type PipelineJobStatus =
  | "pending"
  | "running"
  | "retry"
  | "review"
  | "succeeded"
  | "warning"
  | "cancelled";

export interface PipelineJob {
  id: string;
  job_type: "generate_article" | "publish_discord" | "discord_sync";
  action_id: string | null;
  lore_article_id: string | null;
  payload: Record<string, unknown>;
  priority: number;
  status: PipelineJobStatus;
  attempt_count: number;
  next_attempt_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  idempotency_key: string;
}

export interface ActionExecutionLedger {
  id: string;
  action_id: string;
  execution_version: number;
  sequence_no: number;
  operation_kind: string;
  target_table: string;
  target_key: Record<string, unknown>;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  reverted_at: string | null;
  applied_at: string;
}
