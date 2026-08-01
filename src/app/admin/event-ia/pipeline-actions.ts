"use server";

import { revalidatePath } from "next/cache";
import {
  collectFactualNumbers,
  countriesMentionedInFacts,
  parseAndValidateMagnumOutput,
} from "@/lib/rpPipeline";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ArticleProfile } from "@/types/rpPipeline";

const pagePath = "/admin/event-ia";

async function getAuthorizedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Vous devez être connecté.");

  const [{ data: admin }, { data: staff }] = await Promise.all([
    supabase.from("admins").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("rp_staff").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!admin && !staff) throw new Error("Cette action est réservée aux admins et aux MJ.");
  return { supabase, user, isAdmin: Boolean(admin) };
}

function requiredText(formData: FormData, key: string, maxLength = 500) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Le champ « ${key} » est requis.`);
  return value.slice(0, maxLength);
}

function parseEffects(formData: FormData) {
  const raw = String(formData.get("effects_json") ?? "[]");
  if (raw.length > 50_000) throw new Error("La liste des conséquences est trop volumineuse.");
  let effects: unknown;
  try {
    effects = JSON.parse(raw);
  } catch {
    throw new Error("La liste des conséquences est invalide.");
  }
  if (!Array.isArray(effects) || effects.length > 16 || effects.some((effect) =>
    !effect || typeof effect !== "object" || Array.isArray(effect)
  )) {
    throw new Error("La liste des conséquences est invalide.");
  }
  return effects;
}

function parsePublicFacts(formData: FormData) {
  const facts = String(formData.get("public_facts") ?? "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean);
  if (facts.length < 2 || facts.length > 8 || facts.some((text) => text.length > 500)) {
    throw new Error("Saisissez entre deux et huit faits publics, un par ligne.");
  }
  return facts.map((text, index) => ({ id: `f${index + 1}`, text, origin: "mj" }));
}

function parseFactBlueprints(formData: FormData) {
  const blueprints = String(formData.get("fact_blueprints") ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("|").map((fact) => fact.trim()).filter(Boolean))
    .filter((facts) => facts.length > 0);
  if (
    blueprints.length < 1 || blueprints.length > 12 ||
    blueprints.some((facts) =>
      facts.length < 2 || facts.length > 6 || facts.some((fact) => fact.length > 500)
    )
  ) {
    throw new Error("Ajoutez 1 à 12 scènes de 2 à 6 faits, séparés par |.");
  }
  return blueprints;
}

export async function createManualRpAction(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const countryId = requiredText(formData, "country_id", 64);
  const actionTypeId = requiredText(formData, "action_type_id", 64);
  const targetCountryId = String(formData.get("target_country_id") ?? "").trim() || null;
  const importance = formData.get("importance") === "major" ? "major" : "minor";
  const intent = requiredText(formData, "intent");
  const stakes = String(formData.get("stakes") ?? "").trim().slice(0, 1000);
  const notes = String(formData.get("mj_notes") ?? "").trim().slice(0, 1000);
  const parentActionId = String(formData.get("parent_action_id") ?? "").trim() || null;

  const { error } = await supabase.rpc("create_manual_rp_action", {
    p_country_id: countryId,
    p_action_type_id: actionTypeId,
    p_target_country_id: targetCountryId,
    p_importance: importance,
    p_intent: intent,
    p_stakes: stakes || null,
    p_mj_notes: notes || null,
    p_parent_action_id: parentActionId,
    p_effects: parseEffects(formData),
    p_public_facts: parsePublicFacts(formData),
  });
  if (error) throw new Error(`Impossible de créer l’action : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveActionPublicFacts(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const { error } = await supabase.rpc("set_rp_action_public_facts", {
    p_action_id: actionId,
    p_public_facts: parsePublicFacts(formData),
  });
  if (error) throw new Error(`Impossible d’enregistrer les faits publics : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveActionEffects(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const { error } = await supabase.rpc("set_rp_action_effects", {
    p_action_id: actionId,
    p_effects: parseEffects(formData),
  });
  if (error) throw new Error(`Impossible d’enregistrer les conséquences : ${error.message}`);
  revalidatePath(pagePath);
}

export async function retryPipelineJob(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const jobId = requiredText(formData, "job_id", 64);
  const { error } = await supabase.rpc("retry_rp_pipeline_job", { p_job_id: jobId });
  if (error) throw new Error(`Impossible de relancer la tâche : ${error.message}`);
  revalidatePath(pagePath);
}

export async function queueNarrativeRepair(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const { error } = await supabase.rpc("enqueue_rp_narrative_repair", {
    p_action_id: actionId,
  });
  if (error) throw new Error(`Impossible de régénérer la narration : ${error.message}`);
  revalidatePath(pagePath);
}

export async function decideRpAction(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const decision = formData.get("decision") === "approved" ? "approved" : "rejected";
  const { error } = await supabase.rpc("decide_rp_action", {
    p_action_id: actionId,
    p_decision: decision,
  });
  if (error) throw new Error(`Impossible d’enregistrer la décision : ${error.message}`);
  revalidatePath(pagePath);
}

export async function changeActionRoll(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const roll = Number(formData.get("roll"));
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) {
    throw new Error("Le jet doit être un nombre entier entre 1 et 100.");
  }
  const expectedVersion = Number(formData.get("expected_version"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("Version de l’action invalide.");
  }
  const { error } = await supabase.rpc("request_ai_action_roll_change", {
    p_action_id: actionId,
    p_expected_version: expectedVersion,
    p_new_roll: roll,
  });
  if (error) throw new Error(`Impossible de préparer le nouveau jet : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveArticleReview(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const articleId = requiredText(formData, "article_id", 64);
  const title = requiredText(formData, "title", 180);
  const description = requiredText(formData, "description", 3500);
  if (description.length < 100) throw new Error("L’article doit contenir au moins 100 caractères.");
  const sectionTitles = formData.getAll("section_title").map((value) => String(value).trim());
  const sectionBodies = formData.getAll("section_body").map((value) => String(value).trim());
  if (sectionTitles.length !== sectionBodies.length || sectionTitles.length > 25) {
    throw new Error("Les sections de l’article sont invalides.");
  }
  const sections = sectionTitles.map((sectionTitle, index) => ({
    title: sectionTitle,
    body: sectionBodies[index],
  }));
  if (sections.some((section) => !section.title || !section.body)) {
    throw new Error("Chaque section doit avoir un titre et un contenu.");
  }

  const { data: article, error: articleError } = await supabase
    .from("lore_articles")
    .select("action_id, source_ids, current_version")
    .eq("id", articleId)
    .single();
  if (articleError || !article?.action_id) {
    throw new Error("L’article ou son action est introuvable.");
  }
  const sourceIds = Array.isArray(article.source_ids) ? article.source_ids : [];
  const [{ data: action, error: actionError }, { data: countries, error: countriesError }, sourcesResult] =
    await Promise.all([
      supabase
        .from("ai_event_requests")
        .select(
          "article_profile, context_fact_sheet, execution_version, pending_execution_version, consequences_applied_at, updated_at",
        )
        .eq("id", article.action_id)
        .single(),
      supabase.from("countries").select("id, name").order("id"),
      sourceIds.length
        ? supabase
            .from("lore_articles")
            .select("id, title, clean_content, sections, current_version")
            .in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (actionError || countriesError || sourcesResult.error || !action) {
    throw new Error(
      `Contrôle factuel impossible : ${
        actionError?.message ?? countriesError?.message ?? sourcesResult.error?.message ?? "données absentes"
      }`,
    );
  }
  const knownCountries = (countries ?? []).map(({ name }) => name).filter(Boolean);
  const facts = {
    fiche_factuelle: action.context_fact_sheet,
    sources: sourcesResult.data ?? [],
  };
  const profile = (["brief", "standard", "dossier"].includes(action.article_profile)
    ? action.article_profile
    : "standard") as ArticleProfile;
  const validation = parseAndValidateMagnumOutput(
    JSON.stringify({ title, description, sections }),
    {
      profile,
      allowedCountries: countriesMentionedInFacts(facts, knownCountries),
      knownCountries,
      allowedNumbers: [...collectFactualNumbers(facts)],
    },
  );
  if (validation.errors.length) {
    throw new Error(`Article non validable : ${validation.errors.join(" ")}`);
  }

  const serviceSupabase = createServiceRoleClient();
  const actionExecutionVersion = action.pending_execution_version ??
    (action.consequences_applied_at ? Math.max(action.execution_version, 1) : action.execution_version + 1);
  const { error } = await serviceSupabase.rpc("review_lore_article", {
    p_article_id: articleId,
    p_title: title,
    p_description: description,
    p_sections: sections,
    p_expected_state: {
      article_version: article.current_version,
      action_execution_version: actionExecutionVersion,
      action_updated_at: action.updated_at,
      source_versions: (sourcesResult.data ?? [])
        .map(({ id, current_version }) => ({ id, current_version }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      countries: (countries ?? []).map(({ id, name }) => ({ id, name })),
    },
  });
  if (error) throw new Error(`Impossible de valider l’article : ${error.message}`);
  const certifiedAt = new Date().toISOString();
  const { error: certificationError } = await serviceSupabase
    .from("lore_articles")
    .update({
      narrative_certified_at: certifiedAt,
      narrative_provenance: {
        certified: true,
        method: "manual_review",
        certified_at: certifiedAt,
        source_ids: sourceIds,
      },
    })
    .eq("id", articleId);
  if (certificationError) {
    throw new Error(`Article validé mais certification narrative impossible : ${certificationError.message}`);
  }
  revalidatePath(pagePath);
}

export async function queueDiscordSync() {
  const { supabase } = await getAuthorizedClient();
  const { error } = await supabase.rpc("enqueue_manual_discord_sync");
  if (error) throw new Error(`Impossible de programmer la synchronisation : ${error.message}`);
  revalidatePath(pagePath);
}

export async function updateDiscordRoute(formData: FormData) {
  const { supabase, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut modifier le routage.");
  const routeId = requiredText(formData, "route_id", 64);
  const { error } = await supabase
    .from("discord_rp_channels")
    .update({
      ingest_enabled: formData.get("ingest_enabled") === "on",
      publish_enabled: formData.get("publish_enabled") === "on",
    })
    .eq("id", routeId);
  if (error) throw new Error(`Impossible de modifier la route : ${error.message}`);
  revalidatePath(pagePath);
}

export async function queueDiscordDelivery(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const actionId = requiredText(formData, "action_id", 64);
  const articleId = requiredText(formData, "article_id", 64);
  const operation = formData.get("operation") === "delete" ? "delete" : "resend";
  const { error } = await supabase.rpc("enqueue_manual_discord_delivery", {
    p_action_id: actionId,
    p_article_id: articleId,
    p_operation: operation,
  });
  if (error) throw new Error(`Impossible de programmer l’opération Discord : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveDiscordRoute(formData: FormData) {
  const { supabase, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut modifier le routage.");
  const scopeType = requiredText(formData, "scope_type", 32);
  const scopeValue = String(formData.get("scope_value") ?? "").trim() || null;
  const channelId = requiredText(formData, "discord_channel_id", 32);
  const guildId = requiredText(formData, "discord_guild_id", 32);
  const label = requiredText(formData, "label", 100);
  const webhookSecretName = String(formData.get("webhook_secret_name") ?? "").trim() || null;
  const ingestEnabled = formData.get("ingest_enabled") === "on";
  const publishEnabled = formData.get("publish_enabled") === "on";
  if (!["country", "action_type", "continent", "default"].includes(scopeType)) {
    throw new Error("Portée Discord invalide.");
  }
  if (!ingestEnabled && !publishEnabled) throw new Error("Activez la lecture ou la publication.");
  if (!/^\d{15,25}$/.test(channelId) || !/^\d{15,25}$/.test(guildId)) {
    throw new Error("Identifiant Discord invalide.");
  }
  if (publishEnabled && !webhookSecretName) throw new Error("Le secret webhook est requis pour publier.");
  if (webhookSecretName && !/^[A-Z][A-Z0-9_]*$/.test(webhookSecretName)) {
    throw new Error("Nom de secret invalide.");
  }

  const route = {
    label,
    guild_id: guildId,
    channel_id: channelId,
    is_public: true,
    ingest_enabled: ingestEnabled,
    publish_enabled: publishEnabled,
    route_scope: scopeType,
    channel_kind: formData.get("channel_kind") === "national" ? "national" : "international",
    source_authority: formData.get("source_authority") === "official" ? "official" : "player",
    country_id: scopeType === "country" ? scopeValue : null,
    action_type_id: scopeType === "action_type" ? scopeValue : null,
    continent_id: scopeType === "continent" ? scopeValue : null,
    webhook_secret_name: webhookSecretName,
  };
  const { error } = await supabase.from("discord_rp_channels").insert(route);
  if (error) throw new Error(`Impossible d’enregistrer la route : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveActionAutomationConfig(formData: FormData) {
  const { supabase, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut modifier les règles d’automatisation.");
  const actionTypeId = requiredText(formData, "action_type_id", 64);
  const number = (key: string, min: number, max: number) => {
    const value = Number(formData.get(key));
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Valeur invalide pour « ${key} ».`);
    }
    return value;
  };
  const optionalNumber = (key: string, min: number, max: number) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Valeur invalide pour « ${key} ».`);
    }
    return value;
  };
  const preconditions: Record<string, number | boolean> = Object.fromEntries(
    [
      ["emitter_min_stability", optionalNumber("emitter_min_stability", -3, 3)],
      ["emitter_max_stability", optionalNumber("emitter_max_stability", -3, 3)],
      ["target_min_stability", optionalNumber("target_min_stability", -3, 3)],
      ["target_max_stability", optionalNumber("target_max_stability", -3, 3)],
      ["emitter_min_militarism", optionalNumber("emitter_min_militarism", 0, 10)],
      ["emitter_max_militarism", optionalNumber("emitter_max_militarism", 0, 10)],
      ["target_min_militarism", optionalNumber("target_min_militarism", 0, 10)],
      ["target_max_militarism", optionalNumber("target_max_militarism", 0, 10)],
      ["min_relation", optionalNumber("min_relation", -100, 100)],
      ["max_relation", optionalNumber("max_relation", -100, 100)],
    ].filter((entry): entry is [string, number] => entry[1] !== undefined),
  );
  const continentRule = String(formData.get("continent_rule") ?? "any");
  if (continentRule === "same") preconditions.same_continent = true;
  if (continentRule === "different") preconditions.different_continent = true;
  const narrativeGuidance = String(formData.get("narrative_guidance") ?? "").trim();
  if (narrativeGuidance.length > 1000) {
    throw new Error("La consigne narrative ne peut pas dépasser 1 000 caractères.");
  }

  const { error } = await supabase
    .from("action_automation_configs")
    .update({
      enabled_for_major: formData.get("enabled_for_major") === "on",
      enabled_for_minor: formData.get("enabled_for_minor") === "on",
      weight: number("weight", 0.01, 1000),
      requires_target: formData.get("requires_target") === "on",
      cooldown_hours: number("cooldown_hours", 0, 87600),
      roll_mode: formData.get("roll_mode") === "mj" ? "mj" : "auto",
      validation_mode: formData.get("validation_mode") === "auto" ? "auto" : "mj",
      publish_failures: formData.get("publish_failures") === "on",
      article_profile: ["brief", "dossier"].includes(String(formData.get("article_profile")))
        ? String(formData.get("article_profile"))
        : "standard",
      max_context_articles: number("max_context_articles", 1, 8),
      context_window_rp_months: number("context_window_rp_months", 1, 120),
      discord_destination: formData.get("discord_destination") === "national" ? "national" : "international",
      creative_license: formData.get("creative_license") === "controlled"
        ? "controlled"
        : "strict",
      narrative_guidance: narrativeGuidance,
      fact_blueprints: parseFactBlueprints(formData),
      preconditions,
    })
    .eq("action_type_id", actionTypeId);
  if (error) throw new Error(`Impossible d’enregistrer le réglage : ${error.message}`);
  revalidatePath(pagePath);
}

export async function classifyLoreArticle(formData: FormData) {
  const { supabase } = await getAuthorizedClient();
  const articleId = requiredText(formData, "article_id", 64);
  const sourceKind = String(formData.get("source_kind") ?? "");
  if (!["mj", "official", "player"].includes(sourceKind)) throw new Error("Autorité invalide.");
  const authorCountryId = String(formData.get("author_country_id") ?? "").trim() || null;
  const targetCountryId = String(formData.get("target_country_id") ?? "").trim() || null;
  const mentionedCountryIds = formData
    .getAll("mentioned_country_ids")
    .map(String)
    .filter(Boolean)
    .slice(0, 50);
  const tagKeys = formData.getAll("tag_keys").map(String).filter(Boolean).slice(0, 20);
  const { error } = await supabase.rpc("classify_lore_article", {
    p_article_id: articleId,
    p_source_kind: sourceKind,
    p_author_country_id: authorCountryId,
    p_target_country_id: targetCountryId,
    p_mentioned_country_ids: mentionedCountryIds,
    p_tag_keys: tagKeys,
  });
  if (error) throw new Error(`Impossible de classer l’article : ${error.message}`);
  revalidatePath(pagePath);
}

export async function saveCountryDiscordMapping(formData: FormData) {
  const { supabase, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut modifier les identités Discord.");
  const countryId = requiredText(formData, "country_id", 64);
  const roleId = String(formData.get("discord_role_id") ?? "").trim() || null;
  const userId = String(formData.get("discord_user_id") ?? "").trim() || null;
  for (const [label, value] of [["rôle", roleId], ["utilisateur", userId]] as const) {
    if (value && !/^\d{15,25}$/.test(value)) throw new Error(`Identifiant Discord ${label} invalide.`);
  }
  const [{ error: countryError }, { error: playerError }] = await Promise.all([
    supabase.from("countries").update({ discord_role_id: roleId }).eq("id", countryId),
    supabase.from("country_players").update({ discord_user_id: userId }).eq("country_id", countryId),
  ]);
  if (countryError || playerError) {
    throw new Error(`Impossible d’enregistrer l’identité Discord : ${countryError?.message ?? playerError?.message}`);
  }
  revalidatePath(pagePath);
}

export async function setRpStaffAccess(formData: FormData) {
  const { supabase, user, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut modifier l’équipe RP.");
  const staffUserId = requiredText(formData, "user_id", 64);
  const enabled = formData.get("enabled") === "on";
  const result = enabled
    ? await supabase.from("rp_staff").upsert({
        user_id: staffUserId,
        role: "mj",
        created_by: user.id,
      })
    : await supabase.from("rp_staff").delete().eq("user_id", staffUserId).eq("role", "mj");
  if (result.error) throw new Error(`Impossible de modifier l’équipe RP : ${result.error.message}`);
  revalidatePath(pagePath);
}

export async function setRpPipelineEnabled(formData: FormData) {
  const { supabase, isAdmin } = await getAuthorizedClient();
  if (!isAdmin) throw new Error("Seul un administrateur peut activer le moteur.");
  const { error } = await supabase.rpc("set_rp_pipeline_enabled", {
    p_enabled: formData.get("enabled") === "true",
  });
  if (error) throw new Error(`Impossible de modifier l’état du moteur : ${error.message}`);
  revalidatePath(pagePath);
}
