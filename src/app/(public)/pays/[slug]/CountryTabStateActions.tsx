"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { submitStateActionRequest } from "./stateActionsActions";
import { formatNumber } from "@/lib/format";
import { getRelationLabel, getRelationColor } from "@/lib/relationScale";

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

type ActionType = { id: string; key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null };
type RequestRow = {
  id: string;
  action_type_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  refusal_message: string | null;
  dice_results?: { success_roll?: { roll: number; modifier: number; total: number }; impact_roll?: { roll: number; modifier: number; total: number } } | null;
  state_action_types?: { key: string; label_fr: string } | null;
};

type CountryForTarget = { id: string; name: string; flag_url: string | null; regime: string | null; influence: number; relation: number };
type EmitterCountry = { name: string; flag_url: string | null; regime: string | null; influence: number | null };

type Props = {
  countryId: string;
  types: ActionType[];
  balance: number;
  requests: RequestRow[];
  countriesForTarget: CountryForTarget[];
  emitterCountry: EmitterCountry;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

export function CountryTabStateActions({
  countryId,
  types,
  balance,
  requests,
  countriesForTarget,
  emitterCountry,
  panelClass: pClass,
  panelStyle: pStyle,
}: Props) {
  const router = useRouter();
  const [modalType, setModalType] = useState<ActionType | null>(null);
  const [targetCountryId, setTargetCountryId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleConfirm() {
    if (!modalType) return;
    if (modalType.cost > balance) {
      setError(`Solde insuffisant (${balance} action(s), coût ${modalType.cost}).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    if (modalType.key === "insulte_diplomatique" || modalType.key === "ouverture_diplomatique" || modalType.key === "prise_influence") {
      if (!targetCountryId) {
        setError("Veuillez choisir un pays cible.");
        setSubmitting(false);
        return;
      }
      payload.target_country_id = targetCountryId;
    }
    if (modalType.key === "demande_up") {
      payload.message = message.trim() || "(Demande libre)";
    }
    const result = await submitStateActionRequest(countryId, modalType.id, payload);
    setSubmitting(false);
    if (result.error) setError(result.error);
    else {
      setModalType(null);
      setTargetCountryId("");
      setMessage("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <section className={pClass} style={pStyle}>
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
          Actions d'État
        </h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Solde actuel : <strong className="font-mono text-[var(--accent)]">{balance}</strong> action(s).
        </p>
        {error && (
          <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <ul className="space-y-3">
          {types.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <span className="font-medium text-[var(--foreground)]">{t.label_fr}</span>
                <span className="ml-2 text-sm text-[var(--foreground-muted)]">
                  — coût : {t.cost} action(s)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalType(t);
                  setError(null);
                  setTargetCountryId("");
                  setMessage("");
                }}
                disabled={balance < t.cost}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Lancer
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={pClass} style={pStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Historique des demandes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderColor: "var(--border)" }}>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Date</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Type</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Résumé</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
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
                      {r.payload?.target_country_id
                        ? countriesForTarget.find((c) => c.id === r.payload?.target_country_id)?.name ?? String(r.payload?.target_country_id)
                        : typeof r.payload?.message === "string"
                          ? r.payload.message.slice(0, 40) + (r.payload.message.length > 40 ? "…" : "")
                          : "—"}
                    </td>
                    <td className="border-b p-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr style={{ borderColor: "var(--border)" }}>
                      <td colSpan={4} className="border-b bg-[var(--background)] p-3 text-sm text-[var(--foreground-muted)]">
                        {r.dice_results && (r.dice_results.success_roll || r.dice_results.impact_roll) && (
                          <div className="mb-3">
                            <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Résultats des jets</p>
                            {r.dice_results.success_roll && (
                              <p>Succès : jet {r.dice_results.success_roll.roll} + mod. {r.dice_results.success_roll.modifier} = <strong className="text-[var(--foreground)]">{r.dice_results.success_roll.total}</strong></p>
                            )}
                            {r.dice_results.impact_roll && (
                              <p>Jet impact : {r.dice_results.impact_roll.roll} + mod. {r.dice_results.impact_roll.modifier} = <strong className="text-[var(--foreground)]">{r.dice_results.impact_roll.total}</strong></p>
                            )}
                          </div>
                        )}
                        {r.dice_results?.impact_roll && (() => {
                          const key = r.state_action_types?.key;
                          if (key !== "prise_influence" && key !== "insulte_diplomatique" && key !== "ouverture_diplomatique") return null;
                          const type = types.find((t) => t.id === r.action_type_id);
                          const impactMax = type?.params_schema && typeof (type.params_schema as Record<string, unknown>).impact_maximum === "number" ? (type.params_schema as Record<string, number>).impact_maximum : (key === "prise_influence" ? 100 : 50);
                          const total = r.dice_results.impact_roll.total;
                          const impactPct = (total / 100) * impactMax;
                          const impactLabel = key === "prise_influence" ? `${Math.round(impactPct)} %` : key === "insulte_diplomatique" ? `−${Math.round(impactPct)}` : `+${Math.round(impactPct)}`;
                          return (
                            <div className="mb-3 rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Impact</p>
                              <p className="font-bold text-[var(--foreground)]">{impactLabel}</p>
                            </div>
                          );
                        })()}
                        {r.refusal_message && (
                          <p className="mt-2 text-red-400">Refus : {r.refusal_message}</p>
                        )}
                        {!r.dice_results?.success_roll && !r.dice_results?.impact_roll && (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(r.payload, null, 2)}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {requests.length === 0 && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">Aucune demande pour l'instant.</p>
        )}
      </section>

      {modalType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="mx-4 max-w-lg rounded-lg border p-6 shadow-lg"
            style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {modalType.key === "insulte_diplomatique" ? (
              <InsulteDiplomatiqueModalContent
                cost={modalType.cost}
                emitterCountry={emitterCountry}
                targetCountry={targetCountryId ? countriesForTarget.find((c) => c.id === targetCountryId) ?? null : null}
                countriesForTarget={countriesForTarget}
                targetCountryId={targetCountryId}
                onTargetChange={setTargetCountryId}
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : modalType.key === "ouverture_diplomatique" ? (
              <OuvertureDiplomatiqueModalContent
                cost={modalType.cost}
                emitterCountry={emitterCountry}
                targetCountry={targetCountryId ? countriesForTarget.find((c) => c.id === targetCountryId) ?? null : null}
                countriesForTarget={countriesForTarget}
                targetCountryId={targetCountryId}
                onTargetChange={setTargetCountryId}
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : modalType.key === "prise_influence" ? (
              <PriseInfluenceModalContent
                cost={modalType.cost}
                paramsSchema={modalType.params_schema}
                emitterCountry={emitterCountry}
                targetCountry={targetCountryId ? countriesForTarget.find((c) => c.id === targetCountryId) ?? null : null}
                countriesForTarget={countriesForTarget}
                targetCountryId={targetCountryId}
                onTargetChange={setTargetCountryId}
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : (
              <>
                <h3 id="modal-title" className="mb-2 text-lg font-semibold text-[var(--foreground)]">
                  {modalType.label_fr}
                </h3>
                <p className="mb-4 text-sm text-[var(--foreground-muted)]">
                  Coût : {modalType.cost} action(s). Confirmez les paramètres ci-dessous.
                </p>
                {(modalType.key === "insulte_diplomatique" || modalType.key === "ouverture_diplomatique") && (
                  <div className="mb-4">
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays cible</label>
                    <select
                      value={targetCountryId}
                      onChange={(e) => setTargetCountryId(e.target.value)}
                      className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="">— Choisir —</option>
                      {countriesForTarget.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {modalType.key === "demande_up" && (
                  <div className="mb-4">
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Message (stat, unité, tech, etc.)</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Décrivez votre demande d'up…"
                      className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </div>
                )}
                {error && (
                  <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="rounded border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={submitting}
                    className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {submitting ? "Envoi…" : "Confirmer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InsulteDiplomatiqueModalContent({
  cost,
  emitterCountry,
  targetCountry,
  countriesForTarget,
  targetCountryId,
  onTargetChange,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  cost: number;
  emitterCountry: EmitterCountry;
  targetCountry: CountryForTarget | null;
  countriesForTarget: CountryForTarget[];
  targetCountryId: string;
  onTargetChange: (id: string) => void;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        Insulte Diplomatique
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> Nous désirons activement détruire nos relations avec ce pays.</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> Si fructueux, réduira nos relations avec ce pays d'une certaine valeur (jet de dés).</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <DiplomatiqueModalCommon
        emitterCountry={emitterCountry}
        targetCountry={targetCountry}
        countriesForTarget={countriesForTarget}
        targetCountryId={targetCountryId}
        onTargetChange={onTargetChange}
        cost={cost}
        error={error}
        submitting={submitting}
        onConfirm={onConfirm}
        onCancel={onCancel}
        impactText="Si validé par MJ, un jet aura lieu pour estimer la réussite. En fonction de la réussite, un jet aura lieu pour estimer l'impact."
      />
    </>
  );
}

function OuvertureDiplomatiqueModalContent({
  cost,
  emitterCountry,
  targetCountry,
  countriesForTarget,
  targetCountryId,
  onTargetChange,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  cost: number;
  emitterCountry: EmitterCountry;
  targetCountry: CountryForTarget | null;
  countriesForTarget: CountryForTarget[];
  targetCountryId: string;
  onTargetChange: (id: string) => void;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        Ouverture Diplomatique
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> Nous souhaitons améliorer nos relations avec ce pays.</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> Si fructueux, augmentera nos relations avec ce pays d'une certaine valeur (jet de dés).</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <DiplomatiqueModalCommon
        emitterCountry={emitterCountry}
        targetCountry={targetCountry}
        countriesForTarget={countriesForTarget}
        targetCountryId={targetCountryId}
        onTargetChange={onTargetChange}
        cost={cost}
        error={error}
        submitting={submitting}
        onConfirm={onConfirm}
        onCancel={onCancel}
        impactText="Si validé par MJ, un jet aura lieu pour estimer la réussite. En fonction de la réussite, un jet aura lieu pour estimer l'impact sur l'amélioration des relations."
      />
    </>
  );
}

function getPriseInfluenceChancesLabel(
  ratio: number,
  paramsSchema: Record<string, unknown> | null
): string {
  const eq = (paramsSchema?.equilibre_des_forces ?? {}) as Record<string, number>;
  const ratioMin = typeof eq.ratio_min === "number" ? eq.ratio_min : 0.5;
  const ratioEquilibre = typeof eq.ratio_equilibre === "number" ? eq.ratio_equilibre : 1;
  const ratioMax = typeof eq.ratio_max === "number" ? eq.ratio_max : 2;
  if (ratio < ratioMin) return "aucune chance";
  if (ratio < ratioEquilibre) return "peu de chances";
  if (ratio >= ratioMax) return "de grandes chances";
  const t = (ratio - ratioEquilibre) / (ratioMax - ratioEquilibre);
  if (t < 1 / 3) return "peu de chances";
  if (t < 2 / 3) return "des chances correctes";
  return "de grandes chances";
}

function PriseInfluenceModalContent({
  cost,
  paramsSchema,
  emitterCountry,
  targetCountry,
  countriesForTarget,
  targetCountryId,
  onTargetChange,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  cost: number;
  paramsSchema: Record<string, unknown> | null;
  emitterCountry: EmitterCountry;
  targetCountry: CountryForTarget | null;
  countriesForTarget: CountryForTarget[];
  targetCountryId: string;
  onTargetChange: (id: string) => void;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const emitterInfluence = emitterCountry.influence ?? 0;
  const targetInfluence = targetCountry?.influence ?? 0;
  const ratio = targetInfluence > 0 ? emitterInfluence / targetInfluence : 0;
  const chancesLabel = targetCountry
    ? getPriseInfluenceChancesLabel(ratio, paramsSchema)
    : null;

  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        Prise d&apos;Influence
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> Tenter d&apos;exercer une pression sur ce pays pour accroître notre contrôle local.</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> Si validé par le MJ, nos chances dépendent de la narration, et de la différence entre notre influence et la leur.</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">
        Équilibre des puissances
      </p>
      <div className="flex gap-0">
        <div className="flex-1 py-3 pr-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Émetteur</p>
          <div className="flex items-center gap-3">
            {emitterCountry.flag_url ? (
              <img src={emitterCountry.flag_url} alt="" className="h-10 w-14 rounded object-cover shrink-0" />
            ) : (
              <div className="h-10 w-14 rounded bg-[var(--background)] shrink-0 flex items-center justify-center text-[var(--foreground-muted)] text-xs">Drapeau</div>
            )}
            <div>
              <p className="font-medium text-[var(--foreground)]">{emitterCountry.name || "—"}</p>
              {emitterCountry.regime && <p className="text-xs text-[var(--foreground-muted)]">{emitterCountry.regime}</p>}
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Influence : {emitterCountry.influence != null ? formatNumber(emitterCountry.influence) : "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="w-px shrink-0 bg-[var(--border)]" aria-hidden />
        <div className="flex-1 py-3 pl-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Cible</p>
          {targetCountry ? (
            <div className="flex items-center gap-3">
              {targetCountry.flag_url ? (
                <img src={targetCountry.flag_url} alt="" className="h-10 w-14 rounded object-cover shrink-0" />
              ) : (
                <div className="h-10 w-14 rounded bg-[var(--background)] shrink-0 flex items-center justify-center text-[var(--foreground-muted)] text-xs">Drapeau</div>
              )}
              <div>
                <p className="font-medium text-[var(--foreground)]">{targetCountry.name}</p>
                {targetCountry.regime && <p className="text-xs text-[var(--foreground-muted)]">{targetCountry.regime}</p>}
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Influence : {formatNumber(targetCountry.influence)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">Choisissez un pays cible ci-dessous.</p>
          )}
        </div>
      </div>

      {targetCountry && (
        <div className="mt-3 flex items-baseline justify-center gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs text-[var(--foreground-muted)]">Relation bilatérale :</span>
          <span className="text-sm font-medium" style={{ color: getRelationColor(targetCountry.relation) }}>
            {targetCountry.relation}
          </span>
          <span className="text-sm font-medium" style={{ color: getRelationColor(targetCountry.relation) }}>
            {getRelationLabel(targetCountry.relation)}
          </span>
        </div>
      )}

      {chancesLabel != null && (
        <>
          <hr className="my-4" style={{ borderColor: "var(--border)" }} />
          <p className="text-sm text-[var(--foreground)]">
            Notre ministère des affaires étrangères estime qu&apos;il y a <strong>{chancesLabel}</strong> que notre cible se laisse intimider.
          </p>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Les chances seront altérées par les relations diplomatiques.
          </p>
        </>
      )}

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="mb-4">
        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays cible</label>
        <select
          value={targetCountryId}
          onChange={(e) => onTargetChange(e.target.value)}
          className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">— Choisir —</option>
          {countriesForTarget.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="mb-4 text-xs text-[var(--foreground-muted)]">Coût : {cost} action(s).</p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function DiplomatiqueModalCommon({
  emitterCountry,
  targetCountry,
  countriesForTarget,
  targetCountryId,
  onTargetChange,
  cost,
  error,
  submitting,
  onConfirm,
  onCancel,
  impactText,
}: {
  emitterCountry: EmitterCountry;
  targetCountry: CountryForTarget | null;
  countriesForTarget: CountryForTarget[];
  targetCountryId: string;
  onTargetChange: (id: string) => void;
  cost: number;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  impactText: string;
}) {
  return (
    <>
      <div className="flex gap-0">
        <div className="flex-1 py-3 pr-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Émetteur</p>
          <div className="flex items-center gap-3">
            {emitterCountry.flag_url ? (
              <img src={emitterCountry.flag_url} alt="" className="h-10 w-14 rounded object-cover shrink-0" />
            ) : (
              <div className="h-10 w-14 rounded bg-[var(--background)] shrink-0 flex items-center justify-center text-[var(--foreground-muted)] text-xs">Drapeau</div>
            )}
            <div>
              <p className="font-medium text-[var(--foreground)]">{emitterCountry.name || "—"}</p>
              {emitterCountry.regime && <p className="text-xs text-[var(--foreground-muted)]">{emitterCountry.regime}</p>}
              <p className="text-xs text-[var(--accent)]">Influence : {emitterCountry.influence != null ? formatNumber(emitterCountry.influence) : "—"}</p>
            </div>
          </div>
        </div>
        <div className="w-px shrink-0 bg-[var(--border)]" aria-hidden />
        <div className="flex-1 py-3 pl-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Cible</p>
          {targetCountry ? (
            <div className="flex items-center gap-3">
              {targetCountry.flag_url ? (
                <img src={targetCountry.flag_url} alt="" className="h-10 w-14 rounded object-cover shrink-0" />
              ) : (
                <div className="h-10 w-14 rounded bg-[var(--background)] shrink-0 flex items-center justify-center text-[var(--foreground-muted)] text-xs">Drapeau</div>
              )}
              <div>
                <p className="font-medium text-[var(--foreground)]">{targetCountry.name}</p>
                {targetCountry.regime && <p className="text-xs text-[var(--foreground-muted)]">{targetCountry.regime}</p>}
                <p className="text-xs text-[var(--accent)]">Influence : {formatNumber(targetCountry.influence)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">Choisissez un pays cible ci-dessous.</p>
          )}
        </div>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-3 text-sm text-[var(--foreground-muted)]">
        <p>{impactText}</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="mb-4">
        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays cible</label>
        <select
          value={targetCountryId}
          onChange={(e) => onTargetChange(e.target.value)}
          className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">— Choisir —</option>
          {countriesForTarget.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="mb-4 text-xs text-[var(--foreground-muted)]">Coût : {cost} action(s).</p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
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
