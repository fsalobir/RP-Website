"use client";

import { useState } from "react";
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
  EFFECT_KIND_LABELS,
  getEffectKindValueHelper,
} from "@/lib/countryEffects";
import { STAT_LABELS } from "@/lib/countryEffects";
import { getBudgetMinistryOptions } from "@/lib/countryEffects";
import { MILITARY_BRANCH_EFFECT_LABELS } from "@/lib/countryEffects";
import type { AdminEffectAdded } from "@/types/database";
import { formatNumber } from "@/lib/format";
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
  state_action_types?: { key: string; label_fr: string; cost: number } | null;
};

type Props = {
  requests: RequestRow[];
  rosterUnitIds: { id: string; name_fr: string }[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  influenceByCountryId?: Record<string, number>;
  relationMap?: Record<string, number>;
  countriesList?: Array<{ id: string; name: string }>;
};

function getRelationFromMap(record: Record<string, number>, countryIdA: string, countryIdB: string): number {
  if (countryIdA === countryIdB) return 0;
  const [a, b] = normalizePair(countryIdA, countryIdB);
  return record[`${a}|${b}`] ?? 0;
}

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

const effectKindsForDemandes = ALL_EFFECT_KIND_IDS.filter((k) => k !== "state_actions_grant");
const effectKindsForUp = ["military_unit_extra", "military_unit_tech_rate", "stat_delta"] as const;

export function DemandesList({ requests, rosterUnitIds, targetCountriesById = {}, influenceByCountryId = {}, relationMap = {}, countriesList = [] }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = requests.find((r) => r.id === selectedId);

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
      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Demandes (du plus récent au plus ancien)
        </h2>
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
              {requests.map((r) => {
                const targetId = typeof r.payload?.target_country_id === "string" ? r.payload.target_country_id : null;
                const targetCountry = targetId ? targetCountriesById[targetId] : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--background)]"
                    style={{ borderColor: "var(--border)" }}
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
        {requests.length === 0 && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">Aucune demande.</p>
        )}
      </section>

      {selected && (
        <RequestDetail
          request={selected}
          rosterUnitIds={rosterUnitIds}
          targetCountriesById={targetCountriesById}
          influenceByCountryId={influenceByCountryId}
          relationMap={relationMap}
          countriesList={countriesList}
          onClose={() => setSelectedId(null)}
          onSuccess={handleSuccess}
          onRefresh={handleRefresh}
          onError={setError}
        />
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
  targetCountriesById = {},
  influenceByCountryId = {},
  relationMap = {},
  countriesList = [],
  onClose,
  onSuccess,
  onRefresh,
  onError,
}: {
  request: RequestRow;
  rosterUnitIds: { id: string; name_fr: string }[];
  targetCountriesById?: Record<string, { name: string; flag_url: string | null; regime?: string | null }>;
  influenceByCountryId?: Record<string, number>;
  relationMap?: Record<string, number>;
  countriesList?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
  onRefresh: () => void;
  onError: (s: string) => void;
}) {
  const [refund, setRefund] = useState(false);
  const [refusalMsg, setRefusalMsg] = useState("");
  const [loading, setLoading] = useState<"accept" | "refuse" | "effect" | null>(null);
  const [effectForm, setEffectForm] = useState<AdminEffectAdded | null>(() => {
    const e = request.admin_effect_added;
    if (e && typeof e === "object" && (e as Record<string, unknown>).name && (e as Record<string, unknown>).effect_kind)
      return e as unknown as AdminEffectAdded;
    return null;
  });
  const [showEffectForm, setShowEffectForm] = useState(false);
  const [effectFormIsUp, setEffectFormIsUp] = useState(false);
  const [diceLoading, setDiceLoading] = useState<"success" | "impact" | null>(null);
  const [adminModifierStr, setAdminModifierStr] = useState("0");
  const [adminModifierLabel, setAdminModifierLabel] = useState("");

  function parseModifierStr(s: string): number {
    const t = s.trim();
    if (t === "" || t === "-") return 0;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  const payload = request.payload ?? {};
  const isPending = request.status === "pending";
  const targetId = typeof payload.target_country_id === "string" ? payload.target_country_id : null;
  const targetCountry = targetId ? targetCountriesById[targetId] : null;
  const hasTarget = targetCountry != null;

  async function handleAccept() {
    if (!isPending) return;
    setLoading("accept");
    onError("");
    const res = await acceptRequest(request.id);
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  async function handleRefuse() {
    if (!isPending) return;
    setLoading("refuse");
    onError("");
    const res = await refuseRequest(request.id, refund, refusalMsg);
    setLoading(null);
    if (res.error) onError(res.error);
    else onSuccess();
  }

  async function handleSaveEffect(isUp: boolean) {
    if (!effectForm?.name || !effectForm.effect_kind) return;
    setLoading("effect");
    onError("");
    const payload: AdminEffectAdded = {
      ...effectForm,
      application: isUp ? "immediate" : "duration",
    };
    const res = await updateRequestEffect(request.id, payload);
    setLoading(null);
    if (res.error) onError(res.error);
    else {
      onSuccess();
      setShowEffectForm(false);
    }
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
          className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        >
          Fermer
        </button>
      </div>

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

      {request.state_action_types?.key === "demande_up" && payload.message != null && (
        <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <dt className="text-[var(--foreground-muted)]">Message</dt>
          <dd className="text-[var(--foreground)]">{String(payload.message)}</dd>
        </dl>
      )}
      {request.refusal_message && (
        <dl className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
          <dt className="text-[var(--foreground-muted)]">Message de refus</dt>
          <dd className="text-[var(--foreground)]">{request.refusal_message}</dd>
        </dl>
      )}

      {(request.state_action_types?.key === "insulte_diplomatique" || request.state_action_types?.key === "ouverture_diplomatique" || request.state_action_types?.key === "prise_influence") && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Jets de dés</h3>
          {isPending && (
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
              onChange={(e) => setAdminModifierLabel(e.target.value)}
              placeholder="Ponctuel"
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Jet impact</p>
                <p className="text-sm text-[var(--foreground)]">
                  {formatRollFormula(request.dice_results.impact_roll, request.dice_results?.admin_modifiers?.[0]?.label)} = <strong className="text-lg">{request.dice_results.impact_roll.total}</strong>
                </p>
                {isPending && (
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
                {isPending && (
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
          )}
        </div>
      )}

      {isPending && (
        <div className="mt-6 space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Ajouter conséquences optionnelles</h3>
            {request.admin_effect_added && typeof request.admin_effect_added === "object" && (() => {
              const e = request.admin_effect_added as unknown as AdminEffectAdded;
              const isUp = e.application === "immediate";
              return (
                <p className="mb-2 text-sm text-[var(--foreground-muted)]">
                  {isUp ? "UP immédiat" : "Effet durable"} : {String(e.name)} ({String(e.effect_kind)})
                </p>
              );
            })()}
            {!showEffectForm ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setEffectFormIsUp(false); setShowEffectForm(true); }}
                  className="rounded border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  {request.admin_effect_added && (request.admin_effect_added as AdminEffectAdded).application !== "immediate"
                    ? "Modifier l'effet actif" : "Effet Actif"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEffectFormIsUp(true); setShowEffectForm(true); }}
                  className="rounded border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  {request.admin_effect_added && (request.admin_effect_added as AdminEffectAdded).application === "immediate"
                    ? "Modifier l'effet one-shot" : "Effet One-Shot"}
                </button>
              </div>
            ) : (
              <EffectFormInline
                value={effectForm}
                onChange={setEffectForm}
                rosterUnitIds={rosterUnitIds}
                countriesList={countriesList}
                requestCountryId={request.country_id}
                onSave={() => handleSaveEffect(effectFormIsUp)}
                onCancel={() => setShowEffectForm(false)}
                saving={loading === "effect"}
                isUpForm={effectFormIsUp}
              />
            )}
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={loading !== null}
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
                onChange={(e) => setRefusalMsg(e.target.value)}
                className="min-w-[200px] max-w-md flex-1 rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
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
  countriesList?: Array<{ id: string; name: string }>;
  requestCountryId?: string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isUpForm?: boolean;
}) {
  const kindsSource = isUpForm ? effectKindsForUp : effectKindsForDemandes;
  const kind = (value?.effect_kind ?? kindsSource[0]) as string;
  const needsStat = ["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"].includes(kind);
  const needsBudget = kind.startsWith("budget_ministry");
  const needsBranch = kind === "military_unit_limit_modifier";
  const needsRoster = ["military_unit_extra", "military_unit_tech_rate"].includes(kind);
  const needsCountry = kind === "relation_delta";
  const otherCountries = requestCountryId ? countriesList.filter((c) => c.id !== requestCountryId) : countriesList;
  const defaultTarget = needsStat ? "militarism" : needsBudget ? (getBudgetMinistryOptions()[0]?.key ?? null) : needsBranch ? "terre" : needsRoster ? (rosterUnitIds[0]?.id ?? null) : needsCountry ? (otherCountries[0]?.id ?? null) : null;

  const effect: AdminEffectAdded = value ?? {
    name: "",
    effect_kind: kindsSource[0],
    effect_target: defaultTarget,
    effect_subtype: null,
    value: 0,
    duration_kind: "days",
    duration_remaining: 30,
  };

  const kind2 = effect.effect_kind;
  const helper = getEffectKindValueHelper(kind2);
  const displayValue = helper.storedToDisplay(effect.value);

  const needsStatTarget = needsStat;
  const needsBudgetTarget = needsBudget;
  const needsBranchTarget = needsBranch;
  const needsRosterTarget = needsRoster;
  const needsCountryTarget = needsCountry;

  return (
    <div className="space-y-2 rounded border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Nom de l'effet"
          value={effect.name}
          onChange={(e) => onChange({ ...effect, name: e.target.value })}
          className="min-w-[180px] rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
        <select
          value={effect.effect_kind}
          onChange={(e) => {
            const newKind = e.target.value;
            const needS = ["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"].includes(newKind);
            const needB = newKind.startsWith("budget_ministry");
            const needBr = newKind === "military_unit_limit_modifier";
            const needR = ["military_unit_extra", "military_unit_tech_rate"].includes(newKind);
            const needC = newKind === "relation_delta";
            const t = needS ? "militarism" : needB ? (getBudgetMinistryOptions()[0]?.key ?? null) : needBr ? "terre" : needR ? (rosterUnitIds[0]?.id ?? null) : needC ? (otherCountries[0]?.id ?? null) : null;
            onChange({ ...effect, effect_kind: newKind, effect_target: t, effect_subtype: null });
          }}
          className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          {(isUpForm ? effectKindsForUp : effectKindsForDemandes).map((k) => (
            <option key={k} value={k}>{EFFECT_KIND_LABELS[k] ?? k}</option>
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
          onChange={(e) =>
            onChange({
              ...effect,
              value: helper.displayToStored(Number(e.target.value)),
            })
          }
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
                value={effect.duration_remaining}
                onChange={(e) =>
                  onChange({ ...effect, duration_remaining: Number(e.target.value) || 30 })
                }
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
