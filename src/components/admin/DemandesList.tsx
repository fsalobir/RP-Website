"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin/AdminDialog";
import {
  acceptRequest,
  refuseRequest,
  updateRequestEffect,
  rollD100,
  removeImpactRoll,
} from "@/app/admin/demandes/actions";
import {
  ALL_EFFECT_KIND_IDS,
  getEffectKindValueHelper,
  getEffectKindOptionGroups,
  normalizeAdminEffectsAdded,
  formatAdminEffectLabel,
  EFFECT_KIND_LABELS,
  DURATION_DAYS_MAX,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
  EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
  EFFECT_KINDS_WITH_SUB_TYPE_TARGET,
  EFFECT_KINDS_WITH_COUNTRY_TARGET,
  formatSubTypeTargetLabel,
  SUB_TYPE_TARGET_SEP,
  MILITARY_BRANCH_EFFECT_IDS,
} from "@/lib/countryEffects";
import { STAT_LABELS } from "@/lib/countryEffects";
import { getBudgetMinistryOptions } from "@/lib/countryEffects";
import { MILITARY_BRANCH_EFFECT_LABELS } from "@/lib/countryEffects";
import type { AdminEffectAdded } from "@/types/database";
import { formatNumber } from "@/lib/format";
import { normalizePair } from "@/lib/relations";
import { getRelationLabel, getRelationColor } from "@/lib/relationScale";
import { matchesAdminListFilters, normalizeAdminSearch } from "@/lib/adminListFilters";
import {
  ACTION_KEYS_REQUIRING_IMPACT_ROLL,
  actionRequiresTargetAcceptance,
  getDefaultImpactMaximum,
  getStateActionImpactPreviewLabel,
} from "@/lib/actionKeys";

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
      const label = STAT_LABELS[key as keyof typeof STAT_LABELS] ?? key;
      parts.push(`${value >= 0 ? "+" : ""}${value} (${label})`);
    }
  } else if (rollResult.modifier !== 0) {
    parts.push(`${rollResult.modifier >= 0 ? "+" : ""}${rollResult.modifier} (Mod.)`);
  }
  if (rollResult.admin_modifier != null && rollResult.admin_modifier !== 0) {
    parts.push(`${rollResult.admin_modifier >= 0 ? "+" : ""}${rollResult.admin_modifier} (${adminLabel?.trim() || "Correction manuelle"})`);
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

type RequestRow = {
  id: string;
  country_id: string;
  user_id: string;
  action_type_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  admin_effect_added: Record<string, unknown> | null;
  refund_actions: boolean;
  refusal_message: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  dice_results?: DiceResultsRow | null;
  country?: { id: string; name: string; slug: string; flag_url: string | null; regime: string | null } | null;
  state_action_types?: { key: string; label_fr: string; cost: number; params_schema?: Record<string, unknown> | null } | null;
};

type RosterUnitForSubType = { id: string; name_fr: string; branch?: string; sub_type?: string | null };

type Props = {
  requests: RequestRow[];
  rosterUnitIds: { id: string; name_fr: string }[];
  /** Unités avec branch/sub_type pour le sélecteur d'effet « modificateur par sous-branche/type ». */
  rosterUnits?: RosterUnitForSubType[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  influenceByCountryId?: Record<string, number>;
  relationMap?: Record<string, number>;
  countriesList?: Array<{ id: string; name: string }>;
  /** Gain base d'intel pour l'action espionnage (règles). Utilisé pour afficher l'impact proportionnel au jet d'impact. */
  espionageIntelGainBase?: number;
};

function getRelationFromMap(record: Record<string, number>, countryIdA: string, countryIdB: string): number {
  if (countryIdA === countryIdB) return 0;
  const [a, b] = normalizePair(countryIdA, countryIdB);
  return record[`${a}|${b}`] ?? 0;
}

/** Liste complète des effets disponibles (actifs et one-shot) dans les demandes et ailleurs. Exclut state_actions_grant. */
const effectKindsForDemandes = ALL_EFFECT_KIND_IDS.filter((k) => k !== "state_actions_grant");
const REQUESTS_PER_PAGE = 10;

const IMMEDIATE_EFFECT_KINDS = new Set([
  "stat_delta",
  "military_unit_extra",
  "military_unit_tech_rate",
  "relation_delta",
  ...ALL_EFFECT_KIND_IDS.filter((kind) => kind.startsWith("ideology_snap_")),
]);

function normalizeEffectApplication(effect: AdminEffectAdded): AdminEffectAdded {
  if (effect.effect_kind.startsWith("ideology_snap_")) {
    return { ...effect, application: "immediate", duration_kind: "days", duration_remaining: 0 };
  }
  if (effect.application === "immediate" && !IMMEDIATE_EFFECT_KINDS.has(effect.effect_kind)) {
    return { ...effect, application: "duration", duration_kind: "days", duration_remaining: 30 };
  }
  return effect;
}

function defaultAdminEffect(rosterUnitIds: Array<{ id: string }>): AdminEffectAdded {
  const effectKind = effectKindsForDemandes[0];
  return {
    name: "",
    effect_kind: effectKind,
    effect_target: EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)
      ? "militarism"
      : EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)
        ? (rosterUnitIds[0]?.id ?? null)
        : null,
    effect_subtype: null,
    value: 0,
    duration_kind: "days",
    duration_remaining: 30,
    application: "duration",
    scope: "emitter",
  };
}

export function ManualEffectsFields({
  countriesList,
  rosterUnits,
  initialEffects = [],
  fixedCountryId,
  fixedTargetCountryId,
}: {
  countriesList: Array<{ id: string; name: string }>;
  rosterUnits: RosterUnitForSubType[];
  initialEffects?: AdminEffectAdded[];
  fixedCountryId?: string;
  fixedTargetCountryId?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [countryId, setCountryId] = useState(fixedCountryId ?? "");
  const [targetCountryId, setTargetCountryId] = useState(fixedTargetCountryId ?? "");
  const [effects, setEffects] = useState(initialEffects);
  const [draft, setDraft] = useState<AdminEffectAdded | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (fixedCountryId !== undefined || fixedTargetCountryId !== undefined) return;
    const form = rootRef.current?.closest("form");
    const country = form?.elements.namedItem("country_id");
    const target = form?.elements.namedItem("target_country_id");
    if (!(country instanceof HTMLSelectElement) || !(target instanceof HTMLSelectElement)) return;
    const sync = () => {
      setCountryId(country.value);
      setTargetCountryId(target.value);
    };
    sync();
    country.addEventListener("change", sync);
    target.addEventListener("change", sync);
    return () => {
      country.removeEventListener("change", sync);
      target.removeEventListener("change", sync);
    };
  }, [fixedCountryId, fixedTargetCountryId]);

  const resolvedEffects = effects.map((effect) =>
    effect.effect_kind === "relation_delta"
      ? {
        ...effect,
        effect_target: effect.scope === "target"
          ? countryId || null
          : targetCountryId || null,
      }
      : effect
  );

  const relationCountryId = draft?.scope === "target" ? countryId : targetCountryId;
  const visibleCountries = relationCountryId
    ? countriesList.filter(({ id }) => id === relationCountryId)
    : [];
  const rosterUnitIds = rosterUnits.map(({ id, name_fr }) => ({ id, name_fr }));

  function saveDraft() {
    if (!draft) return;
    const scoped = normalizeEffectApplication({
      ...draft,
      name: draft.name.trim() || EFFECT_KIND_LABELS[draft.effect_kind] || "Conséquence",
      effect_target: draft.effect_kind === "relation_delta"
        ? draft.scope === "target"
          ? countryId || null
          : targetCountryId || null
        : draft.effect_target,
      scope: draft.scope === "target" ? "target" : "emitter",
    });
    setEffects((current) =>
      editingIndex === null
        ? [...current, scoped]
        : current.map((item, index) => index === editingIndex ? scoped : item)
    );
    setDraft(null);
    setEditingIndex(null);
  }

  const affectedCountryName = (effect: AdminEffectAdded) =>
    countriesList.find(({ id }) =>
      id === (effect.scope === "target" ? targetCountryId : countryId)
    )?.name;

  return (
    <div ref={rootRef} className="space-y-3 md:col-span-2 xl:col-span-4">
      <input type="hidden" name="effects_json" value={JSON.stringify(resolvedEffects)} />
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">Conséquences mécaniques</p>
        <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
          Facultatives. Elles ne seront appliquées qu’après validation de l’article.
        </p>
      </div>
      {resolvedEffects.length > 0 && (
        <ul className="space-y-2">
          {resolvedEffects.map((effect, index) => (
            <li key={`${effect.effect_kind}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              <span className="text-xs text-[var(--foreground)]">
                {affectedCountryName(effect) ? `${affectedCountryName(effect)} · ` : ""}
                {formatAdminEffectLabel(effect, { rosterUnits: rosterUnitIds, countries: countriesList })}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...effect });
                    setEditingIndex(index);
                  }}
                  className="text-xs font-semibold text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => setEffects((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  className="text-xs font-semibold text-red-300 hover:text-red-200"
                >
                  Retirer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background-panel)] p-3">
          {targetCountryId && (
            <label className="mb-3 block text-xs text-[var(--foreground-muted)]">
              Pays affecté
              <select
                value={draft.scope === "target" ? "target" : "emitter"}
                onChange={(event) => {
                  const scope = event.target.value === "target" ? "target" : "emitter";
                  setDraft({
                    ...draft,
                    scope,
                    effect_target: draft.effect_kind === "relation_delta"
                      ? scope === "target" ? countryId || null : targetCountryId
                      : draft.effect_target,
                  });
                }}
                className="mt-1 min-h-10 w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
              >
                <option value="emitter">
                  {countriesList.find(({ id }) => id === countryId)?.name ?? "Pays émetteur"}
                </option>
                <option value="target">
                  {countriesList.find(({ id }) => id === targetCountryId)?.name ?? "Pays cible"}
                </option>
              </select>
            </label>
          )}
          <EffectForm
            value={draft}
            onChange={setDraft}
            rosterUnitIds={rosterUnitIds}
            rosterUnits={rosterUnits}
            countriesList={visibleCountries}
            requestCountryId={countryId}
            onSave={saveDraft}
            onCancel={() => {
              setDraft(null);
              setEditingIndex(null);
            }}
            saving={false}
            editing={editingIndex !== null}
          />
        </div>
      ) : effects.length < 16 ? (
        <button
          type="button"
          onClick={() => setDraft(defaultAdminEffect(rosterUnitIds))}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)]"
        >
          Ajouter une conséquence
        </button>
      ) : (
        <p className="text-xs text-amber-200">Limite de 16 conséquences atteinte.</p>
      )}
    </div>
  );
}

function getStatusLabel(status: string): string {
  if (status === "pending") return "en attente";
  if (status === "pending_target") return "en attente de la cible";
  if (status === "target_refused") return "refusée par la cible";
  if (status === "accepted") return "acceptée";
  if (status === "refused") return "refusée";
  return status;
}

function requestMatchesListFilters(
  request: RequestRow,
  searchQuery: string,
  statusFilter: string,
  targetCountriesById: NonNullable<Props["targetCountriesById"]>
): boolean {
  const tokens = normalizeAdminSearch(searchQuery).split(" ").filter(Boolean);
  const targetId = typeof request.payload?.target_country_id === "string" ? request.payload.target_country_id : null;
  const targetCountry = targetId ? targetCountriesById[targetId] : null;
  const haystack = normalizeAdminSearch([
    request.state_action_types?.label_fr ?? "",
    request.state_action_types?.key ?? "",
    request.country?.name ?? "",
    targetCountry?.name ?? "",
    typeof request.payload?.message === "string" ? request.payload.message : "",
    request.refusal_message ?? "",
    getStatusLabel(request.status),
  ].join(" "));
  return matchesAdminListFilters(request.status, statusFilter, haystack, tokens);
}

export function DemandesList({ requests, rosterUnitIds, rosterUnits = [], targetCountriesById = {}, influenceByCountryId = {}, relationMap = {}, countriesList = [], espionageIntelGainBase }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailHasDraft, setDetailHasDraft] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isWideWorkspace, setIsWideWorkspace] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWideWorkspace(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      const actionable = (status: string) => (status === "pending" || status === "pending_target" ? 0 : 1);
      const statusA = actionable(a.status);
      const statusB = actionable(b.status);
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return sortedRequests.filter((request) =>
      requestMatchesListFilters(request, searchQuery, statusFilter, targetCountriesById)
    );
  }, [searchQuery, sortedRequests, statusFilter, targetCountriesById]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE));
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedRequests = useMemo(() => {
    const start = (effectivePage - 1) * REQUESTS_PER_PAGE;
    return filteredRequests.slice(start, start + REQUESTS_PER_PAGE);
  }, [effectivePage, filteredRequests]);

  const activeSelectedId = selectedId === undefined && isWideWorkspace
    ? (paginatedRequests[0]?.id ?? null)
    : selectedId;
  const selected = filteredRequests.find((request) => request.id === activeSelectedId)
    ?? sortedRequests.find((request) => request.id === activeSelectedId);

  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const waitingTargetCount = requests.filter((request) => request.status === "pending_target").length;
  const resolvedCount = requests.length - pendingCount - waitingTargetCount;

  function prepareFilterChange(nextSearch: string, nextStatus: string) {
    if (
      !selected
      || requestMatchesListFilters(selected, nextSearch, nextStatus, targetCountriesById)
    ) {
      return true;
    }
    if (!canCloseDetail()) return false;
    closeDetail();
    return true;
  }

  function handleSuccess() {
    setError(null);
    setDetailBusy(false);
    setDetailHasDraft(false);
    setSuccess("Demande traitée. La liste a été mise à jour.");
    setSelectedId(null);
    router.refresh();
  }

  function handleRefresh() {
    setError(null);
    router.refresh();
  }

  function closeDetail() {
    setDetailHasDraft(false);
    setSelectedId(null);
  }

  function canCloseDetail() {
    return !detailHasDraft
      || confirm("Des modifications ne sont pas enregistrées. Fermer et les perdre ?");
  }

  function requestCloseDetail() {
    if (canCloseDetail()) closeDetail();
  }

  function toggleRequest(id: string) {
    if (activeSelectedId === id) {
      requestCloseDetail();
      return;
    }
    if (
      detailHasDraft
      && !confirm("Des modifications ne sont pas enregistrées. Changer de demande et les perdre ?")
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setDetailHasDraft(false);
    setSelectedId(id);
  }

  const detailTitle = selected?.state_action_types?.label_fr ?? "Détail de la demande";
  const detailDescription = selected
    ? `${new Date(selected.created_at).toLocaleString("fr-FR")} · ${selected.country?.name ?? "Pays inconnu"}`
    : undefined;
  const detailBody = selected ? (
    <>
      {error ? (
        <p role="alert" className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <RequestDetail
        key={selected.id}
        request={selected}
        error={error}
        rosterUnitIds={rosterUnitIds}
        rosterUnits={rosterUnits}
        targetCountriesById={targetCountriesById}
        influenceByCountryId={influenceByCountryId}
        relationMap={relationMap}
        countriesList={countriesList}
        espionageIntelGainBase={espionageIntelGainBase}
        onSuccess={handleSuccess}
        onRefresh={handleRefresh}
        onError={setError}
        onBusyChange={setDetailBusy}
        onDraftChange={setDetailHasDraft}
      />
    </>
  ) : null;

  return (
    <div className="admin-settings-form">
      {!isWideWorkspace ? (
        <AdminDialog
          id="request-detail"
          open={selected != null}
          onClose={closeDetail}
          beforeClose={canCloseDetail}
          title={detailTitle}
          description={detailDescription}
          busy={detailBusy}
          size="lg"
        >
          {detailBody}
        </AdminDialog>
      ) : null}

      <section
        aria-label="Demandes des joueurs"
        className="overflow-hidden rounded-xl border"
        style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
      >
        <div
          className="grid gap-3 border-b p-3 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,2fr)] lg:items-end"
          style={{ borderColor: "var(--border)" }}
        >
          <dl className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
              <dt className="inline">À décider </dt>
              <dd className="inline font-bold">{pendingCount}</dd>
            </div>
            <div className="rounded-full bg-blue-500/15 px-2.5 py-1 text-blue-200">
              <dt className="inline">Attente cible </dt>
              <dd className="inline font-bold">{waitingTargetCount}</dd>
            </div>
            <div className="rounded-full bg-[var(--background-elevated)] px-2.5 py-1 text-[var(--foreground-muted)]">
              <dt className="inline">Traitées </dt>
              <dd className="inline font-bold text-[var(--foreground)]">{resolvedCount}</dd>
            </div>
          </dl>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label>
              <span className="sr-only">Rechercher une demande</span>
              <input
                id="request-search"
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  const nextSearch = event.target.value;
                  if (!prepareFilterChange(nextSearch, statusFilter)) return;
                  setSearchQuery(nextSearch);
                  setCurrentPage(1);
                }}
                placeholder="Rechercher une action ou un pays…"
                className="min-h-10 w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
            <label>
              <span className="sr-only">Filtrer par statut</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  if (!prepareFilterChange(searchQuery, nextStatus)) return;
                  setStatusFilter(nextStatus);
                  setCurrentPage(1);
                }}
                className="min-h-10 w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">À décider ({pendingCount})</option>
                <option value="pending_target">Attente de la cible ({waitingTargetCount})</option>
                <option value="accepted">Acceptées</option>
                <option value="refused">Refusées</option>
                <option value="target_refused">Refusées par la cible</option>
              </select>
            </label>
          </div>
        </div>

        {success ? (
          <p role="status" className="border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        ) : null}

        <div className={isWideWorkspace ? "xl:grid xl:grid-cols-[minmax(24rem,0.9fr)_minmax(38rem,1.35fr)]" : ""}>
          <div className={isWideWorkspace ? "min-w-0 xl:border-r" : ""} style={{ borderColor: "var(--border)" }}>
            <div
              className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs text-[var(--foreground-muted)]"
              style={{ borderColor: "var(--border)" }}
            >
              <span>{filteredRequests.length} demande{filteredRequests.length > 1 ? "s" : ""}</span>
              <span>Page {effectivePage} / {totalPages}</span>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {paginatedRequests.map((request) => {
                const targetId = typeof request.payload?.target_country_id === "string"
                  ? request.payload.target_country_id
                  : null;
                const targetCountry = targetId ? targetCountriesById[targetId] : null;
                const isSelected = activeSelectedId === request.id;
                return (
                  <li key={request.id}>
                    <button
                      type="button"
                      onClick={() => toggleRequest(request.id)}
                      aria-pressed={isSelected}
                      aria-controls={isWideWorkspace ? "request-workspace-detail" : "request-detail"}
                      className={`group w-full px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
                        isSelected
                          ? "bg-[var(--background-elevated)]"
                          : "hover:bg-[color-mix(in_srgb,var(--background-elevated)_55%,transparent)]"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-semibold text-[var(--foreground)]">
                            {request.state_action_types?.label_fr ?? request.action_type_id}
                          </span>
                          <time className="mt-0.5 block text-xs text-[var(--foreground-muted)]" dateTime={request.created_at}>
                            {new Date(request.created_at).toLocaleString("fr-FR")}
                          </time>
                        </span>
                        <span
                          aria-hidden
                          className={`mt-0.5 text-lg transition-transform ${
                            isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--foreground-muted)] group-hover:translate-x-0.5"
                          }`}
                        >
                          ›
                        </span>
                      </span>
                      <span className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-[var(--foreground)]">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {request.country?.flag_url ? (
                              <img src={request.country.flag_url} alt="" className="h-5 w-8 shrink-0 rounded object-cover" />
                            ) : null}
                            <span className="truncate">{request.country?.name ?? request.country_id}</span>
                          </span>
                          {targetCountry ? (
                            <>
                              <span aria-hidden className="text-[var(--foreground-muted)]">→</span>
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                {targetCountry.flag_url ? (
                                  <img src={targetCountry.flag_url} alt="" className="h-5 w-8 shrink-0 rounded object-cover" />
                                ) : null}
                                <span className="truncate">{targetCountry.name}</span>
                              </span>
                            </>
                          ) : null}
                        </span>
                        <span className="shrink-0"><StatusBadge status={request.status} /></span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {filteredRequests.length === 0 ? (
              <div className="flex min-h-40 flex-wrap items-center justify-center gap-3 p-4 text-sm text-[var(--foreground-muted)]">
                <span>{requests.length === 0 ? "Aucune demande reçue." : "Aucun résultat."}</span>
                {requests.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                      setCurrentPage(1);
                    }}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    Effacer les filtres
                  </button>
                ) : null}
              </div>
            ) : null}

            {filteredRequests.length > REQUESTS_PER_PAGE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {Math.min((effectivePage - 1) * REQUESTS_PER_PAGE + 1, filteredRequests.length)}-
                  {Math.min(effectivePage * REQUESTS_PER_PAGE, filteredRequests.length)} sur {filteredRequests.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.max(1, effectivePage - 1))}
                    disabled={effectivePage === 1}
                    className="min-h-9 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.min(totalPages, effectivePage + 1))}
                    disabled={effectivePage === totalPages}
                    className="min-h-9 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {isWideWorkspace ? (
            <aside id="request-workspace-detail" className="flex min-h-[34rem] min-w-0 flex-col">
              {selected ? (
                <>
                  <header className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-[var(--foreground)]">{detailTitle}</h2>
                      <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">{detailDescription}</p>
                    </div>
                    <button
                      type="button"
                      onClick={requestCloseDetail}
                      disabled={detailBusy}
                      aria-label="Fermer le détail"
                      className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-lg text-xl text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] disabled:opacity-50"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </header>
                  <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 xl:max-h-[calc(100dvh-13rem)]">
                    {detailBody}
                  </div>
                </>
              ) : (
                <div className="grid min-h-[34rem] place-items-center p-8 text-center text-sm text-[var(--foreground-muted)]">
                  <p>Sélectionnez une demande.</p>
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </section>
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
  if (status === "pending_target")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-blue-600 dark:text-blue-400">
        <span aria-hidden>⏳</span> En attente de la cible
      </span>
    );
  if (status === "target_refused")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-orange-500/20 px-2 py-0.5 text-orange-600 dark:text-orange-400">
        <span aria-hidden>✗</span> Refusé par la cible
      </span>
    );
  if (status === "accepted")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>✓</span> Acceptée
      </span>
    );
  if (status === "refused")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-red-600 dark:text-red-400">
        <span aria-hidden>✗</span> Refusée
      </span>
    );
  return <span className="text-[var(--foreground-muted)]">{status}</span>;
}

function RequestDetail({
  request,
  error,
  rosterUnitIds,
  rosterUnits = [],
  targetCountriesById = {},
  influenceByCountryId = {},
  relationMap = {},
  countriesList = [],
  espionageIntelGainBase,
  onSuccess,
  onRefresh,
  onError,
  onBusyChange,
  onDraftChange,
}: {
  request: RequestRow;
  error: string | null;
  rosterUnitIds: { id: string; name_fr: string }[];
  rosterUnits?: RosterUnitForSubType[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  influenceByCountryId?: Record<string, number>;
  relationMap?: Record<string, number>;
  countriesList?: Array<{ id: string; name: string }>;
  espionageIntelGainBase?: number;
  onSuccess: () => void;
  onRefresh: () => void;
  onError: (s: string) => void;
  onBusyChange: (busy: boolean) => void;
  onDraftChange: (hasDraft: boolean) => void;
}) {
  const [refund, setRefund] = useState(false);
  const [refusalMsg, setRefusalMsg] = useState("");
  const [loading, setLoading] = useState<
    "accept" | "refuse" | "effect" | "success-roll" | "impact-roll" | "remove-roll" | null
  >(null);
  const [decisionToConfirm, setDecisionToConfirm] = useState<"accept" | "refuse" | null>(null);
  const effectsList = normalizeAdminEffectsAdded(request.admin_effect_added);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [effectForm, setEffectForm] = useState<AdminEffectAdded | null>(null);
  const [showEffectForm, setShowEffectForm] = useState(false);
  const [adminModifierStr, setAdminModifierStr] = useState("0");
  const [adminModifierLabel, setAdminModifierLabel] = useState("");
  const effectEntries = effectsList.map((effect, index) => ({ effect, index }));
  const durationEffectEntries = effectEntries.filter(({ effect }) => effect.application !== "immediate");
  const immediateEffectEntries = effectEntries.filter(({ effect }) => effect.application === "immediate");

  const effectLookups = { rosterUnits: rosterUnitIds, countries: countriesList };

  useEffect(() => {
    onBusyChange(loading !== null);
  }, [loading, onBusyChange]);

  useEffect(() => {
    onDraftChange(
      refund
      || refusalMsg.length > 0
      || decisionToConfirm !== null
      || adminModifierStr !== "0"
      || adminModifierLabel.length > 0
      || showEffectForm
    );
  }, [
    adminModifierLabel,
    adminModifierStr,
    decisionToConfirm,
    onDraftChange,
    refund,
    refusalMsg,
    showEffectForm,
  ]);

  function parseModifierStr(s: string): number {
    const t = s.trim();
    if (t === "" || t === "-") return 0;
    const n = parseInt(t, 10);
    if (Number.isNaN(n)) return 0;
    if (n > 100) return 100;
    if (n < -100) return -100;
    return n;
  }

  async function runMutation(
    kind: NonNullable<typeof loading>,
    task: () => Promise<{ error?: string | null }>,
    onDone: () => void
  ) {
    if (loading) return;
    setLoading(kind);
    onError("");
    try {
      const result = await task();
      if (result.error) onError(result.error);
      else onDone();
    } catch {
      onError("L’action n’a pas pu aboutir. Vérifiez la connexion puis réessayez.");
    } finally {
      setLoading(null);
    }
  }

  const payload = request.payload ?? {};
  const isAdminActionable = request.status === "pending";
  /** Admin peut refuser même en attente cible (alliance / coopération militaire) pour éviter que les demandes pourrissent. */
  const adminCanRefuse = request.status === "pending" || request.status === "pending_target";
  const targetId = typeof payload.target_country_id === "string" ? payload.target_country_id : null;
  const targetCountry = targetId ? targetCountriesById[targetId] : null;
  const hasTarget = targetCountry != null;
  const requiresTargetAcceptance = actionRequiresTargetAcceptance(
    request.state_action_types?.key ?? "",
    request.state_action_types?.params_schema ?? null
  );
  const needsImpactRoll = ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(request.state_action_types?.key ?? "");

  async function handleAccept() {
    if (!isAdminActionable || loading) return;
    await runMutation("accept", () => acceptRequest(request.id), onSuccess);
  }

  async function handleRefuse() {
    if (!adminCanRefuse || loading) return;
    await runMutation("refuse", () => refuseRequest(request.id, refund, refusalMsg), onSuccess);
  }

  const EFFECT_VALUE_MIN = -1000;
  const EFFECT_VALUE_MAX = 1000;

  async function handleSaveEffect() {
    if (loading || !effectForm?.effect_kind) return;
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(effectForm.effect_kind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectForm.effect_kind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectForm.effect_kind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectForm.effect_kind) ||
      EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectForm.effect_kind) ||
      EFFECT_KINDS_WITH_COUNTRY_TARGET.has(effectForm.effect_kind);
    if (needsTarget && !effectForm.effect_target) {
      onError("Choisissez la cible de cette conséquence.");
      return;
    }
    const clampedValue = Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, Number(effectForm.value) || 0));
    const payload = normalizeEffectApplication({
      ...effectForm,
      name: effectForm.name.trim() || EFFECT_KIND_LABELS[effectForm.effect_kind] || "Conséquence",
      value: clampedValue,
      duration_remaining:
        effectForm.duration_kind === "permanent"
          ? 0
          : Math.max(0, Math.min(DURATION_DAYS_MAX, Math.round(Number(effectForm.duration_remaining) || 30))),
      application: effectForm.application === "immediate" ? "immediate" : "duration",
    });
    const newList =
      editingIndex !== null
        ? effectsList.map((e, i) => (i === editingIndex ? payload : e))
        : [...effectsList, payload];
    await runMutation("effect", () => updateRequestEffect(request.id, newList), () => {
      onRefresh();
      setShowEffectForm(false);
      setEditingIndex(null);
      setEffectForm(null);
    });
  }

  async function handleDeleteEffect(index: number) {
    if (loading) return;
    const newList = effectsList.filter((_, i) => i !== index);
    await runMutation("effect", () => updateRequestEffect(request.id, newList.length > 0 ? newList : null), () => {
      onRefresh();
      setShowEffectForm(false);
      setEditingIndex(null);
      setEffectForm(null);
    });
  }

  function openAddEffect() {
    onError("");
    const kind = effectKindsForDemandes[0];
    const otherCountries = countriesList.filter((country) => country.id !== request.country_id);
    const defaultTarget = ["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"].includes(kind)
      ? "militarism"
      : kind.startsWith("budget_ministry")
        ? (getBudgetMinistryOptions()[0]?.key ?? null)
        : kind === "military_unit_limit_modifier"
          ? "terre"
          : ["military_unit_extra", "military_unit_tech_rate"].includes(kind)
            ? (rosterUnitIds[0]?.id ?? null)
            : kind === "relation_delta"
              ? (otherCountries[0]?.id ?? null)
              : null;
    setEffectForm({
      name: "",
      effect_kind: kind,
      effect_target: defaultTarget,
      effect_subtype: null,
      value: 0,
      duration_kind: "days",
      duration_remaining: 30,
      application: "duration",
    });
    setEditingIndex(null);
    setShowEffectForm(true);
  }

  function openEditEffect(index: number) {
    const e = effectsList[index];
    if (!e) return;
    onError("");
    setEffectForm({ ...e });
    setEditingIndex(index);
    setShowEffectForm(true);
  }

  function closeEffectDraft() {
    onError("");
    setShowEffectForm(false);
    setEditingIndex(null);
    setEffectForm(null);
  }

  function canCloseEffectDraft() {
    return confirm("Fermer sans enregistrer cette conséquence ?");
  }

  function requestCloseEffectDraft() {
    if (canCloseEffectDraft()) closeEffectDraft();
  }

  async function handleRoll(type: "success" | "impact") {
    if (loading) return;
    const existingRoll = type === "success" ? request.dice_results?.success_roll : request.dice_results?.impact_roll;
    if (existingRoll && !confirm("Relancer remplacera le résultat actuel. Continuer ?")) return;
    const value = parseModifierStr(adminModifierStr);
    setDecisionToConfirm(null);
    await runMutation(
      type === "success" ? "success-roll" : "impact-roll",
      () => rollD100(
        request.id,
        type,
        value !== 0 ? [{ label: adminModifierLabel.trim() || "Correction manuelle", value }] : []
      ),
      onRefresh
    );
  }

  async function handleRemoveImpactRoll() {
    if (loading) return;
    setDecisionToConfirm(null);
    await runMutation("remove-roll", () => removeImpactRoll(request.id), onRefresh);
  }

  function renderEffectEntries(
    title: string,
    entries: Array<{ effect: AdminEffectAdded; index: number }>,
    emptyLabel: string
  ) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-[var(--foreground)]">{title}</h4>
          <span className="text-xs text-[var(--foreground-muted)]">{entries.length}</span>
        </div>
        {entries.length === 0 ? (
          <p className="rounded border px-3 py-2 text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
            {emptyLabel}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map(({ effect, index }) => (
              <li
                key={index}
                className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[var(--foreground)]">
                  {formatAdminEffectLabel(effect, effectLookups)}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditEffect(index)}
                    disabled={loading !== null}
                    className="rounded p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-50"
                    title={`Modifier ${effect.name}`}
                    aria-label={`Modifier ${effect.name}`}
                  >
                    <span aria-hidden>✎</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEffect(index)}
                    disabled={loading !== null}
                    className="rounded p-1.5 text-[var(--foreground-muted)] hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                    title={`Supprimer ${effect.name}`}
                    aria-label={`Supprimer ${effect.name}`}
                  >
                    <span aria-hidden>🗑</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminDialog
        id={`request-${request.id}-effect`}
        open={showEffectForm}
        onClose={closeEffectDraft}
        beforeClose={canCloseEffectDraft}
        title={editingIndex !== null ? "Modifier la conséquence" : "Ajouter une conséquence"}
        description="Elle sera appliquée uniquement si la demande est acceptée."
        busy={loading === "effect"}
        size="md"
      >
        {error ? (
          <p role="alert" className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <EffectForm
          value={effectForm}
          onChange={setEffectForm}
          rosterUnitIds={rosterUnitIds}
          rosterUnits={rosterUnits}
          countriesList={countriesList}
          requestCountryId={request.country_id}
          onSave={handleSaveEffect}
          onCancel={requestCloseEffectDraft}
          saving={loading === "effect"}
          editing={editingIndex !== null}
        />
      </AdminDialog>

      {adminCanRefuse ? (
        <section
          aria-label="Décision sur la demande"
          className="sticky -top-4 z-20 -mx-4 -mt-4 border-b bg-[var(--background-panel)] px-4 py-3 sm:-top-5 sm:-mx-5 sm:-mt-5 sm:px-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {decisionToConfirm === "accept"
                  ? "Confirmer l’acceptation"
                  : decisionToConfirm === "refuse"
                    ? "Confirmer le refus"
                    : "Décision de l’administration"}
              </p>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                {decisionToConfirm === "accept"
                  ? effectsList.length > 0
                    ? `${effectsList.length} conséquence${effectsList.length > 1 ? "s" : ""} ajoutée${effectsList.length > 1 ? "s" : ""} sera appliquée${effectsList.length > 1 ? "s" : ""}.`
                    : "Les conséquences prévues par l’action seront appliquées."
                  : decisionToConfirm === "refuse"
                    ? "La demande sera clôturée sans appliquer ses conséquences."
                    : needsImpactRoll && !request.dice_results?.impact_roll && isAdminActionable
                      ? "Le jet de conséquence est requis avant l’acceptation."
                      : "Vérifiez les éléments ci-dessous, puis acceptez ou refusez."}
              </p>
            </div>

            {!decisionToConfirm ? (
              <div className={`grid w-full shrink-0 gap-2 sm:w-auto ${isAdminActionable ? "grid-cols-2" : "grid-cols-1"}`}>
                {isAdminActionable ? (
                  <button
                    type="button"
                    onClick={() => setDecisionToConfirm("accept")}
                    disabled={loading !== null || (needsImpactRoll && !request.dice_results?.impact_roll)}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    Accepter…
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDecisionToConfirm("refuse")}
                  disabled={loading !== null}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-50"
                  style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)" }}
                >
                  Refuser…
                </button>
              </div>
            ) : null}
          </div>

          {decisionToConfirm === "refuse" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(14rem,1fr)] sm:items-center">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={refund}
                  onChange={(event) => setRefund(event.target.checked)}
                />
                Rembourser les actions d&apos;État
              </label>
              <input
                aria-label="Message explicatif du refus"
                type="text"
                placeholder="Message au joueur (recommandé)"
                value={refusalMsg}
                onChange={(event) => setRefusalMsg(event.target.value.slice(0, 500))}
                className="min-h-10 w-full rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
                maxLength={500}
              />
            </div>
          ) : null}

          {decisionToConfirm ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:ml-auto sm:w-fit">
              <button
                type="button"
                onClick={() => setDecisionToConfirm(null)}
                disabled={loading !== null}
                className="rounded-lg border px-3 py-2 text-sm font-medium text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={decisionToConfirm === "accept" ? handleAccept : handleRefuse}
                disabled={loading !== null}
                className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                  decisionToConfirm === "accept"
                    ? "bg-[var(--accent)] text-[#0f1419]"
                    : "bg-[var(--danger)] text-white"
                }`}
              >
                {loading
                  ? "Application…"
                  : decisionToConfirm === "accept"
                    ? "Appliquer les conséquences"
                    : "Confirmer le refus"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {request.status !== "pending_target" ? <StatusBadge status={request.status} /> : null}
        <span className="text-xs text-[var(--foreground-muted)]">
          Demande reçue le {new Date(request.created_at).toLocaleString("fr-FR")}
        </span>
      </div>

      {request.status === "pending_target" && (
        <div className="rounded border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          Acceptation indisponible ; le refus reste possible.
        </div>
      )}

      {isAdminActionable &&
        requiresTargetAcceptance && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <strong>Accepté par la cible.</strong> En attente de votre validation.
          </div>
        )}

      <section className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }} aria-label="Pays concernés">
        <div className={`grid items-center gap-3 ${hasTarget ? "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : ""}`}>
          <div className="flex min-w-0 items-center gap-3">
            {request.country?.flag_url ? (
              <img src={request.country.flag_url} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="font-medium text-[var(--foreground)]">{request.country?.name ?? request.country_id}</p>
              <p className="truncate text-xs text-[var(--foreground-muted)]">
                {request.country?.regime ?? "Régime non renseigné"} · Influence{" "}
                {influenceByCountryId[request.country_id] != null ? formatNumber(influenceByCountryId[request.country_id]) : "—"}
              </p>
            </div>
          </div>
          {hasTarget && targetId ? (() => {
            const relation = getRelationFromMap(relationMap, request.country_id, targetId);
            return (
              <>
                <div className="flex items-center justify-center gap-2 text-sm" aria-label={`Relation ${relation}, ${getRelationLabel(relation)}`}>
                  <span aria-hidden className="text-[var(--foreground-muted)]">→</span>
                  <span className="font-medium" style={{ color: getRelationColor(relation) }}>
                    {relation} · {getRelationLabel(relation)}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {targetCountry.flag_url ? (
                    <img src={targetCountry.flag_url} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--foreground)]">{targetCountry.name}</p>
                    <p className="truncate text-xs text-[var(--foreground-muted)]">
                      {targetCountry.regime ?? "Régime non renseigné"} · Influence{" "}
                      {influenceByCountryId[targetId] != null ? formatNumber(influenceByCountryId[targetId]) : "—"}
                    </p>
                  </div>
                </div>
              </>
            );
          })() : null}
        </div>
      </section>

      {((request.state_action_types?.key === "demande_up") ||
        request.state_action_types?.key === "effort_fortifications" ||
        request.state_action_types?.key === "investissements") &&
        payload.message != null && (
          <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
            <dt className="text-[var(--foreground-muted)]">
              {request.state_action_types?.key === "effort_fortifications" ? "Zone ou description" : "Message"}
            </dt>
            <dd className="text-[var(--foreground)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {String(payload.message)}
            </dd>
          </dl>
        )}
      {request.refusal_message && (
        <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <dt className="text-[var(--foreground-muted)]">Message de refus</dt>
          <dd className="text-[var(--foreground)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {request.refusal_message}
          </dd>
        </dl>
      )}

      {!adminCanRefuse ? (
        <section className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Décision enregistrée</h3>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--foreground-muted)]">Résultat</dt>
              <dd className="font-medium text-[var(--foreground)]">{getStatusLabel(request.status)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--foreground-muted)]">Date</dt>
              <dd className="font-medium text-[var(--foreground)]">
                {request.resolved_at ? new Date(request.resolved_at).toLocaleString("fr-FR") : "Non renseignée"}
              </dd>
            </div>
            {request.status !== "accepted" ? (
              <div>
                <dt className="text-xs text-[var(--foreground-muted)]">Actions d’État remboursées</dt>
                <dd className="font-medium text-[var(--foreground)]">{request.refund_actions ? "Oui" : "Non"}</dd>
              </div>
            ) : null}
            {request.status === "accepted" && effectsList.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--foreground-muted)]">Conséquences ajoutées appliquées</dt>
                <dd className="mt-1 text-[var(--foreground)]">
                  <ul className="space-y-1">
                    {effectsList.map((effect, index) => (
                      <li key={index}>{formatAdminEffectLabel(effect, effectLookups)}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {(isAdminActionable || request.status === "pending_target") ? (
        <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <dt className="text-xs text-[var(--foreground-muted)]">Accord de la cible</dt>
            <dd className="mt-0.5 font-medium text-[var(--foreground)]">
              {!requiresTargetAcceptance ? "Non requis" : request.status === "pending_target" ? "En attente" : "Obtenu"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--foreground-muted)]">Jet de conséquence</dt>
            <dd className="mt-0.5 font-medium text-[var(--foreground)]">
              {!needsImpactRoll ? "Non requis" : request.dice_results?.impact_roll ? "Prêt" : "À lancer"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--foreground-muted)]">Conséquences ajoutées</dt>
            <dd className="mt-0.5 font-medium text-[var(--foreground)]">
              {effectsList.length === 0 ? "Aucune" : `${effectsList.length} enregistrée${effectsList.length > 1 ? "s" : ""}`}
            </dd>
          </div>
        </dl>
      ) : null}

      {needsImpactRoll && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Jets de dés</h3>
          {isAdminActionable ? (
            <>
            <p className="mb-2 text-xs text-[var(--foreground-muted)]">
              {request.state_action_types?.key === "prise_influence"
                ? "Les statistiques, la relation et le rapport d’influence modifient automatiquement le résultat."
                : "Les statistiques du pays modifient automatiquement le résultat."}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor={`request-${request.id}-modifier`} className="text-xs text-[var(--foreground-muted)]">Correction manuelle du jet</label>
            <input
              id={`request-${request.id}-modifier`}
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
            <label htmlFor={`request-${request.id}-modifier-label`} className="text-xs text-[var(--foreground-muted)]">Motif de la correction</label>
            <input
              id={`request-${request.id}-modifier-label`}
              type="text"
              value={adminModifierLabel}
              onChange={(e) => setAdminModifierLabel(e.target.value.slice(0, 50))}
              placeholder="Ex. contexte exceptionnel"
              maxLength={50}
              className="min-w-[8rem] rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleRoll("success")}
              disabled={loading !== null}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {loading === "success-roll"
                ? "Jet…"
                : request.dice_results?.success_roll
                  ? "Relancer le jet de réussite"
                  : "Lancer le jet de réussite"}
            </button>
            <button
              type="button"
              onClick={() => handleRoll("impact")}
              disabled={loading !== null}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {loading === "impact-roll"
                ? "Jet…"
                : request.dice_results?.impact_roll
                  ? "Relancer le jet de conséquence"
                  : "Lancer le jet de conséquence"}
            </button>
            </div>
            </>
          ) : null}
          {request.dice_results?.success_roll && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Jet de réussite</p>
                <p className="text-sm text-[var(--foreground)]">
                  {formatRollFormula(request.dice_results.success_roll, request.dice_results?.admin_modifiers?.[0]?.label)} = <strong className="text-lg">{request.dice_results.success_roll.total}</strong>
                </p>
              </div>
              <p className="shrink-0 text-base font-bold uppercase text-[var(--foreground)]">
                {getRollConclusion(request.dice_results.success_roll.roll, request.dice_results.success_roll.total)}
              </p>
            </div>
          )}
          {request.dice_results?.impact_roll && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Jet de conséquence</p>
                  <p className="text-sm text-[var(--foreground)]">
                    {formatRollFormula(request.dice_results.impact_roll, request.dice_results?.admin_modifiers?.[0]?.label)} = <strong className="text-lg">{request.dice_results.impact_roll.total}</strong>
                  </p>
                  {isAdminActionable && (
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                      {request.state_action_types?.key === "prise_influence"
                        ? "Détermine le gain d’influence appliqué lors de l’acceptation."
                        : "Détermine la variation de relation appliquée lors de l’acceptation."}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-base font-bold uppercase text-[var(--foreground)]">
                    {getRollConclusion(request.dice_results.impact_roll.roll, request.dice_results.impact_roll.total)}
                  </p>
                  {isAdminActionable && (
                    <button
                      type="button"
                      onClick={handleRemoveImpactRoll}
                      disabled={loading !== null}
                      className="rounded border px-2 py-1 text-xs text-[var(--foreground-muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                      title="Supprimer le jet de conséquence"
                    >
                      {loading === "remove-roll" ? "Suppression…" : "Supprimer"}
                    </button>
                  )}
                </div>
              </div>
              {(() => {
                const actionKey = request.state_action_types?.key ?? "";
                const impactMax =
                  typeof request.state_action_types?.params_schema?.impact_maximum === "number"
                    ? request.state_action_types.params_schema.impact_maximum
                    : getDefaultImpactMaximum(actionKey);
                const total = request.dice_results!.impact_roll!.total;
                const impactLabel = getStateActionImpactPreviewLabel(actionKey, impactMax, total, espionageIntelGainBase);
                if (!impactLabel) return null;
                return (
                  <div className="mb-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Conséquence</p>
                    <p className="text-lg font-bold text-[var(--foreground)]">{impactLabel}</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {isAdminActionable ? (
        <div className="mt-4 space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Conséquences supplémentaires</h3>
            <div className="mb-3 grid gap-3 lg:grid-cols-2">
              {renderEffectEntries("Conséquences dans la durée", durationEffectEntries, "Aucune conséquence dans la durée.")}
              {renderEffectEntries("Conséquences immédiates", immediateEffectEntries, "Aucune conséquence immédiate.")}
            </div>
            <button
              type="button"
              onClick={openAddEffect}
              disabled={loading !== null}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              Ajouter une conséquence
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EffectForm({
  value,
  onChange,
  rosterUnitIds,
  rosterUnits = [],
  countriesList = [],
  requestCountryId,
  onSave,
  onCancel,
  saving,
  editing = false,
}: {
  value: AdminEffectAdded | null;
  onChange: (v: AdminEffectAdded) => void;
  rosterUnitIds: { id: string; name_fr: string }[];
  rosterUnits?: RosterUnitForSubType[];
  countriesList?: Array<{ id: string; name: string }>;
  requestCountryId?: string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  editing?: boolean;
}) {
  const kindsSource = effectKindsForDemandes;
  const kindGroups = useMemo(() => getEffectKindOptionGroups(kindsSource), [kindsSource]);
  const subTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const u of rosterUnits) {
      const branch = u.branch ?? "terre";
      const subType = u.sub_type ?? null;
      const value = `${branch}${SUB_TYPE_TARGET_SEP}${subType ?? ""}`;
      if (seen.has(value)) continue;
      seen.add(value);
      list.push({ value, label: formatSubTypeTargetLabel(branch, subType) });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [rosterUnits]);
  const kind = (value?.effect_kind ?? kindsSource[0]) as string;
  const needsStat = EFFECT_KINDS_WITH_STAT_TARGET.has(kind);
  const needsBudget = EFFECT_KINDS_WITH_BUDGET_TARGET.has(kind);
  const needsBranch = EFFECT_KINDS_WITH_BRANCH_TARGET.has(kind);
  const needsRoster = EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(kind);
  const needsSubType = EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(kind);
  const needsCountry = EFFECT_KINDS_WITH_COUNTRY_TARGET.has(kind);
  const otherCountries = requestCountryId ? countriesList.filter((c) => c.id !== requestCountryId) : countriesList;
  const defaultTarget = needsStat ? "militarism" : needsBudget ? (getBudgetMinistryOptions()[0]?.key ?? null) : needsBranch ? MILITARY_BRANCH_EFFECT_IDS[0] : needsRoster ? (rosterUnitIds[0]?.id ?? null) : needsSubType ? (subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP) : needsCountry ? (otherCountries[0]?.id ?? null) : null;

  const effect: AdminEffectAdded = value ?? {
    name: "",
    effect_kind: kindsSource[0],
    effect_target: defaultTarget,
    effect_subtype: null,
    value: 0,
    duration_kind: "days",
    duration_remaining: 30,
  };

  const EFFECT_VALUE_MIN = -1000;
  const EFFECT_VALUE_MAX = 1000;
  const clampedValue = Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, Number(effect.value) || 0));

  const kind2 = effect.effect_kind;
  const helper = getEffectKindValueHelper(kind2);
  const displayValue = helper.storedToDisplay(clampedValue);
  const immediateOnly = kind2.startsWith("ideology_snap_");
  const supportsImmediate = IMMEDIATE_EFFECT_KINDS.has(kind2);
  const isImmediate = immediateOnly || (supportsImmediate && effect.application === "immediate");

  const needsStatTarget = needsStat;
  const needsBudgetTarget = needsBudget;
  const needsBranchTarget = needsBranch;
  const needsRosterTarget = needsRoster;
  const needsSubTypeTarget = needsSubType;
  const needsCountryTarget = needsCountry;
  const needsTarget =
    needsStatTarget ||
    needsBudgetTarget ||
    needsBranchTarget ||
    needsRosterTarget ||
    needsSubTypeTarget ||
    needsCountryTarget;
  const targetMissing = needsTarget && !effect.effect_target;
  const fieldLabelClass = "min-w-0 text-xs text-[var(--foreground-muted)]";
  const fieldClass = "mt-1 min-h-10 w-full rounded border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]";
  const previewEffect: AdminEffectAdded = {
    ...effect,
    name: effect.name.trim() || EFFECT_KIND_LABELS[effect.effect_kind] || "Conséquence",
    value: clampedValue,
    application: isImmediate ? "immediate" : "duration",
  };
  const previewLabel = formatAdminEffectLabel(previewEffect, {
    rosterUnits: rosterUnitIds,
    countries: countriesList,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
        <p className="text-xs text-[var(--foreground-muted)]">Conséquence prévue</p>
        <p className="mt-0.5 font-medium text-[var(--foreground)]">{previewLabel}</p>
        <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
          {isImmediate
            ? "Appliquée une seule fois lors de l’acceptation."
            : effect.duration_kind === "permanent"
              ? "Reste active sans date de fin."
              : `Reste active pendant ${effect.duration_remaining} jour${effect.duration_remaining > 1 ? "s" : ""}.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${fieldLabelClass} sm:col-span-2`}>
          Conséquence
          <select
            value={effect.effect_kind}
            onChange={(e) => {
              const newKind = e.target.value;
              const needS = EFFECT_KINDS_WITH_STAT_TARGET.has(newKind);
              const needB = EFFECT_KINDS_WITH_BUDGET_TARGET.has(newKind);
              const needBr = EFFECT_KINDS_WITH_BRANCH_TARGET.has(newKind);
              const needR = EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(newKind);
              const needSub = EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(newKind);
              const needC = EFFECT_KINDS_WITH_COUNTRY_TARGET.has(newKind);
              const target = needS
                ? "militarism"
                : needB
                  ? (getBudgetMinistryOptions()[0]?.key ?? null)
                  : needBr
                    ? MILITARY_BRANCH_EFFECT_IDS[0]
                    : needR
                      ? (rosterUnitIds[0]?.id ?? null)
                      : needSub
                        ? (subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP)
                        : needC
                          ? (otherCountries[0]?.id ?? null)
                          : null;
              onChange(normalizeEffectApplication({
                ...effect,
                effect_kind: newKind,
                effect_target: target,
                effect_subtype: null,
                application: newKind.startsWith("ideology_snap_")
                  ? "immediate"
                  : IMMEDIATE_EFFECT_KINDS.has(newKind)
                    ? effect.application
                    : "duration",
              }));
            }}
            className={fieldClass}
            style={{ borderColor: "var(--border)" }}
          >
            {kindGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {needsStatTarget ? (
          <label className={fieldLabelClass}>
            Statistique concernée
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              {Object.entries(STAT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        ) : null}
        {needsBudgetTarget ? (
          <label className={fieldLabelClass}>
            Ministère concerné
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              {getBudgetMinistryOptions().map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        ) : null}
        {needsBranchTarget ? (
          <label className={fieldLabelClass}>
            Branche concernée
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              {Object.entries(MILITARY_BRANCH_EFFECT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        ) : null}
        {needsRosterTarget ? (
          <label className={fieldLabelClass}>
            Unité concernée
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              <option value="">— Choisir une unité —</option>
              {rosterUnitIds.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_fr}</option>)}
            </select>
          </label>
        ) : null}
        {needsSubTypeTarget ? (
          <label className={fieldLabelClass}>
            Type d’unité concerné
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              <option value="">— Choisir un type —</option>
              {subTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
        {needsCountryTarget ? (
          <label className={fieldLabelClass}>
            Autre pays concerné
            <select value={effect.effect_target ?? ""} onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })} className={fieldClass} style={{ borderColor: "var(--border)" }}>
              <option value="">— Choisir un pays —</option>
              {otherCountries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
          </label>
        ) : null}

        <label className={fieldLabelClass}>
          {helper.valueLabel}
          <input
            type="number"
            step={helper.valueStep}
            value={displayValue}
            onChange={(e) => {
              const raw = helper.displayToStored(Number(e.target.value));
              const nextValue = Number.isNaN(raw) ? 0 : Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, raw));
              onChange({ ...effect, value: nextValue });
            }}
            className={fieldClass}
            style={{ borderColor: "var(--border)" }}
          />
        </label>

        <label className={fieldLabelClass}>
          Moment d’application
          <select
            value={isImmediate ? "immediate" : "duration"}
            onChange={(e) => onChange({ ...effect, application: e.target.value as "immediate" | "duration" })}
            className={fieldClass}
            style={{ borderColor: "var(--border)" }}
          >
            {!immediateOnly && <option value="duration">Dans la durée</option>}
            {supportsImmediate && <option value="immediate">Une seule fois</option>}
          </select>
        </label>

        {!isImmediate ? (
          <>
            <label className={fieldLabelClass}>
              Durée
              <select
                value={effect.duration_kind === "updates" ? "days" : effect.duration_kind}
                onChange={(e) => onChange({
                  ...effect,
                  duration_kind: e.target.value as "days" | "permanent",
                  duration_remaining: e.target.value === "permanent" ? 0 : effect.duration_remaining || 30,
                })}
                className={fieldClass}
                style={{ borderColor: "var(--border)" }}
              >
                <option value="days">Après un nombre de jours</option>
                <option value="permanent">Sans date de fin</option>
              </select>
            </label>
            {effect.duration_kind !== "permanent" ? (
              <label className={fieldLabelClass}>
                Durée en jours
                <input
                  type="number"
                  min={1}
                  max={DURATION_DAYS_MAX}
                  value={effect.duration_remaining}
                  onChange={(e) => onChange({
                    ...effect,
                    duration_remaining: Math.max(1, Math.min(DURATION_DAYS_MAX, Number(e.target.value) || 30)),
                  })}
                  className={fieldClass}
                  style={{ borderColor: "var(--border)" }}
                />
              </label>
            ) : null}
          </>
        ) : null}

        <label className={fieldLabelClass}>
          Nom personnalisé (facultatif)
          <input
            type="text"
            placeholder={EFFECT_KIND_LABELS[effect.effect_kind] ?? "Conséquence"}
            value={effect.name}
            onChange={(e) => onChange({ ...effect, name: e.target.value.slice(0, 120) })}
            maxLength={120}
            className={fieldClass}
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>

      {targetMissing ? (
        <p role="alert" className="text-sm text-[var(--danger)]">Choisissez ce que la conséquence doit modifier.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || targetMissing}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : editing ? "Enregistrer la modification" : "Ajouter à la demande"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
