"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptAiEvent,
  refuseAiEvent,
  createAiEvent,
  rollD100ForAiEvent,
  simulateAiEventsCron,
  processDueAiEvents,
  clearAiEvents,
} from "@/app/admin/event-ia/actions";
import { ACTION_KEYS_REQUIRING_IMPACT_ROLL } from "@/lib/actionKeys";
import { getDefaultImpactMaximum, getStateActionImpactPreviewLabel } from "@/lib/actionKeys";
import { normalizeAdminEffectsAdded, formatAdminEffectLabel } from "@/lib/countryEffects";
import { normalizePair } from "@/lib/relations";
import { getRelationLabel, getRelationColor } from "@/lib/relationScale";

type DiceRollResultRow = {
  roll: number;
  modifier: number;
  total: number;
  stat_modifiers?: Record<string, number>;
  admin_modifier?: number;
  relation_modifier?: number;
  influence_modifier?: number;
};

type DiceResultsRow = {
  success_roll?: DiceRollResultRow;
  impact_roll?: DiceRollResultRow;
  admin_modifiers?: Array<{ label: string; value: number }>;
};

function getRollConclusion(roll: number, total: number): string {
  if (roll === 1) return "ÉCHEC CRITIQUE";
  if (roll === 100) return "SUCCÈS CRITIQUE";
  if (total <= 24) return "ÉCHEC MAJEUR";
  if (total <= 49) return "ÉCHEC MINEUR";
  if (total <= 74) return "SUCCÈS MINEUR";
  return "SUCCÈS MAJEUR";
}

function formatRollFormula(rollResult: DiceRollResultRow, adminLabel?: string): string {
  const parts: string[] = [];
  if (rollResult.stat_modifiers && Object.keys(rollResult.stat_modifiers).length > 0) {
    for (const [key, value] of Object.entries(rollResult.stat_modifiers)) {
      parts.push(`${value >= 0 ? "+" : ""}${value} (${key})`);
    }
  } else if (rollResult.modifier !== 0) {
    parts.push(`${rollResult.modifier >= 0 ? "+" : ""}${rollResult.modifier} (Mod.)`);
  }
  if (rollResult.admin_modifier != null && rollResult.admin_modifier !== 0) {
    parts.push(`${rollResult.admin_modifier >= 0 ? "+" : ""}${rollResult.admin_modifier} (${adminLabel?.trim() || "Ponctuel"})`);
  }
  if (rollResult.relation_modifier != null && rollResult.relation_modifier !== 0) {
    parts.push(`${rollResult.relation_modifier >= 0 ? "+" : ""}${rollResult.relation_modifier} (Relations)`);
  }
  if (rollResult.influence_modifier != null && rollResult.influence_modifier !== 0) {
    parts.push(`${rollResult.influence_modifier >= 0 ? "+" : ""}${rollResult.influence_modifier} (Influence)`);
  }
  parts.push(`${rollResult.roll >= 0 ? "+" : ""}${rollResult.roll} (Jet)`);
  return parts.join(" ");
}

export type AiEventRow = {
  id: string;
  country_id: string;
  action_type_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  admin_effect_added: Record<string, unknown> | null;
  dice_results?: DiceResultsRow | null;
  refusal_message: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  scheduled_trigger_at: string | null;
  consequences_applied_at: string | null;
  source: string | null;
  country?: { id: string; name: string; slug: string; flag_url: string | null; regime: string | null } | null;
  state_action_types?: { key: string; label_fr: string; params_schema?: Record<string, unknown> | null } | null;
};

function getRelationFromMap(record: Record<string, number>, countryIdA: string, countryIdB: string): number {
  if (countryIdA === countryIdB) return 0;
  const [a, b] = normalizePair(countryIdA, countryIdB);
  return record[`${a}|${b}`] ?? 0;
}

type Props = {
  events: AiEventRow[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  actionTypesForAi: { id: string; key: string; label_fr: string }[];
  aiCountries: { id: string; name: string; flag_url: string | null; ai_status: string | null }[];
  allCountries: { id: string; name: string }[];
  relationMap?: Record<string, number>;
  /** Config events IA (règles) pour affichage diagnostic. */
  aiEventsConfig?: Record<string, unknown> | null;
  /** Dernier passage du cron (valeur brute). */
  aiEventsLastRun?: string | null;
  /** Diagnostic pg_cron (RPC get_ai_events_cron_diagnostic). */
  cronDiagnostic?: Record<string, unknown> | null;
  /** Erreur lors de l'appel diagnostic. */
  cronDiagnosticError?: string | null;
};

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };
const EVENTS_PER_PAGE = 10;

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStatusLabel(status: string): string {
  if (status === "pending") return "en attente";
  if (status === "accepted") return "accepte";
  if (status === "refused") return "refuse";
  return status;
}

export function EventIaList({
  events,
  targetCountriesById = {},
  actionTypesForAi,
  aiCountries,
  allCountries,
  relationMap = {},
  aiEventsConfig = null,
  aiEventsLastRun = null,
  cronDiagnostic = null,
  cronDiagnosticError = null,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTypeId, setCreateTypeId] = useState<string>(actionTypesForAi[0]?.id ?? "");
  const [createEmitterId, setCreateEmitterId] = useState<string>(aiCountries[0]?.id ?? "");
  const [createTargetId, setCreateTargetId] = useState<string>(allCountries[0]?.id ?? "");
  const [createLoading, setCreateLoading] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [processDueLoading, setProcessDueLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const statusA = a.status === "pending" ? 0 : 1;
      const statusB = b.status === "pending" ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [events]);

  const filteredEvents = useMemo(() => {
    const tokens = normalizeSearchValue(searchQuery).split(" ").filter(Boolean);
    if (tokens.length === 0) return sortedEvents;

    return sortedEvents.filter((event) => {
      const targetId = typeof event.payload?.target_country_id === "string" ? event.payload.target_country_id : null;
      const targetCountry = targetId ? targetCountriesById[targetId] : null;
      const haystack = normalizeSearchValue([
        event.state_action_types?.label_fr ?? "",
        event.state_action_types?.key ?? "",
        event.country?.name ?? "",
        targetCountry?.name ?? "",
        event.refusal_message ?? "",
        event.source === "cron" ? "cron" : event.source === "manual" ? "manuel" : "",
        getStatusLabel(event.status),
      ].join(" "));

      return tokens.every((token) => haystack.includes(token));
    });
  }, [searchQuery, sortedEvents, targetCountriesById]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedId && !filteredEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredEvents, selectedId]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * EVENTS_PER_PAGE;
    return filteredEvents.slice(start, start + EVENTS_PER_PAGE);
  }, [currentPage, filteredEvents]);

  const selected = filteredEvents.find((e) => e.id === selectedId) ?? sortedEvents.find((e) => e.id === selectedId);

  function handleSuccess() {
    setError(null);
    setSelectedId(null);
    router.refresh();
  }

  function handleRefresh() {
    setError(null);
    router.refresh();
  }

  async function handleCreate() {
    if (!createEmitterId || !createTargetId || !createTypeId) {
      setError("Veuillez sélectionner type, émetteur et cible.");
      return;
    }
    if (createTargetId === createEmitterId) {
      setError("La cible ne doit pas être l'émetteur.");
      return;
    }
    setCreateLoading(true);
    setError(null);
    const res = await createAiEvent({
      actionTypeId: createTypeId,
      countryId: createEmitterId,
      targetCountryId: createTargetId,
    });
    setCreateLoading(false);
    if (res.error) setError(res.error);
    else {
      setShowCreateModal(false);
      router.refresh();
    }
  }

  async function handleSimulateCron() {
    setSimulateLoading(true);
    setError(null);
    const res = await simulateAiEventsCron();
    setSimulateLoading(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function handleProcessDue() {
    setProcessDueLoading(true);
    setError(null);
    const res = await processDueAiEvents();
    setProcessDueLoading(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function handleClearAll() {
    if (!confirm("Vider complètement la liste d'événements IA ?")) return;
    setClearLoading(true);
    setError(null);
    const res = await clearAiEvents();
    setClearLoading(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      {selected && (
        <EventDetail
          event={selected}
          targetCountriesById={targetCountriesById}
          countriesList={allCountries}
          relationMap={relationMap}
          onClose={() => setSelectedId(null)}
          onSuccess={handleSuccess}
          onRefresh={handleRefresh}
          onError={setError}
        />
      )}

      <section className={panelClass} style={panelStyle}>
        <div className="mb-4 flex flex-col gap-3">
          {(aiEventsConfig != null || aiEventsLastRun != null) && (
            <div
              className="rounded border py-2 px-3 text-sm"
              style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}
              title="Pour modifier : Admin Règles > Events IA"
            >
              <span className="font-medium text-[var(--foreground-muted)]">Diagnostic cron : </span>
              <span className="text-[var(--foreground)]">
                Dernier run : {aiEventsLastRun ? new Date(aiEventsLastRun).toLocaleString("fr-FR") : "jamais"}
                {" · "}
                Par run : {typeof aiEventsConfig?.count_major_per_run === "number" ? aiEventsConfig.count_major_per_run : 0} majeurs, {typeof aiEventsConfig?.count_minor_per_run === "number" ? aiEventsConfig.count_minor_per_run : 0} mineurs
                {" · "}
                Actions autorisées : {Array.isArray(aiEventsConfig?.allowed_action_type_keys_major) ? aiEventsConfig.allowed_action_type_keys_major.length : 0} majeures, {Array.isArray(aiEventsConfig?.allowed_action_type_keys_minor) ? aiEventsConfig.allowed_action_type_keys_minor.length : 0} mineures
              </span>
              {(typeof aiEventsConfig?.count_major_per_run !== "number" || aiEventsConfig?.count_major_per_run === 0) &&
                (typeof aiEventsConfig?.count_minor_per_run !== "number" || aiEventsConfig?.count_minor_per_run === 0) && (
                  <span className="mt-1 block text-[var(--danger)]">
                    Aucun event généré : activez au moins un quota (majeurs ou mineurs) dans Règles &gt; Events IA.
                  </span>
                )}
              <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                Le cron <strong>automatique</strong> est exécuté par Supabase (pg_cron), pas par cette app. Si la date « Dernier run » ne se met pas à jour toute seule, vérifier dans le projet Supabase : Extensions → activer <code>pg_cron</code> ; SQL Editor → voir <code>supabase/CRON.md</code> pour les requêtes (jobs <code>ai-events-generation</code> et <code>cron.job_run_details</code>).
              </p>
              {cronDiagnosticError && (
                <p className="mt-2 text-xs text-[var(--danger)]">
                  Diagnostic pg_cron : {cronDiagnosticError}
                </p>
              )}
              {cronDiagnostic && !cronDiagnosticError && (
                <div className="mt-3 rounded border py-2 px-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                  <span className="font-medium text-[var(--foreground-muted)]">Diagnostic pg_cron : </span>
                  <span className="text-[var(--foreground)]">
                    {cronDiagnostic.pg_cron_enabled === false ? (
                      <>Extension non activée. {typeof cronDiagnostic.hint === "string" ? cronDiagnostic.hint : ""}</>
                    ) : (
                      <>
                        Job présent : {cronDiagnostic.job_exists ? "oui" : "non"}
                        {cronDiagnostic.job_schedule != null && ` · Schedule : ${String(cronDiagnostic.job_schedule)}`}
                        {" · "}
                        Exécutions enregistrées : {Array.isArray(cronDiagnostic.recent_runs) ? cronDiagnostic.recent_runs.length : 0}
                        {Array.isArray(cronDiagnostic.recent_runs) && cronDiagnostic.recent_runs.length > 0 && (
                          <> (dernière : {String((cronDiagnostic.recent_runs[0] as { start_time?: string })?.start_time ?? "—")})</>
                        )}
                      </>
                    )}
                  </span>
                  {Array.isArray(cronDiagnostic.recent_runs) && cronDiagnostic.recent_runs.length > 0 && (() => {
                    const last = cronDiagnostic.recent_runs[0] as { status?: string; return_message?: string };
                    return (
                      <p className="mt-1 text-[var(--foreground)]">
                        Dernière exécution pg_cron : status = <strong>{last?.status ?? "—"}</strong>
                        {last?.return_message != null && last.return_message !== "" && (
                          <> · return_message = <span className="text-[var(--danger)]">{String(last.return_message)}</span></>
                        )}
                      </p>
                    );
                  })()}
                  {cronDiagnostic.error != null && (
                    <p className="mt-1 text-[var(--danger)]">{String(cronDiagnostic.error)}</p>
                  )}
                  {cronDiagnostic.last_check != null && typeof cronDiagnostic.last_check === "object" && (
                    <div className="mt-2 rounded border py-1.5 px-2" style={{ borderColor: "var(--border-muted)", background: "var(--background)" }}>
                      <span className="font-medium text-[var(--foreground-muted)]">Dernier passage fonction : </span>
                      <span className="text-[var(--foreground)]">
                        {(cronDiagnostic.last_check as { at?: string }).at
                          ? new Date((cronDiagnostic.last_check as { at: string }).at).toLocaleString("fr-FR")
                          : "—"}
                        {" · "}
                        would_skip = {(cronDiagnostic.last_check as { would_skip?: boolean }).would_skip === true ? "oui" : "non"}
                        {(cronDiagnostic.last_check as { reason?: string }).reason != null && ` · raison: ${String((cronDiagnostic.last_check as { reason: string }).reason)}`}
                        {(cronDiagnostic.last_check as { diff_seconds?: number }).diff_seconds != null && ` · diff_seconds = ${Number((cronDiagnostic.last_check as { diff_seconds: number }).diff_seconds)}`}
                        {(cronDiagnostic.last_check as { interval_hours?: number }).interval_hours != null && ` · interval_hours = ${Number((cronDiagnostic.last_check as { interval_hours: number }).interval_hours)}`}
                        {(cronDiagnostic.last_check as { last_run_raw?: string }).last_run_raw != null && ` · last_run_raw = ${String((cronDiagnostic.last_check as { last_run_raw: string }).last_run_raw)}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Événements IA
              </h2>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                Les événements en attente restent toujours en tête. Affichage par pages de 10.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSimulateCron}
                disabled={simulateLoading}
                className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                {simulateLoading ? "Passage en cours…" : "Simuler passage IA"}
              </button>
              <button
                type="button"
                onClick={handleProcessDue}
                disabled={processDueLoading}
                className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                {processDueLoading ? "Traitement…" : "Traiter les events IA dus"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-[var(--background)]"
                style={{ borderColor: "var(--border)" }}
              >
                Générer un event IA
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearLoading || events.length === 0}
                className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[var(--background)] disabled:opacity-50"
                style={{ borderColor: "var(--border-muted)" }}
              >
                {clearLoading ? "Vidage…" : "Vider la liste"}
              </button>
            </div>
          </div>
          <div className="w-full max-w-xl">
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Recherche dynamique</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: Guerre Russie"
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--foreground-muted)]">
          <span>{filteredEvents.length} événement(s) trouvé(s)</span>
          <span>Page {currentPage} / {totalPages}</span>
        </div>
        {error && (
          <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderColor: "var(--border)" }}>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Date</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Type</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Émetteur (IA)</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Cible</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Statut</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Déclenchement prévu</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Origine</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.map((r) => {
                const targetId = typeof r.payload?.target_country_id === "string" ? r.payload.target_country_id : null;
                const targetCountry = targetId ? targetCountriesById[targetId] : null;
                const isSelected = selectedId === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--background)]"
                    style={{
                      borderColor: "var(--border)",
                      background: isSelected ? "var(--background-elevated)" : undefined,
                    }}
                  >
                    <td className="border-b p-2 text-[var(--foreground)]">
                      {new Date(r.created_at).toLocaleString("fr-FR")}
                    </td>
                    <td className="border-b p-2 text-[var(--foreground)]">
                      {r.state_action_types?.label_fr ?? r.action_type_id}
                    </td>
                    <td className="border-b p-2 text-[var(--foreground)]">
                      <span title={r.country?.name ?? r.country_id} className="inline-flex items-center gap-1.5">
                        {r.country?.flag_url ? (
                          <img
                            src={r.country.flag_url}
                            alt=""
                            className="h-6 w-9 rounded object-cover shrink-0"
                            title={r.country.name}
                          />
                        ) : (
                          <span className="text-[var(--foreground-muted)]">{r.country?.name ?? r.country_id}</span>
                        )}
                        {r.country?.flag_url && <span className="sr-only">{r.country.name}</span>}
                      </span>
                    </td>
                    <td className="border-b p-2 text-[var(--foreground)]">
                      {targetCountry ? (
                        targetCountry.flag_url ? (
                          <span title={targetCountry.name} className="inline-flex">
                            <img
                              src={targetCountry.flag_url}
                              alt=""
                              className="h-6 w-9 rounded object-cover shrink-0"
                              title={targetCountry.name}
                            />
                            <span className="sr-only">{targetCountry.name}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--foreground-muted)]">{targetCountry.name}</span>
                        )
                      ) : (
                        <span className="text-[var(--foreground-muted)]">—</span>
                      )}
                    </td>
                    <td className="border-b p-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="border-b p-2 text-[var(--foreground)]">
                      {r.scheduled_trigger_at
                        ? new Date(r.scheduled_trigger_at).toLocaleString("fr-FR")
                        : "—"}
                    </td>
                    <td className="border-b p-2 text-[var(--foreground-muted)]">
                      {r.source === "cron" ? "Cron" : r.source === "manual" ? "Manuel" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredEvents.length === 0 && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">Aucun événement IA.</p>
        )}
        {filteredEvents.length > EVENTS_PER_PAGE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm text-[var(--foreground-muted)]">
              Affichage {Math.min((currentPage - 1) * EVENTS_PER_PAGE + 1, filteredEvents.length)}-
              {Math.min(currentPage * EVENTS_PER_PAGE, filteredEvents.length)} sur {filteredEvents.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </section>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !createLoading && setShowCreateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-event-title"
        >
          <div
            className="max-w-md rounded-lg border p-6 shadow-xl"
            style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-event-title" className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Générer un event IA
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Type d&apos;action</label>
                <select
                  value={createTypeId}
                  onChange={(e) => setCreateTypeId(e.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  {actionTypesForAi.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label_fr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Pays émetteur (IA)</label>
                <select
                  value={createEmitterId}
                  onChange={(e) => setCreateEmitterId(e.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  {aiCountries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Pays cible</label>
                <select
                  value={createTargetId}
                  onChange={(e) => setCreateTargetId(e.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  {allCountries
                    .filter((c) => c.id !== createEmitterId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !createLoading && setShowCreateModal(false)}
                className="rounded border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createLoading}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {createLoading ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-amber-600 dark:text-amber-400">
        <span aria-hidden>⏳</span> En attente
      </span>
    );
  if (status === "accepted")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>✓</span> Accepté
      </span>
    );
  if (status === "refused")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-red-600 dark:text-red-400">
        <span aria-hidden>✗</span> Refusé
      </span>
    );
  return <span className="text-[var(--foreground-muted)]">{status}</span>;
}

function EventDetail({
  event,
  targetCountriesById = {},
  countriesList = [],
  relationMap = {},
  onClose,
  onSuccess,
  onRefresh,
  onError,
}: {
  event: AiEventRow;
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  countriesList?: Array<{ id: string; name: string }>;
  relationMap?: Record<string, number>;
  onClose: () => void;
  onSuccess: () => void;
  onRefresh: () => void;
  onError: (s: string) => void;
}) {
  const [refusalMsg, setRefusalMsg] = useState("");
  const [scheduleWithAmplitude, setScheduleWithAmplitude] = useState(false);
  const [loading, setLoading] = useState<"accept" | "refuse" | null>(null);
  const [diceLoading, setDiceLoading] = useState<"success" | "impact" | null>(null);
  const [adminModifierStr, setAdminModifierStr] = useState("0");
  const [adminModifierLabel, setAdminModifierLabel] = useState("");

  const payload = event.payload ?? {};
  const isPending = event.status === "pending";
  const targetId = typeof payload.target_country_id === "string" ? payload.target_country_id : null;
  const targetCountry = targetId ? targetCountriesById[targetId] : null;
  const hasTarget = targetCountry != null;
  const actionKey = event.state_action_types?.key ?? "";
  const needsImpactRoll = ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(actionKey);
  const canAccept = !needsImpactRoll || !!event.dice_results?.impact_roll;

  function parseModifierStr(s: string): number {
    const t = s.trim();
    if (t === "" || t === "-") return 0;
    const n = parseInt(t, 10);
    if (Number.isNaN(n)) return 0;
    if (n > 100) return 100;
    if (n < -100) return -100;
    return n;
  }

  async function handleAccept() {
    if (!isPending) return;
    setLoading("accept");
    onError("");
    const res = await acceptAiEvent(event.id, { scheduleWithAmplitude });
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  async function handleRefuse() {
    if (!isPending) return;
    setLoading("refuse");
    onError("");
    const res = await refuseAiEvent(event.id, refusalMsg);
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  return (
    <section className={panelClass} style={panelStyle}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {event.state_action_types?.label_fr ?? "Détail de l'événement IA"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-red-500/10 hover:text-red-300"
          style={{ borderColor: "var(--border)" }}
        >
          Fermer le détail
        </button>
      </div>

      <div className="flex gap-0" style={{ borderColor: "var(--border)" }}>
        <div className={hasTarget ? "flex-1 py-3 pr-4" : "flex-1 py-3"}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
            {hasTarget ? "Émetteur" : "Pays émetteur"}
          </p>
          <div className="flex items-center gap-3">
            {event.country?.flag_url ? (
              <img
                src={event.country.flag_url}
                alt=""
                className="h-10 w-14 rounded object-cover shrink-0"
              />
            ) : (
              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-[var(--background)] text-xs text-[var(--foreground-muted)]">
                Drapeau
              </div>
            )}
            <div>
              <p className="font-medium text-[var(--foreground)]">{event.country?.name ?? event.country_id}</p>
              {event.country?.regime && (
                <p className="text-xs text-[var(--foreground-muted)]">{event.country.regime}</p>
              )}
            </div>
          </div>
        </div>
        {hasTarget && (
          <>
            <div className="w-px shrink-0 bg-[var(--border)]" aria-hidden />
            <div className="flex-1 py-3 pl-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
                Cible
              </p>
              <div className="flex items-center gap-3">
                {targetCountry.flag_url ? (
                  <img
                    src={targetCountry.flag_url}
                    alt=""
                    className="h-10 w-14 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-[var(--background)] text-xs text-[var(--foreground-muted)]">
                    Drapeau
                  </div>
                )}
                <div>
                  <p className="font-medium text-[var(--foreground)]">{targetCountry.name}</p>
                  {targetCountry.regime && (
                    <p className="text-xs text-[var(--foreground-muted)]">{targetCountry.regime}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {hasTarget && targetId && (() => {
        const relation = getRelationFromMap(relationMap, event.country_id, targetId);
        return (
          <div className="mt-3 flex flex-wrap items-baseline justify-center gap-2 border-t py-3" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs text-[var(--foreground-muted)]">Relation bilatérale :</span>
            <span className="text-sm font-medium" style={{ color: getRelationColor(relation) }}>
              {relation}
            </span>
            <span className="text-sm font-medium" style={{ color: getRelationColor(relation) }}>
              {getRelationLabel(relation)}
            </span>
          </div>
        );
      })()}

      {event.refusal_message && (
        <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <dt className="text-[var(--foreground-muted)]">Message de refus</dt>
          <dd className="whitespace-pre-wrap break-words text-[var(--foreground)] [overflow-wrap:anywhere]">
            {event.refusal_message}
          </dd>
        </dl>
      )}

      {(() => {
        const effectsList = normalizeAdminEffectsAdded(event.admin_effect_added);
        if (effectsList.length === 0) return null;
        const effectLookups = { rosterUnits: [] as { id: string; name_fr: string }[], countries: countriesList };
        return (
          <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
            <dt className="mb-2 text-[var(--foreground-muted)]">Effets ajoutés (admin)</dt>
            <dd>
              <ul className="list-inside list-disc space-y-1 text-[var(--foreground)]">
                {effectsList.map((e, idx) => (
                  <li key={idx} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {formatAdminEffectLabel(e, effectLookups)}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        );
      })()}

      {event.scheduled_trigger_at && (
        <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <dt className="text-[var(--foreground-muted)]">Déclenchement prévu</dt>
          <dd className="text-[var(--foreground)]">
            {new Date(event.scheduled_trigger_at).toLocaleString("fr-FR")}
            {event.consequences_applied_at && (
              <span className="ml-2 text-[var(--foreground-muted)]">
                (appliqué le {new Date(event.consequences_applied_at).toLocaleString("fr-FR")})
              </span>
            )}
          </dd>
        </dl>
      )}

      {needsImpactRoll && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Jets de dés</h3>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--foreground-muted)]">Modificateur ponctuel</label>
            <input
              type="text"
              inputMode="numeric"
              value={adminModifierStr}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^-?\d*$/.test(v)) setAdminModifierStr(v);
              }}
              placeholder="0"
              className="w-20 rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
            <label className="text-xs text-[var(--foreground-muted)]">Libellé</label>
            <input
              type="text"
              value={adminModifierLabel}
              onChange={(e) => setAdminModifierLabel(e.target.value.slice(0, 50))}
              placeholder="Ponctuel"
              maxLength={50}
              className="min-w-[8rem] rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const value = parseModifierStr(adminModifierStr);
                setDiceLoading("success");
                onError("");
                await rollD100ForAiEvent(
                  event.id,
                  "success",
                  value !== 0 ? [{ label: adminModifierLabel.trim() || "Ponctuel", value }] : []
                );
                setDiceLoading(null);
                onRefresh();
              }}
              disabled={diceLoading !== null || !isPending}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {diceLoading === "success" ? "Jet…" : "Lancer jet succès"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const value = parseModifierStr(adminModifierStr);
                setDiceLoading("impact");
                onError("");
                await rollD100ForAiEvent(
                  event.id,
                  "impact",
                  value !== 0 ? [{ label: adminModifierLabel.trim() || "Ponctuel", value }] : []
                );
                setDiceLoading(null);
                onRefresh();
              }}
              disabled={diceLoading !== null || !isPending}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {diceLoading === "impact" ? "Jet…" : "Lancer jet impact"}
            </button>
          </div>
          {event.dice_results?.success_roll && (
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
                  Jet succès
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  {formatRollFormula(
                    event.dice_results.success_roll,
                    event.dice_results?.admin_modifiers?.[0]?.label
                  )}{" "}
                  = <strong className="text-lg">{event.dice_results.success_roll.total}</strong>
                </p>
              </div>
              <p className="shrink-0 text-base font-bold uppercase text-[var(--foreground)]">
                {getRollConclusion(event.dice_results.success_roll.roll, event.dice_results.success_roll.total)}
              </p>
            </div>
          )}
          {event.dice_results?.impact_roll && (
            <>
              <div
                className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              >
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
                    Jet impact
                  </p>
                  <p className="text-sm text-[var(--foreground)]">
                    {formatRollFormula(
                      event.dice_results.impact_roll,
                      event.dice_results?.admin_modifiers?.[0]?.label
                    )}{" "}
                    = <strong className="text-lg">{event.dice_results.impact_roll.total}</strong>
                  </p>
                </div>
                <p className="shrink-0 text-base font-bold uppercase text-[var(--foreground)]">
                  {getRollConclusion(event.dice_results.impact_roll.roll, event.dice_results.impact_roll.total)}
                </p>
              </div>
              {(() => {
                const paramsSchema = event.state_action_types?.params_schema as Record<string, number> | undefined;
                const impactMax = typeof paramsSchema?.impact_maximum === "number" ? paramsSchema.impact_maximum : getDefaultImpactMaximum(actionKey);
                const total = event.dice_results!.impact_roll!.total;
                const impactLabel = getStateActionImpactPreviewLabel(actionKey, impactMax, total);
                if (!impactLabel) return null;
                return (
                  <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Impact</p>
                    <p className="text-lg font-bold text-[var(--foreground)]">{impactLabel}</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {isPending && (
        <div className="mt-6 space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {needsImpactRoll && !event.dice_results?.impact_roll && (
            <p className="text-sm text-amber-500 dark:text-amber-400">
              Lancez le jet d&apos;impact pour pouvoir accepter cet événement.
            </p>
          )}
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={loading !== null || !canAccept}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading === "accept" ? "En cours…" : "Accepter"}
              </button>
              <button
                type="button"
                onClick={handleRefuse}
                disabled={loading !== null}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading === "refuse" ? "En cours…" : "Refuser"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleWithAmplitude}
                  onChange={(e) => setScheduleWithAmplitude(e.target.checked)}
                />
                Planifier avec amplitude (déclenchement différé)
              </label>
              <input
                type="text"
                placeholder="Message de refus (recommandé)"
                value={refusalMsg}
                onChange={(e) => setRefusalMsg(e.target.value.slice(0, 500))}
                className="min-w-[200px] max-w-md flex-1 rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
                maxLength={500}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
