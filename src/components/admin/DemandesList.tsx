"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptRequest,
  refuseRequest,
  updateRequestEffect,
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
  country?: { name: string; slug: string } | null;
  state_action_types?: { key: string; label_fr: string; cost: number } | null;
};

type Props = {
  requests: RequestRow[];
  rosterUnitIds: { id: string; name_fr: string }[];
};

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

const effectKindsForDemandes = ALL_EFFECT_KIND_IDS.filter((k) => k !== "state_actions_grant");

export function DemandesList({ requests, rosterUnitIds }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = requests.find((r) => r.id === selectedId);

  function handleSuccess() {
    setError(null);
    setSelectedId(null);
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
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
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
                    {r.country?.name ?? r.country_id}
                  </td>
                  <td className="border-b p-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
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
          onClose={() => setSelectedId(null)}
          onSuccess={handleSuccess}
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
  onClose,
  onSuccess,
  onError,
}: {
  request: RequestRow;
  rosterUnitIds: { id: string; name_fr: string }[];
  onClose: () => void;
  onSuccess: () => void;
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

  const payload = request.payload ?? {};
  const isPending = request.status === "pending";

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

  async function handleSaveEffect() {
    if (!effectForm?.name || !effectForm.effect_kind) return;
    setLoading("effect");
    onError("");
    const res = await updateRequestEffect(request.id, effectForm);
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
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Détail de la demande</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        >
          Fermer
        </button>
      </div>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-[var(--foreground-muted)]">Type</dt>
          <dd className="text-[var(--foreground)]">{request.state_action_types?.label_fr ?? request.action_type_id}</dd>
        </div>
        <div>
          <dt className="text-[var(--foreground-muted)]">Pays émetteur</dt>
          <dd className="text-[var(--foreground)]">{request.country?.name ?? request.country_id}</dd>
        </div>
        <div>
          <dt className="text-[var(--foreground-muted)]">Payload</dt>
          <dd className="font-mono text-[var(--foreground)]">
            {JSON.stringify(payload)}
          </dd>
        </div>
        {request.state_action_types?.key === "insulte_diplomatique" && payload.target_country_id != null ? (
          <div>
            <dt className="text-[var(--foreground-muted)]">Pays cible</dt>
            <dd className="text-[var(--foreground)]">{String(payload.target_country_id)}</dd>
          </div>
        ) : null}
        {request.state_action_types?.key === "demande_up" && payload.message != null ? (
          <div>
            <dt className="text-[var(--foreground-muted)]">Message</dt>
            <dd className="text-[var(--foreground)]">{String(payload.message)}</dd>
          </div>
        ) : null}
        {request.refusal_message && (
          <div>
            <dt className="text-[var(--foreground-muted)]">Message de refus</dt>
            <dd className="text-[var(--foreground)]">{request.refusal_message}</dd>
          </div>
        )}
      </dl>

      {isPending && (
        <div className="mt-6 space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Modifier : ajouter un effet</h3>
            {request.admin_effect_added && typeof request.admin_effect_added === "object" && (() => {
              const e = request.admin_effect_added as unknown as AdminEffectAdded;
              return (
                <p className="mb-2 text-sm text-[var(--foreground-muted)]">
                  Effet actuellement attaché : {String(e.name)} ({String(e.effect_kind)})
                </p>
              );
            })()}
            {!showEffectForm ? (
              <button
                type="button"
                onClick={() => setShowEffectForm(true)}
                className="rounded border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                {request.admin_effect_added ? "Modifier l'effet" : "Ajouter un effet"}
              </button>
            ) : (
              <EffectFormInline
                value={effectForm}
                onChange={setEffectForm}
                rosterUnitIds={rosterUnitIds}
                onSave={handleSaveEffect}
                onCancel={() => setShowEffectForm(false)}
                saving={loading === "effect"}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleAccept}
              disabled={loading !== null}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading === "accept" ? "En cours…" : "Accepter"}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={refund}
                  onChange={(e) => setRefund(e.target.checked)}
                />
                Rembourser les actions d'État
              </label>
              <input
                type="text"
                placeholder="Message explicatif (refus)"
                value={refusalMsg}
                onChange={(e) => setRefusalMsg(e.target.value)}
                className="max-w-xs rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
              <button
                type="button"
                onClick={handleRefuse}
                disabled={loading !== null}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading === "refuse" ? "En cours…" : "Refuser"}
              </button>
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
  onSave,
  onCancel,
  saving,
}: {
  value: AdminEffectAdded | null;
  onChange: (v: AdminEffectAdded) => void;
  rosterUnitIds: { id: string; name_fr: string }[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const kind = (value?.effect_kind ?? effectKindsForDemandes[0]) as string;
  const needsStat = ["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"].includes(kind);
  const needsBudget = kind.startsWith("budget_ministry");
  const needsBranch = kind === "military_unit_limit_modifier";
  const needsRoster = ["military_unit_extra", "military_unit_tech_rate"].includes(kind);
  const defaultTarget = needsStat ? "militarism" : needsBudget ? (getBudgetMinistryOptions()[0]?.key ?? null) : needsBranch ? "terre" : needsRoster ? (rosterUnitIds[0]?.id ?? null) : null;

  const effect: AdminEffectAdded = value ?? {
    name: "",
    effect_kind: effectKindsForDemandes[0],
    effect_target: defaultTarget,
    effect_subtype: null,
    value: 0,
    duration_kind: "updates",
    duration_remaining: 30,
  };

  const kind2 = effect.effect_kind;
  const helper = getEffectKindValueHelper(kind2);
  const displayValue = helper.storedToDisplay(effect.value);

  const needsStatTarget = needsStat;
  const needsBudgetTarget = needsBudget;
  const needsBranchTarget = needsBranch;
  const needsRosterTarget = needsRoster;

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
            const t = needS ? "militarism" : needB ? (getBudgetMinistryOptions()[0]?.key ?? null) : needBr ? "terre" : needR ? (rosterUnitIds[0]?.id ?? null) : null;
            onChange({ ...effect, effect_kind: newKind, effect_target: t, effect_subtype: null });
          }}
          className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          {effectKindsForDemandes.map((k) => (
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
        <select
          value={effect.duration_kind}
          onChange={(e) =>
            onChange({
              ...effect,
              duration_kind: e.target.value,
              duration_remaining: e.target.value === "permanent" ? 0 : effect.duration_remaining,
            })
          }
          className="rounded border bg-[var(--background)] px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="updates">Mises à jour</option>
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
