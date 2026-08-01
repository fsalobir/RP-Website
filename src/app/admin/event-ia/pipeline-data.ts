import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeAdminEffectsAdded } from "@/lib/countryEffects";
import type {
  DiscordRouteView,
  LoreArticleView,
  PipelineAlertView,
  RpPipelineActionView,
  RpPipelineDashboardData,
  RpPipelineJobView,
} from "@/components/admin/RpPipelineDashboard";

type Row = Record<string, unknown>;

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function relation(value: unknown): Row {
  return Array.isArray(value) ? object(value[0]) : object(value);
}

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function number(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function articleSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const section = object(item);
    const title = text(section, "title");
    const body = text(section, "body");
    return title && body ? [{ title, body }] : [];
  });
}

function readable(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function ledgerEntries(row: Row) {
  const raw = row.changes ?? row.operations ?? row.ledger;
  if (!Array.isArray(raw)) {
    const target = object(row.target_key);
    const entity = [text(row, "target_table"), readable(target)].filter(Boolean).join(" · ");
    return [{
      label: text(row, "label", "operation_kind") ?? (entity || "Modification"),
      before: readable(row.before_state ?? row.before_value),
      after: readable(row.after_state ?? row.after_value),
    }];
  }
  return raw.slice(0, 30).map((item, index) => {
    const entry = object(item);
    return {
      label: text(entry, "label", "field", "path", "operation") ?? `Modification ${index + 1}`,
      before: readable(entry.before ?? entry.previous_value),
      after: readable(entry.after ?? entry.new_value),
    };
  });
}

export async function loadRpPipelineAlertCount(): Promise<number> {
  const supabase = await createClient();
  const [
    jobsResult,
    alertArticlesResult,
    discordChannelsResult,
    pipelineConfigResult,
    workerHeartbeatResult,
  ] = await Promise.all([
    supabase
      .from("rp_pipeline_jobs")
      .select("status, created_at, updated_at, locked_at, next_attempt_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("lore_articles")
      .select("nsfw_quarantined, classification_status, deleted_at")
      .or("nsfw_quarantined.eq.true,classification_status.in.(pending,ambiguous)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("discord_rp_channels")
      .select("sync_error, ingest_enabled, publish_enabled"),
    supabase.from("rule_parameters").select("value").eq("key", "rp_pipeline_config").maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "rp_pipeline_worker_heartbeat").maybeSingle(),
  ]);
  const error = [
    jobsResult,
    alertArticlesResult,
    discordChannelsResult,
    pipelineConfigResult,
    workerHeartbeatResult,
  ].find((result) => result.error)?.error;
  if (error) throw new Error(`Impossible de compter les points à traiter : ${error.message}`);

  const jobs = (jobsResult.data ?? []) as Row[];
  const activeJobs = jobs.filter((row) =>
    ["pending", "running", "retry"].includes(text(row, "status") ?? "")
  );
  const jobAlertCount = jobs.filter((row) =>
    ["review", "warning"].includes(text(row, "status") ?? "")
  ).length;
  const articleAlertCount = ((alertArticlesResult.data ?? []) as Row[]).filter((row) =>
    row.nsfw_quarantined === true ||
    (!row.deleted_at && ["pending", "ambiguous"].includes(text(row, "classification_status") ?? ""))
  ).length;
  const channels = (discordChannelsResult.data ?? []) as Row[];
  const pipelineConfig = object(pipelineConfigResult.data?.value);
  const heartbeat = object(workerHeartbeatResult.data?.value);
  const workerExpected = pipelineConfig.enabled === true ||
    activeJobs.length > 0 ||
    channels.some((row) => row.ingest_enabled === true || row.publish_enabled === true);
  const lastSuccessAt = text(heartbeat, "last_success_at");
  const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : 0;
  const workerStale = workerExpected &&
    (!Number.isFinite(lastSuccessMs) || Date.now() - lastSuccessMs > 3 * 60_000);
  const jobOverdue = !workerStale && activeJobs.some((row) => {
    const reference = text(row, "status") === "running"
      ? text(row, "locked_at", "updated_at")
      : text(row, "next_attempt_at", "created_at");
    const timestamp = reference ? Date.parse(reference) : Number.NaN;
    return Number.isFinite(timestamp) && Date.now() - timestamp > 30 * 60_000;
  });

  return jobAlertCount +
    articleAlertCount +
    channels.filter((row) => Boolean(text(row, "sync_error"))).length +
    (workerStale || jobOverdue ? 1 : 0);
}

export async function loadRpPipelineDashboard(
  isAdmin: boolean,
  options: { libraryQuery: string; libraryPage: number },
): Promise<RpPipelineDashboardData> {
  const supabase = await createClient();
  const pageSize = 20;
  const requestedLibraryPage = Math.max(1, options.libraryPage);
  const librarySearch = options.libraryQuery
    .trim()
    .slice(0, 120)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const runLibraryQuery = (page: number) => {
    const from = (page - 1) * pageSize;
    let query = supabase
      .from("lore_articles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (librarySearch) {
      query = query.or(
        `title.ilike.%${librarySearch}%,clean_content.ilike.%${librarySearch}%,raw_content.ilike.%${librarySearch}%`,
      );
    }
    return query;
  };
  const loadLibraryPage = async () => {
    let page = requestedLibraryPage;
    let result = await runLibraryQuery(page);
    const total = result.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (!result.error && page > pageCount) {
      page = pageCount;
      result = await runLibraryQuery(page);
    }
    return { result, page, total };
  };
  const [
    actionsResult,
    jobsResult,
    libraryLoad,
    alertArticlesResult,
    ledgerResult,
    discordChannelsResult,
    countriesResult,
    countryPlayersResult,
    actionTypesResult,
    automationConfigsResult,
    continentsResult,
    rosterUnitsResult,
    staffResult,
    pipelineConfigResult,
    workerHeartbeatResult,
  ] = await Promise.all([
    supabase
      .from("ai_event_requests")
      .select("*, country:countries!country_id(name), action_type:state_action_types!action_type_id(label_fr)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("rp_pipeline_jobs").select("*").order("created_at", { ascending: false }).limit(200),
    loadLibraryPage(),
    supabase
      .from("lore_articles")
      .select("*")
      .or("nsfw_quarantined.eq.true,classification_status.in.(pending,ambiguous)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("action_execution_ledger").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("discord_rp_channels").select("*").order("route_scope"),
    supabase.from("countries").select("id, name, discord_role_id").order("name"),
    isAdmin
      ? supabase.from("country_players").select("user_id, country_id, email, discord_user_id")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("state_action_types").select("id, key, label_fr").order("sort_order"),
    supabase.from("action_automation_configs").select("*"),
    supabase.from("continents").select("id, label_fr").order("label_fr"),
    supabase
      .from("military_roster_units")
      .select("id, name_fr, branch, sub_type")
      .order("name_fr"),
    isAdmin
      ? supabase.from("rp_staff").select("user_id, role")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("rule_parameters").select("value").eq("key", "rp_pipeline_config").maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "rp_pipeline_worker_heartbeat").maybeSingle(),
  ]);

  const loadError = [
    actionsResult,
    jobsResult,
    libraryLoad.result,
    alertArticlesResult,
    ledgerResult,
    discordChannelsResult,
    countriesResult,
    countryPlayersResult,
    actionTypesResult,
    automationConfigsResult,
    continentsResult,
    rosterUnitsResult,
    staffResult,
    pipelineConfigResult,
    workerHeartbeatResult,
  ].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger le moteur RP : ${loadError.message}`);

  const actionRows = (actionsResult.data ?? []) as Row[];
  const actionIds = actionRows.map((row) => String(row.id));
  const emptyResult = Promise.resolve({ data: [] as Row[], error: null });
  const [actionArticlesResult, actionSourcesResult] = await Promise.all([
    actionIds.length
      ? supabase
          .from("lore_articles")
          .select("*")
          .in("action_id", actionIds)
          .order("created_at", { ascending: false })
      : emptyResult,
    actionIds.length
      ? supabase.from("action_lore_sources").select("*").in("action_id", actionIds)
      : emptyResult,
  ]);
  const dependentError = actionArticlesResult.error ?? actionSourcesResult.error;
  if (dependentError) throw new Error(`Impossible de charger les sources du moteur RP : ${dependentError.message}`);

  const libraryArticleRows = (libraryLoad.result.data ?? []) as Row[];
  const alertArticleRows = (alertArticlesResult.data ?? []) as Row[];
  const actionArticleRows = (actionArticlesResult.data ?? []) as Row[];
  const allArticleRowsById = new Map<string, Row>();
  for (const row of [...libraryArticleRows, ...alertArticleRows, ...actionArticleRows]) {
    allArticleRowsById.set(String(row.id), row);
  }
  const allArticleIds = [...allArticleRowsById.keys()];
  const [articleCountriesResult, articleTagsResult] = await Promise.all([
    allArticleIds.length
      ? supabase
          .from("lore_article_countries")
          .select("*, country:countries(name)")
          .in("lore_article_id", allArticleIds)
      : emptyResult,
    allArticleIds.length
      ? supabase
          .from("lore_article_tags")
          .select("lore_article_id, tag:lore_tags(key)")
          .in("lore_article_id", allArticleIds)
      : emptyResult,
  ]);
  const relationError = articleCountriesResult.error ?? articleTagsResult.error;
  if (relationError) throw new Error(`Impossible de charger le classement des articles : ${relationError.message}`);

  const discordUserByCountry = new Map(
    ((countryPlayersResult.data ?? []) as Row[]).map((row) => [String(row.country_id), text(row, "discord_user_id")]),
  );
  const countries = ((countriesResult.data ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    discordRoleId: text(row, "discord_role_id"),
    discordUserId: discordUserByCountry.get(String(row.id)) ?? null,
  }));
  const countriesById = new Map(countries.map((country) => [country.id, country.name]));
  const staffRoleByUser = new Map(
    ((staffResult.data ?? []) as Row[]).map((row) => [String(row.user_id), text(row, "role")]),
  );

  const articleCountryLinks = new Map<string, Array<{ id: string; name: string; role: string }>>();
  for (const row of (articleCountriesResult.data ?? []) as Row[]) {
    const articleId = text(row, "article_id", "lore_article_id");
    if (!articleId) continue;
    const countryName = text(relation(row.country), "name") ?? countriesById.get(text(row, "country_id") ?? "");
    if (!countryName) continue;
    const countryId = text(row, "country_id");
    if (!countryId) continue;
    articleCountryLinks.set(articleId, [
      ...(articleCountryLinks.get(articleId) ?? []),
      { id: countryId, name: countryName, role: text(row, "relation_role") ?? "mentioned" },
    ]);
  }
  const articleTags = new Map<string, string[]>();
  for (const row of (articleTagsResult.data ?? []) as Row[]) {
    const articleId = text(row, "lore_article_id");
    const key = text(relation(row.tag), "key");
    if (articleId && key) articleTags.set(articleId, [...(articleTags.get(articleId) ?? []), key]);
  }

  const jobsByAction = new Map<string, RpPipelineJobView[]>();
  const rawJobs = (jobsResult.data ?? []) as Row[];
  for (const row of rawJobs) {
    const payload = object(row.payload);
    const actionId = text(row, "action_id", "ai_event_request_id") ?? text(payload, "action_id", "ai_event_request_id");
    if (!actionId) continue;
    const job: RpPipelineJobView = {
      id: String(row.id),
      jobType: text(row, "job_type", "type") ?? "pipeline",
      status: text(row, "status") ?? "pending",
      attempts: number(row, "attempts", "attempt_count") ?? 0,
      nextAttemptAt: text(row, "next_attempt_at"),
      error: text(row, "last_error", "error"),
      discordMessageId: text(row, "discord_message_id") ?? text(object(row.result), "discord_message_id"),
    };
    jobsByAction.set(actionId, [...(jobsByAction.get(actionId) ?? []), job]);
  }

  const toArticleView = (row: Row): LoreArticleView => {
    const id = String(row.id);
    const output = object(row.current_output);
    const cleaned = text(row, "clean_content", "cleaned_content", "description", "content") ?? text(output, "description") ?? "";
    const rpYear = number(row, "rp_year");
    const rpMonth = number(row, "rp_month");
    const rpDay = number(row, "rp_day");
    const rpDate = text(row, "rp_date_label", "rp_date") ??
      (rpYear && rpMonth ? `${rpDay ? `${rpDay} ` : ""}${rpMonth}/${rpYear}` : null);
    const classificationStatus = text(row, "classification_status");
    return {
      id,
      title: text(row, "title") ?? text(output, "title") ?? "Publication sans titre",
      excerpt: cleaned.slice(0, 500),
      authorLabel: text(row, "author_label", "discord_author_name", "author_name") ?? "Auteur non identifié",
      authority: text(row, "authority", "source_authority", "source_kind") ?? "joueur",
      countryLinks: articleCountryLinks.get(id) ?? [],
      tags: articleTags.get(id) ?? [],
      realDate: text(row, "real_published_at", "created_at") ?? new Date(0).toISOString(),
      rpDate,
      status: row.nsfw_quarantined === true
        ? "quarantined"
        : row.deleted_at
          ? "cancelled"
          : classificationStatus === "pending" || classificationStatus === "ambiguous"
            ? "ambiguous"
            : text(row, "editorial_status", "status") ?? classificationStatus ?? "published",
      discordMessageId: text(row, "discord_message_id"),
      narrativeCertified: Boolean(row.narrative_certified_at),
    };
  };
  const articleViewsById = new Map(
    [...allArticleRowsById.values()].map((row) => [String(row.id), toArticleView(row)]),
  );
  const articles = libraryArticleRows.flatMap((row) => {
    const article = articleViewsById.get(String(row.id));
    return article ? [article] : [];
  });
  const alertArticles = alertArticleRows.flatMap((row) => {
    const article = articleViewsById.get(String(row.id));
    return article ? [article] : [];
  });
  const articleRowsByAction = new Map<string, Row>();
  for (const row of actionArticleRows) {
    const actionId = text(row, "action_id", "ai_event_request_id");
    if (actionId && !articleRowsByAction.has(actionId)) articleRowsByAction.set(actionId, row);
  }

  const ledgerByAction = new Map<string, ReturnType<typeof ledgerEntries>>();
  for (const row of (ledgerResult.data ?? []) as Row[]) {
    const actionId = text(row, "action_id", "ai_event_request_id");
    if (actionId) ledgerByAction.set(actionId, [...(ledgerByAction.get(actionId) ?? []), ...ledgerEntries(row)]);
  }

  const sourcesByAction = new Map<string, string[]>();
  for (const row of (actionSourcesResult.data ?? []) as Row[]) {
    const actionId = text(row, "action_id", "ai_event_request_id");
    const articleId = text(row, "lore_article_id", "article_id");
    if (!actionId || !articleId) continue;
    sourcesByAction.set(actionId, [...(sourcesByAction.get(actionId) ?? []), articleId]);
  }

  const actions = actionRows.map<RpPipelineActionView>((row) => {
    const id = String(row.id);
    const payload = object(row.payload);
    const dice = object(row.dice_results);
    const successRoll = object(dice.success_roll);
    const article = articleRowsByAction.get(id) ?? {};
    const output = object(article.current_output ?? article.generated_output ?? article.output);
    const targetId = text(row, "target_country_id") ?? text(payload, "target_country_id");
    return {
      id,
      createdAt: text(row, "created_at") ?? new Date(0).toISOString(),
      countryId: text(row, "country_id") ?? "",
      targetCountryId: targetId,
      countryName: text(relation(row.country), "name") ?? countriesById.get(text(row, "country_id") ?? "") ?? "Pays inconnu",
      targetName: targetId ? countriesById.get(targetId) ?? "Pays inconnu" : null,
      actionLabel: text(relation(row.action_type), "label_fr") ?? "Action sans type",
      importance: text(row, "importance") ?? "minor",
      executionVersion: number(row, "execution_version") ?? 0,
      parentActionId: text(row, "parent_action_id"),
      decisionStatus: text(row, "decision_status", "status") ?? "pending",
      executionStatus: text(row, "execution_status") ?? (row.consequences_applied_at ? "applied" : "pending"),
      roll: number(row, "d100_roll", "roll") ?? number(successRoll, "total", "roll"),
      rollOutcome: text(row, "d100_outcome", "roll_outcome") ?? text(dice, "outcome"),
      selectionExplanation: text(row, "selection_explanation"),
      sourceIds: sourcesByAction.get(id) ?? textList(row.context_source_ids ?? article.source_ids),
      factSheet: readable(row.context_fact_sheet ?? row.fact_sheet) ?? readable(article.fact_sheet),
      articleTitle: text(article, "title") ?? text(output, "title"),
      articleDescription: text(article, "description", "clean_content") ?? text(output, "description"),
      articleSections: articleSections(article.sections ?? output.sections),
      articleId: text(article, "id"),
      articleStatus: text(article, "editorial_status", "status"),
      narrativeCertified: Boolean(article.narrative_certified_at),
      narrativeProvenance: Object.keys(object(article.narrative_provenance)).length
        ? readable(article.narrative_provenance)
        : null,
      discordMessageId: text(article, "discord_message_id"),
      adminEffects: normalizeAdminEffectsAdded(row.admin_effect_added),
      consequencesApplied: row.consequences_applied_at != null,
      ledger: ledgerByAction.get(id) ?? [],
      jobs: jobsByAction.get(id) ?? [],
    };
  });

  const alerts: PipelineAlertView[] = rawJobs
    .filter((row) => ["review", "warning"].includes(text(row, "status") ?? ""))
    .map((row) => ({
      id: String(row.id),
      kind: "job",
      title: text(row, "job_type", "type") === "publish_discord" ? "Publication Discord bloquée" : "Tâche du pipeline suspendue",
      detail: text(row, "last_error", "error") ?? "Une validation humaine est requise avant de poursuivre.",
      createdAt: text(row, "updated_at", "created_at") ?? new Date(0).toISOString(),
      jobId: String(row.id),
      reviewable: text(row, "status") === "review",
    }));
  for (const article of alertArticles.filter((article) => ["quarantined", "ambiguous"].includes(article.status))) {
    alerts.push({
      id: article.id,
      kind: "article",
      title: article.status === "quarantined" ? "Article en quarantaine" : "Pays auteur à confirmer",
      detail: article.title,
      createdAt: article.realDate,
      jobId: null,
      reviewable: true,
    });
  }
  for (const row of (discordChannelsResult.data ?? []) as Row[]) {
    const syncError = text(row, "sync_error");
    if (!syncError) continue;
    alerts.push({
      id: String(row.id),
      kind: "article",
      title: `Collecte Discord bloquée · ${text(row, "label") ?? "salon inconnu"}`,
      detail: syncError,
      createdAt: text(row, "last_sync_at", "updated_at", "created_at") ?? new Date(0).toISOString(),
      jobId: null,
      reviewable: false,
    });
  }
  const heartbeat = object(object(workerHeartbeatResult.data).value);
  const pipelineConfig = object(object(pipelineConfigResult.data).value);
  const activeJobs = rawJobs.filter((row) =>
    ["pending", "running", "retry"].includes(text(row, "status") ?? "")
  );
  const workerExpected = pipelineConfig.enabled === true ||
    activeJobs.length > 0 ||
    ((discordChannelsResult.data ?? []) as Row[]).some((row) =>
      row.ingest_enabled === true || row.publish_enabled === true
    );
  const lastSuccessAt = text(heartbeat, "last_success_at");
  const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : 0;
  const heartbeatStale = workerExpected &&
    (!Number.isFinite(lastSuccessMs) || Date.now() - lastSuccessMs > 3 * 60_000);
  if (heartbeatStale) {
    alerts.push({
      id: "worker-heartbeat",
      kind: "job",
      title: "Worker RP hors ligne",
      detail: lastSuccessAt
        ? `Aucun cycle terminé depuis ${new Date(lastSuccessAt).toLocaleString("fr-FR")}.`
        : "Aucun cycle du worker n’a encore été confirmé.",
      createdAt: lastSuccessAt ?? new Date(0).toISOString(),
      jobId: null,
      reviewable: false,
    });
  } else {
    const overdue = activeJobs.find((row) => {
      const status = text(row, "status");
      const reference = status === "running"
        ? text(row, "locked_at", "updated_at")
        : text(row, "next_attempt_at", "created_at");
      const timestamp = reference ? Date.parse(reference) : Number.NaN;
      return Number.isFinite(timestamp) && Date.now() - timestamp > 30 * 60_000;
    });
    if (overdue) {
      alerts.push({
        id: "worker-overdue",
        kind: "job",
        title: "File RP sans progression",
        detail: "Une tâche due attend depuis plus de 30 minutes malgré un worker actif.",
        createdAt: text(overdue, "updated_at", "created_at") ?? new Date(0).toISOString(),
        jobId: text(overdue, "id"),
        reviewable: false,
      });
    }
  }
  alerts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const routePriority: Record<string, number> = { country: 400, action_type: 300, continent: 200, default: 100 };
  const routes = ((discordChannelsResult.data ?? []) as Row[]).map<DiscordRouteView>((row) => ({
    id: String(row.id),
    priority: routePriority[text(row, "route_scope") ?? "default"] ?? 0,
    scope: text(row, "route_scope") ?? "défaut",
    label: text(row, "label") ?? "Tous les événements",
    destination: text(row, "channel_id") ?? "Salon non configuré",
    webhookSecretName: text(row, "webhook_secret_name") ?? "Secret manquant",
    ingestEnabled: row.ingest_enabled === true,
    publishEnabled: row.publish_enabled === true,
  }));
  routes.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label, "fr"));

  return {
    actions,
    articles,
    articleTotal: libraryLoad.total,
    libraryPage: libraryLoad.page,
    alerts,
    routes,
    countries,
    actionTypes: ((actionTypesResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      label: String(row.label_fr),
    })),
    automationConfigs: ((automationConfigsResult.data ?? []) as Row[]).map((row) => {
      const actionType = ((actionTypesResult.data ?? []) as Row[]).find(
        (type) => String(type.id) === String(row.action_type_id),
      );
      const actionTypeKey = String(actionType?.key ?? "");
      return {
      actionTypeId: String(row.action_type_id),
      actionLabel: String(actionType?.label_fr ?? "Action inconnue"),
      targetRequiredByMechanics: [
        "insulte_diplomatique",
        "escarmouche_militaire",
        "conflit_arme",
        "guerre_ouverte",
        "ouverture_diplomatique",
        "prise_influence",
        "espionnage",
      ].includes(actionTypeKey),
      enabledForMajor: row.enabled_for_major === true,
      enabledForMinor: row.enabled_for_minor === true,
      weight: number(row, "weight") ?? 1,
      requiresTarget: row.requires_target === true,
      preconditions: object(row.preconditions),
      cooldownHours: number(row, "cooldown_hours") ?? 24,
      rollMode: text(row, "roll_mode") ?? "auto",
      validationMode: text(row, "validation_mode") ?? "mj",
      publishFailures: row.publish_failures === true,
      articleProfile: text(row, "article_profile") ?? "standard",
      maxContextArticles: number(row, "max_context_articles") ?? 8,
      contextWindowRpMonths: number(row, "context_window_rp_months") ?? 12,
      discordDestination: text(row, "discord_destination") ?? "international",
      creativeLicense: text(row, "creative_license") === "controlled"
        ? "controlled"
        : "strict",
      narrativeGuidance: text(row, "narrative_guidance") ?? "",
      };
    }),
    continents: ((continentsResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      label: String(row.label_fr),
    })),
    rosterUnits: ((rosterUnitsResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      name_fr: String(row.name_fr),
      branch: text(row, "branch") ?? undefined,
      sub_type: text(row, "sub_type"),
    })),
    staffCandidates: ((countryPlayersResult.data ?? []) as Row[]).map((row) => ({
      userId: String(row.user_id),
      email: text(row, "email") ?? "Compte sans courriel",
      countryName: countriesById.get(String(row.country_id)) ?? "Pays inconnu",
      role: staffRoleByUser.get(String(row.user_id)) ?? null,
    })),
    pipelineEnabled: object(pipelineConfigResult.data?.value).enabled === true,
  };
}
