"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

/** Liste complète des effets disponibles (actifs et one-shot) dans les demandes et ailleurs. Exclut state_actions_grant. */
const effectKindsForDemandes = ALL_EFFECT_KIND_IDS.filter((k) => k !== "state_actions_grant");
const REQUESTS_PER_PAGE = 10;

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
  if (status === "pending_target") return "en attente acceptation cible";
  if (status === "target_refused") return "refusee par cible";
  if (status === "accepted") return "acceptee";
  if (status === "refused") return "refusee";
  return status;
}

export function DemandesList({ requests, rosterUnitIds, rosterUnits = [], targetCountriesById = {}, influenceByCountryId = {}, relationMap = {}, countriesList = [], espionageIntelGainBase }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      const actionable = (s: string) => (s === "pending" || s === "pending_target" ? 0 : 1);
      const statusA = actionable(a.status);
      const statusB = actionable(b.status);
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const tokens = normalizeSearchValue(searchQuery).split(" ").filter(Boolean);
    if (tokens.length === 0) return sortedRequests;

    return sortedRequests.filter((request) => {
      const targetId = typeof request.payload?.target_country_id === "string" ? request.payload.target_country_id : null;
      const targetCountry = targetId ? targetCountriesById[targetId] : null;
      const haystack = normalizeSearchValue([
        request.state_action_types?.label_fr ?? "",
        request.state_action_types?.key ?? "",
        request.country?.name ?? "",
        targetCountry?.name ?? "",
        typeof request.payload?.message === "string" ? request.payload.message : "",
        request.refusal_message ?? "",
        getStatusLabel(request.status),
      ].join(" "));

      return tokens.every((token) => haystack.includes(token));
    });
  }, [requests, searchQuery, sortedRequests, targetCountriesById]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedId && !filteredRequests.some((request) => request.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredRequests, selectedId]);

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * REQUESTS_PER_PAGE;
    return filteredRequests.slice(start, start + REQUESTS_PER_PAGE);
  }, [currentPage, filteredRequests]);

  const selected = filteredRequests.find((r) => r.id === selectedId) ?? sortedRequests.find((r) => r.id === selectedId);

  function handleSuccess() {
    setError(null);
    setSelectedId(null);
    router.refresh();
  }

  function handleRefresh() {
    setError(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {selected && (
        <RequestDetail
          request={selected}
          rosterUnitIds={rosterUnitIds}
          rosterUnits={rosterUnits}
          targetCountriesById={targetCountriesById}
          influenceByCountryId={influenceByCountryId}
          relationMap={relationMap}
          countriesList={countriesList}
          espionageIntelGainBase={espionageIntelGainBase}
          onClose={() => setSelectedId(null)}
          onSuccess={handleSuccess}
          onRefresh={handleRefresh}
          onError={setError}
        />
      )}

      <section className={panelClass} style={panelStyle}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Demandes
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Les demandes en attente restent toujours en tête. Affichage par pages de 10.
            </p>
          </div>
          <div className="w-full max-w-xl">
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Recherche dynamique</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: Prise d'influence Russie"
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--foreground-muted)]">
          <span>{filteredRequests.length} demande(s) trouvée(s)</span>
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
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Pays</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Cible</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.map((r) => {
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
                        {r.country?.flag_url && (
                          <span className="sr-only">{r.country.name}</span>
                        )}
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
                          <span title={targetCountry.name} className="text-[var(--foreground-muted)]">
                            {targetCountry.name}
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--foreground-muted)]">—</span>
                      )}
                    </td>
                    <td className="border-b p-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRequests.length === 0 && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">Aucune demande.</p>
        )}
        {filteredRequests.length > REQUESTS_PER_PAGE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm text-[var(--foreground-muted)]">
              Affichage {Math.min((currentPage - 1) * REQUESTS_PER_PAGE + 1, filteredRequests.length)}-
              {Math.min(currentPage * REQUESTS_PER_PAGE, filteredRequests.length)} sur {filteredRequests.length}
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
        <span aria-hidden>⏳</span> En attente acceptation cible
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
  rosterUnitIds,
  rosterUnits = [],
  targetCountriesById = {},
  influenceByCountryId = {},
  relationMap = {},
  countriesList = [],
  espionageIntelGainBase,
  onClose,
  onSuccess,
  onRefresh,
  onError,
}: {
  request: RequestRow;
  rosterUnitIds: { id: string; name_fr: string }[];
  rosterUnits?: RosterUnitForSubType[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  influenceByCountryId?: Record<string, number>;
  relationMap?: Record<string, number>;
  countriesList?: Array<{ id: string; name: string }>;
  espionageIntelGainBase?: number;
  onClose: () => void;
  onSuccess: () => void;
  onRefresh: () => void;
  onError: (s: string) => void;
}) {
  const [refund, setRefund] = useState(false);
  const [refusalMsg, setRefusalMsg] = useState("");
  const [loading, setLoading] = useState<"accept" | "refuse" | "effect" | null>(null);
  const effectsList = normalizeAdminEffectsAdded(request.admin_effect_added);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [effectForm, setEffectForm] = useState<AdminEffectAdded | null>(null);
  const [showEffectForm, setShowEffectForm] = useState(false);
  const [effectFormIsUp, setEffectFormIsUp] = useState(false);
  const [diceLoading, setDiceLoading] = useState<"success" | "impact" | null>(null);
  const [adminModifierStr, setAdminModifierStr] = useState("0");
  const [adminModifierLabel, setAdminModifierLabel] = useState("");
  const effectEntries = effectsList.map((effect, index) => ({ effect, index }));
  const durationEffectEntries = effectEntries.filter(({ effect }) => effect.application !== "immediate");
  const immediateEffectEntries = effectEntries.filter(({ effect }) => effect.application === "immediate");

  const effectLookups = { rosterUnits: rosterUnitIds, countries: countriesList };

  function parseModifierStr(s: string): number {
    const t = s.trim();
    if (t === "" || t === "-") return 0;
    const n = parseInt(t, 10);
    if (Number.isNaN(n)) return 0;
    if (n > 100) return 100;
    if (n < -100) return -100;
    return n;
  }

  const payload = request.payload ?? {};
  const isAdminActionable = request.status === "pending";
  /** Admin peut refuser même en attente cible (alliance / coopération militaire) pour éviter que les demandes pourrissent. */
  const adminCanRefuse = request.status === "pending" || request.status === "pending_target";
  const targetId = typeof payload.target_country_id === "string" ? payload.target_country_id : null;
  const targetCountry = targetId ? targetCountriesById[targetId] : null;
  const hasTarget = targetCountry != null;

  async function handleAccept() {
    if (!isAdminActionable) return;
    setLoading("accept");
    onError("");
    const res = await acceptRequest(request.id);
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  async function handleRefuse() {
    if (!adminCanRefuse) return;
    setLoading("refuse");
    onError("");
    const res = await refuseRequest(request.id, refund, refusalMsg);
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  const EFFECT_VALUE_MIN = -1000;
  const EFFECT_VALUE_MAX = 1000;

  async function handleSaveEffect(isUp: boolean) {
    if (!effectForm?.name || !effectForm.effect_kind) return;
    setLoading("effect");
    onError("");
    const clampedValue = Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, Number(effectForm.value) || 0));
    const payload: AdminEffectAdded = {
      ...effectForm,
      value: clampedValue,
      duration_remaining:
        effectForm.duration_kind === "permanent"
          ? 0
          : Math.max(0, Math.min(DURATION_DAYS_MAX, Math.round(Number(effectForm.duration_remaining) || 30))),
      application: isUp ? "immediate" : "duration",
    };
    const newList =
      editingIndex !== null
        ? effectsList.map((e, i) => (i === editingIndex ? payload : e))
        : [...effectsList, payload];
    const res = await updateRequestEffect(request.id, newList);
    setLoading(null);
    if (res.error) onError(res.error);
    else {
      onRefresh();
      setShowEffectForm(false);
      setEditingIndex(null);
      setEffectForm(null);
    }
  }

  async function handleDeleteEffect(index: number) {
    setLoading("effect");
    onError("");
    const newList = effectsList.filter((_, i) => i !== index);
    const res = await updateRequestEffect(request.id, newList.length > 0 ? newList : null);
    setLoading(null);
    if (res.error) onError(res.error);
    else {
      onRefresh();
      setShowEffectForm(false);
      setEditingIndex(null);
      setEffectForm(null);
    }
  }

  function openAddEffect(isUp: boolean) {
    setEffectFormIsUp(isUp);
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
      application: isUp ? "immediate" : "duration",
    });
    setEditingIndex(null);
    setShowEffectForm(true);
  }

  function openEditEffect(index: number) {
    const e = effectsList[index];
    if (!e) return;
    setEffectForm({ ...e });
    setEffectFormIsUp(e.application === "immediate");
    setEditingIndex(index);
    setShowEffectForm(true);
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
                    title="Modifier"
                    aria-label="Modifier"
                  >
                    <span aria-hidden>✎</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEffect(index)}
                    disabled={loading !== null}
                    className="rounded p-1.5 text-[var(--foreground-muted)] hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                    title="Supprimer"
                    aria-label="Supprimer"
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
    <section className={panelClass} style={panelStyle}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {request.state_action_types?.label_fr ?? "Détail de la demande"}
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

      {request.status === "pending_target" && (
        <div className="mb-4 rounded border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          <strong>En attente acceptation par la cible.</strong> Le joueur du pays cible doit accepter cette demande avant que vous puissiez la valider ou la refuser.
        </div>
      )}

      {isAdminActionable &&
        actionRequiresTargetAcceptance(
          request.state_action_types?.key ?? "",
          request.state_action_types?.params_schema ?? null
        ) && (
          <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <strong>Accepté par la cible.</strong> En attente de votre validation.
          </div>
        )}

      <div className="flex gap-0" style={{ borderColor: "var(--border)" }}>
        <div className={hasTarget ? "flex-1 py-3 pr-4" : "flex-1 py-3"}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
            {hasTarget ? "Émetteur" : "Pays émetteur"}
          </p>
          <div className="flex items-center gap-3">
            {request.country?.flag_url ? (
              <img
                src={request.country.flag_url}
                alt=""
                className="h-10 w-14 rounded object-cover shrink-0"
              />
            ) : (
              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-[var(--background)] text-xs text-[var(--foreground-muted)]">
                Drapeau
              </div>
            )}
            <div>
              <p className="font-medium text-[var(--foreground)]">{request.country?.name ?? request.country_id}</p>
              {request.country?.regime && (
                <p className="text-xs text-[var(--foreground-muted)]">{request.country.regime}</p>
              )}
              <p className="text-xs text-[var(--accent)]">
                Influence : {request.country_id && influenceByCountryId[request.country_id] != null ? formatNumber(influenceByCountryId[request.country_id]) : "—"}
              </p>
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
                  <p className="text-xs text-[var(--accent)]">
                    Influence : {targetId && influenceByCountryId[targetId] != null ? formatNumber(influenceByCountryId[targetId]) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {hasTarget && targetId && (() => {
        const relation = getRelationFromMap(relationMap, request.country_id, targetId);
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

      {ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(request.state_action_types?.key ?? "") && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Jets de dés</h3>
          {isAdminActionable && (
            <p className="mb-2 text-xs text-[var(--foreground-muted)]">
              {request.state_action_types?.key === "prise_influence"
                ? "Les modificateurs (statistiques du pays émetteur + relations bilatérales + rang d'influence selon les amplitudes configurées) sont calculés automatiquement à chaque jet."
                : "Les modificateurs issus des statistiques du pays émetteur sont calculés automatiquement à chaque jet."}
            </p>
          )}
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
                await rollD100(request.id, "success", value !== 0 ? [{ label: adminModifierLabel.trim() || "Ponctuel", value }] : []);
                setDiceLoading(null);
                onRefresh();
              }}
              disabled={diceLoading !== null}
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
                await rollD100(request.id, "impact", value !== 0 ? [{ label: adminModifierLabel.trim() || "Ponctuel", value }] : []);
                setDiceLoading(null);
                onRefresh();
              }}
              disabled={diceLoading !== null}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {diceLoading === "impact" ? "Jet…" : "Lancer jet impact"}
            </button>
          </div>
          {request.dice_results?.success_roll && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Jet succès</p>
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Jet impact</p>
                  <p className="text-sm text-[var(--foreground)]">
                    {formatRollFormula(request.dice_results.impact_roll, request.dice_results?.admin_modifiers?.[0]?.label)} = <strong className="text-lg">{request.dice_results.impact_roll.total}</strong>
                  </p>
                  {isAdminActionable && (
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                      {request.state_action_types?.key === "prise_influence"
                        ? "Utilisé pour l'impact sur l'influence à l'acceptation."
                        : "Utilisé pour le delta de relation à l'acceptation."}
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
                      onClick={async () => {
                        const { error: err } = await removeImpactRoll(request.id);
                        if (err) onError(err);
                        else onRefresh();
                      }}
                      className="rounded border px-2 py-1 text-xs text-[var(--foreground-muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                      title="Supprimer le jet impact"
                    >
                      Supprimer
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
                  <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Impact</p>
                    <p className="text-lg font-bold text-[var(--foreground)]">{impactLabel}</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {(isAdminActionable || request.status === "pending_target") && (
        <div className="mt-6 space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {isAdminActionable && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Ajouter conséquences optionnelles</h3>
            <div className="mb-3 grid gap-4 lg:grid-cols-2">
              {renderEffectEntries("Effets actifs", durationEffectEntries, "Aucun effet actif ajouté.")}
              {renderEffectEntries("Effets one-shot", immediateEffectEntries, "Aucun effet one-shot ajouté.")}
            </div>
            {!showEffectForm ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAddEffect(false)}
                  className="rounded border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  Effet Actif
                </button>
                <button
                  type="button"
                  onClick={() => openAddEffect(true)}
                  className="rounded border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  Effet One-Shot
                </button>
              </div>
            ) : (
              <EffectFormInline
                value={effectForm}
                onChange={setEffectForm}
                rosterUnitIds={rosterUnitIds}
                rosterUnits={rosterUnits}
                countriesList={countriesList}
                requestCountryId={request.country_id}
                onSave={() => handleSaveEffect(effectFormIsUp)}
                onCancel={() => { setShowEffectForm(false); setEditingIndex(null); setEffectForm(null); }}
                saving={loading === "effect"}
                isUpForm={effectFormIsUp}
              />
            )}
          </div>
          )}
          {ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(request.state_action_types?.key ?? "") &&
            !request.dice_results?.impact_roll &&
            isAdminActionable && (
              <p className="text-sm text-amber-500 dark:text-amber-400">
                Lancez le jet d&apos;impact pour pouvoir accepter cette demande.
              </p>
            )}
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={
                  !isAdminActionable ||
                  loading !== null ||
                  (ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(request.state_action_types?.key ?? "") &&
                    !request.dice_results?.impact_roll)
                }
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
            <div className="w-px shrink-0 self-stretch bg-[var(--border)]" aria-hidden />
            <div className="flex flex-1 flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={refund}
                  onChange={(e) => setRefund(e.target.checked)}
                />
                Rembourser les actions d&apos;État
              </label>
              <input
                type="text"
                placeholder="Message explicatif (refus)"
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

function EffectFormInline({
  value,
  onChange,
  rosterUnitIds,
  rosterUnits = [],
  countriesList = [],
  requestCountryId,
  onSave,
  onCancel,
  saving,
  isUpForm = false,
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
  isUpForm?: boolean;
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

  const needsStatTarget = needsStat;
  const needsBudgetTarget = needsBudget;
  const needsBranchTarget = needsBranch;
  const needsRosterTarget = needsRoster;
  const needsSubTypeTarget = needsSubType;
  const needsCountryTarget = needsCountry;

  return (
    <div className="space-y-2 rounded border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Nom de l'effet"
          value={effect.name}
          onChange={(e) => onChange({ ...effect, name: e.target.value.slice(0, 500) })}
          maxLength={500}
          className="min-w-[180px] rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
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
            const t = needS ? "militarism" : needB ? (getBudgetMinistryOptions()[0]?.key ?? null) : needBr ? MILITARY_BRANCH_EFFECT_IDS[0] : needR ? (rosterUnitIds[0]?.id ?? null) : needSub ? (subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP) : needC ? (otherCountries[0]?.id ?? null) : null;
            onChange({ ...effect, effect_kind: newKind, effect_target: t, effect_subtype: null });
          }}
          className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
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
        {needsStatTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {Object.entries(STAT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        )}
        {needsBudgetTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {getBudgetMinistryOptions().map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {needsBranchTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {Object.entries(MILITARY_BRANCH_EFFECT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        )}
        {needsRosterTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {rosterUnitIds.map((u) => (
              <option key={u.id} value={u.id}>{u.name_fr}</option>
            ))}
          </select>
        )}
        {needsSubTypeTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm min-w-[10rem]"
            style={{ borderColor: "var(--border)" }}
            title="Branche et sous-type militaire"
          >
            {subTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {needsCountryTarget && (
          <select
            value={effect.effect_target ?? ""}
            onChange={(e) => onChange({ ...effect, effect_target: e.target.value || null })}
            className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm min-w-[12rem]"
            style={{ borderColor: "var(--border)" }}
            title="Pays B (la relation est entre le pays de la demande et ce pays)"
          >
            <option value="">— Choisir un pays —</option>
            {otherCountries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <input
          type="number"
          step={helper.valueStep}
          value={displayValue}
          onChange={(e) => {
            const raw = helper.displayToStored(Number(e.target.value));
            const value = Number.isNaN(raw) ? 0 : Math.max(EFFECT_VALUE_MIN, Math.min(EFFECT_VALUE_MAX, raw));
            onChange({ ...effect, value });
          }}
          className="w-24 rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
        {!isUpForm && (
          <>
            <select
              value={effect.duration_kind === "updates" ? "days" : effect.duration_kind}
              onChange={(e) =>
                onChange({
                  ...effect,
                  duration_kind: e.target.value as "days" | "permanent",
                  duration_remaining: e.target.value === "permanent" ? 0 : effect.duration_remaining,
                })
              }
              className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="days">Jours</option>
              <option value="permanent">Permanent</option>
            </select>
            {effect.duration_kind !== "permanent" && (
              <input
                type="number"
                min={1}
                max={DURATION_DAYS_MAX}
                value={effect.duration_remaining}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(DURATION_DAYS_MAX, Number(e.target.value) || 30));
                  onChange({ ...effect, duration_remaining: v });
                }}
                className="w-20 rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !effect.name}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer l'effet"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
