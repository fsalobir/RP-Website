"use client";

import { useState, Fragment, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getModalPortalRoot } from "@/lib/modalPortal";
import {
  submitStateActionRequest,
  acceptTargetStateActionRequest,
  refuseTargetStateActionRequest,
} from "./stateActionsActions";
import { formatNumber } from "@/lib/format";
import { getRelationLabel, getRelationColor } from "@/lib/relationScale";
import {
  actionRequiresTarget,
  actionRequiresTargetAcceptance,
  getDefaultImpactMaximum,
  getStateActionImpactPreviewLabel,
  getStateActionMinRelationRequired,
  isMilitaryStateActionKey,
} from "@/lib/actionKeys";
import { normalizeAdminEffectsAdded, formatAdminEffectLabel } from "@/lib/countryEffects";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

/** Descriptions courtes pour l'infobulle de chaque type d'action. */
const ACTION_TOOLTIPS: Record<string, string> = {
  demande_up: "Demande au MJ une hausse de vos capacités (effectifs, niveau technologique, etc.) selon les règles du jeu.",
  investissements: "Investissement massif en politique interne pour stimuler l'économie ou renforcer la société. Effets appliqués après validation du MJ.",
  effort_fortifications: "Mobilisation de ressources pour construire des fortifications (AP niveau 1) dans une zone. La zone est validée par le MJ.",
  ouverture_diplomatique: "Tentative d'amélioration des relations avec un pays cible. Jet de dés ; en cas de succès, la relation bilatérale augmente.",
  accord_commercial_politique: "Proposition d'accord bilatéral (commercial, recherche, politique). La cible doit accepter avant validation par le MJ.",
  cooperation_militaire: "Proposition de coopération militaire (exercices, renseignement, mercenaires). Acceptation de la cible puis validation MJ.",
  alliance: "Proposition d'alliance ou d'intégration à une coalition. La cible doit accepter avant que le MJ ne valide.",
  insulte_diplomatique: "Action volontaire pour dégrader les relations avec un pays. Réduit la relation bilatérale en cas de succès (jet de dés).",
  prise_influence: "Tentative de prise d'influence sur un pays cible. En cas de succès, votre influence augmente (pourcentage selon le jet).",
  escarmouche_militaire: "Engagement militaire limité contre un pays (relation suffisamment hostile). Impact sur les relations selon le jet d'impact.",
  conflit_arme: "Conflit armé contre un pays. Niveau d'hostilité requis. Les effets sont déterminés par le jet et le MJ.",
  guerre_ouverte: "Guerre ouverte. Niveau d'hostilité élevé requis. Conséquences majeures selon le jet et la décision du MJ.",
  espionnage: "Opération secrète de renseignement contre un pays cible. Effets et risques selon les règles et le MJ.",
  sabotage: "Opération secrète de sabotage contre un pays cible. Effets et risques selon les règles et le MJ.",
};

/** Catégories d'actions d'état pour affichage groupé (ordre d'affichage). */
const ACTION_CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  { id: "interne", label: "Interne", keys: ["demande_up", "investissements", "effort_fortifications"] },
  { id: "diplomatie_positive", label: "Diplomatie positive", keys: ["ouverture_diplomatique", "accord_commercial_politique", "cooperation_militaire", "alliance"] },
  { id: "diplomatie_agressive", label: "Diplomatie agressive", keys: ["insulte_diplomatique", "prise_influence", "escarmouche_militaire", "conflit_arme", "guerre_ouverte"] },
  { id: "operations_secretes", label: "Opérations secrètes", keys: ["espionnage", "sabotage"] },
];

const REQUESTS_PER_PAGE = 10;

type ActionType = { id: string; key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null };
type RequestRow = {
  id: string;
  action_type_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  refusal_message: string | null;
  dice_results?: { success_roll?: { roll: number; modifier: number; total: number }; impact_roll?: { roll: number; modifier: number; total: number } } | null;
  admin_effect_added?: Record<string, unknown> | null;
  state_action_types?: { key: string; label_fr: string } | null;
};

type IncomingTargetRequest = {
  id: string;
  action_type_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  state_action_types?: { key: string; label_fr: string } | null;
  country?: { id: string; name: string; slug: string; flag_url: string | null } | null;
};

type CountryForTarget = { id: string; name: string; flag_url: string | null; regime: string | null; influence: number; relation: number };
type EmitterCountry = { name: string; flag_url: string | null; regime: string | null; influence: number | null };

type EffectLookups = {
  rosterUnits?: { id: string; name_fr: string }[];
  countries?: { id: string; name: string }[];
};

type Props = {
  countryId: string;
  types: ActionType[];
  balance: number;
  requests: RequestRow[];
  incomingTargetRequests: IncomingTargetRequest[];
  countriesForTarget: CountryForTarget[];
  emitterCountry: EmitterCountry;
  effectLookups?: EffectLookups;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

export function CountryTabStateActions({
  countryId,
  types,
  balance,
  requests,
  incomingTargetRequests,
  countriesForTarget,
  emitterCountry,
  effectLookups,
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
  const [refusingId, setRefusingId] = useState<string | null>(null);
  const [refusalMessage, setRefusalMessage] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ACTION_CATEGORIES.map((c) => [c.id, true]))
  );
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (!modalType) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalType]);

  const typesByCategory = useMemo(() => {
    const keyToTypes = new Map<string, ActionType[]>();
    for (const t of types) {
      const list = keyToTypes.get(t.key) ?? [];
      list.push(t);
      keyToTypes.set(t.key, list);
    }
    return ACTION_CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.keys.flatMap((key) => keyToTypes.get(key) ?? []),
    }));
  }, [types]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const typeLabel = (r.state_action_types?.label_fr ?? "").toLowerCase();
      const targetName = r.payload?.target_country_id
        ? (countriesForTarget.find((c) => c.id === r.payload?.target_country_id)?.name ?? "").toLowerCase()
        : "";
      const message = (typeof r.payload?.message === "string" ? r.payload.message : "").toLowerCase();
      const zone = (typeof r.payload?.zone === "string" ? r.payload.zone : "").toLowerCase();
      const status = r.status.toLowerCase();
      return typeLabel.includes(q) || targetName.includes(q) || message.includes(q) || zone.includes(q) || status.includes(q);
    });
  }, [requests, historySearch, countriesForTarget]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / REQUESTS_PER_PAGE));
  const historyEffectivePage = Math.min(historyPage, historyTotalPages);
  const paginatedHistory = useMemo(() => {
    const start = (historyEffectivePage - 1) * REQUESTS_PER_PAGE;
    return filteredHistory.slice(start, start + REQUESTS_PER_PAGE);
  }, [filteredHistory, historyEffectivePage]);

  async function handleConfirm() {
    if (!modalType) return;
    if (modalType.cost > balance) {
      setError(`Solde insuffisant (${balance} action(s), coût ${modalType.cost}).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    if (actionRequiresTarget(modalType.key)) {
      if (!targetCountryId) {
        setError("Veuillez choisir un pays cible.");
        setSubmitting(false);
        return;
      }
      const targetCountry = countriesForTarget.find((country) => country.id === targetCountryId) ?? null;
      const minRelationRequired = getStateActionMinRelationRequired(modalType.key, modalType.params_schema);
      if (minRelationRequired !== null && targetCountry && targetCountry.relation > minRelationRequired) {
        setError(`Relation insuffisamment hostile. Cette action exige ${minRelationRequired} ou moins.`);
        setSubmitting(false);
        return;
      }
      payload.target_country_id = targetCountryId;
    }
    if (modalType.key === "demande_up") {
      payload.message = message.trim() || "(Demande libre)";
    }
    if (modalType.key === "effort_fortifications") {
      payload.message = message.trim() || null;
    }
    if (modalType.key === "investissements") {
      payload.message = message.trim() || null;
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
        <div className="space-y-0">
          {typesByCategory.map(({ id, label, types: catTypes }) => {
            if (catTypes.length === 0) return null;
            const isOpen = categoriesOpen[id] ?? true;
            return (
              <div
                key={id}
                className="mb-8 rounded-lg border-2 last:mb-0"
                style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
              >
                <button
                  type="button"
                  onClick={() => setCategoriesOpen((prev) => ({ ...prev, [id]: !prev[id] }))}
                  className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left transition-colors hover:opacity-90"
                  style={{ background: "var(--background-elevated)" }}
                >
                  <span className="text-base font-semibold text-[var(--foreground)]">
                    {label}
                  </span>
                  <span
                    className="block shrink-0 transition-transform duration-300 ease-out"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    aria-hidden
                  >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--foreground-muted)]">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
                <div
                  className="grid"
                  style={{
                    gridTemplateRows: isOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 0.25s ease-out",
                  }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="border-t py-1" style={{ borderColor: "var(--border-muted)" }}>
                      <ul className="space-y-2 p-3">
                        {catTypes.map((t) => (
                          <li
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                            style={{ borderColor: "var(--border-muted)" }}
                          >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-medium text-[var(--foreground)]">{t.label_fr}</span>
                            <InfoTooltip
                              content={ACTION_TOOLTIPS[t.key] ?? "Action d'état."}
                              side="top"
                            />
                            <span className="text-sm text-[var(--foreground-muted)]">
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
                            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0"
                          >
                            Lancer
                          </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {incomingTargetRequests.length > 0 && (
        <section className={pClass} style={pStyle}>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            Demandes vous concernant
          </h2>
          <p className="mb-4 text-sm text-[var(--foreground-muted)]">
            Ces demandes vous ciblent. Acceptez ou refusez avant qu&apos;elles ne soient transmises au MJ.
          </p>
          <ul className="space-y-3">
            {incomingTargetRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border py-3 px-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {r.state_action_types?.label_fr ?? "Demande"} — de {r.country?.name ?? "…"}
                  </p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {refusingId === r.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={refusalMessage}
                        onChange={(e) => setRefusalMessage(e.target.value.slice(0, 200))}
                        placeholder="Message optionnel (transmis à l'émetteur)"
                        rows={2}
                        className="rounded border bg-[var(--background)] px-2 py-1 text-sm"
                        style={{ borderColor: "var(--border)", minWidth: 200 }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setSubmitting(true);
                            setError(null);
                            const result = await refuseTargetStateActionRequest(r.id, refusalMessage);
                            setSubmitting(false);
                            if (result.error) setError(result.error);
                            else {
                              setRefusingId(null);
                              setRefusalMessage("");
                              router.refresh();
                            }
                          }}
                          disabled={submitting}
                          className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirmer le refus
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRefusingId(null); setRefusalMessage(""); }}
                          className="rounded border px-3 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          setSubmitting(true);
                          setError(null);
                          const result = await acceptTargetStateActionRequest(r.id);
                          setSubmitting(false);
                          if (result.error) setError(result.error);
                          else router.refresh();
                        }}
                        disabled={submitting}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => setRefusingId(r.id)}
                        className="rounded border border-red-500/50 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
                      >
                        Refuser
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={pClass} style={pStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Historique des demandes
        </h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Consultez l&apos;état et le détail de vos demandes d&apos;actions d&apos;État.
        </p>
        <div className="mb-4">
          <label htmlFor="history-search" className="mb-1 block text-sm text-[var(--foreground-muted)]">
            Rechercher
          </label>
          <input
            id="history-search"
            type="search"
            value={historySearch}
            onChange={(e) => {
              setHistorySearch(e.target.value);
              setHistoryPage(1);
            }}
            placeholder="Type, cible, message, statut…"
            className="w-full max-w-md rounded border bg-[var(--background)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderColor: "var(--border)" }}>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Date</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Type</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Cible / Résumé</th>
                <th className="border-b p-2 text-left font-medium text-[var(--foreground-muted)]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistory.map((r) => {
                const targetName = r.payload?.target_country_id
                  ? countriesForTarget.find((c) => c.id === r.payload?.target_country_id)?.name ?? null
                  : null;
                const messageExcerpt = typeof r.payload?.message === "string" ? r.payload.message : null;
                const zone = typeof r.payload?.zone === "string" ? r.payload.zone : null;
                const summary = targetName ?? (messageExcerpt ? (messageExcerpt.slice(0, 50) + (messageExcerpt.length > 50 ? "…" : "")) : null) ?? (zone ? (zone.slice(0, 50) + (zone.length > 50 ? "…" : "")) : null) ?? "—";
                const isExpanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--background)]"
                      style={{
                        borderColor: "var(--border)",
                        background: isExpanded ? "var(--background-elevated)" : undefined,
                      }}
                    >
                      <td className="border-b p-2 text-[var(--foreground)]">
                        {new Date(r.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="border-b p-2 text-[var(--foreground)]">
                        {r.state_action_types?.label_fr ?? r.action_type_id}
                      </td>
                      <td className="border-b p-2 text-[var(--foreground)]">{summary}</td>
                      <td className="border-b p-2">
                        <StatusBadge status={r.status} request={r} types={types} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderColor: "var(--border)" }}>
                        <td colSpan={4} className="border-b bg-[var(--background)] p-4">
                          <RequestDetailView
                            request={r}
                            countriesForTarget={countriesForTarget}
                            types={types}
                            effectLookups={effectLookups}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredHistory.length === 0 && (
          <p className="mt-4 text-sm text-[var(--foreground-muted)]">
            {requests.length === 0 ? "Aucune demande pour l'instant." : "Aucun résultat pour cette recherche."}
          </p>
        )}
        {filteredHistory.length > REQUESTS_PER_PAGE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm text-[var(--foreground-muted)]">
              Affichage {(historyEffectivePage - 1) * REQUESTS_PER_PAGE + 1}–
              {Math.min(historyEffectivePage * REQUESTS_PER_PAGE, filteredHistory.length)} sur {filteredHistory.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyEffectivePage === 1}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                disabled={historyEffectivePage === historyTotalPages}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </section>

      {modalType &&
        createPortal(
          <div
            className="fixed inset-0 overflow-y-auto bg-black/50"
            style={{ zIndex: 100001 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="flex min-h-full items-center justify-center p-4 py-10">
              <div
                className="w-full max-w-lg max-h-[min(85dvh,calc(100dvh-5rem))] overflow-y-auto overscroll-contain rounded-lg border p-6 shadow-lg"
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
            ) : isMilitaryStateActionKey(modalType.key) ? (
              <MilitaryActionModalContent
                actionKey={modalType.key}
                actionLabel={modalType.label_fr}
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
            ) : modalType.key === "accord_commercial_politique" ? (
              <BilateralAgreementModalContent
                title="Accord commercial ou politique"
                description="Nous souhaitons conclure un accord bilatéral (commercial, de recherche, politique, etc.) avec ce pays."
                effectText="Si la cible accepte, puis que le MJ valide, les effets de l'accord (PIB, relations, etc.) seront appliqués."
                note="La cible doit d'abord accepter cet accord avant qu'il ne soit transmis au MJ pour validation."
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
            ) : modalType.key === "cooperation_militaire" ? (
              <BilateralAgreementModalContent
                title="Coopération militaire"
                description="Nous proposons une coopération militaire (exercices conjoints, partage de renseignement, envoi de mercenaires ou support physique) avec ce pays."
                effectText="Si la cible accepte, puis que le MJ valide, les effets de la coopération seront appliqués selon le RP."
                note="La cible doit d'abord accepter cette coopération avant qu'elle ne soit transmise au MJ pour validation."
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
            ) : modalType.key === "alliance" ? (
              <BilateralAgreementModalContent
                title="Alliance"
                description="Nous souhaitons former une alliance ou intégrer une coalition avec ce pays."
                effectText="Si la cible accepte, puis que le MJ valide, l'alliance sera officialisée et ses effets appliqués."
                note="La cible doit impérativement accepter cette alliance avant qu'elle ne soit transmise au MJ pour validation."
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
            ) : modalType.key === "espionnage" ? (
              <CovertOpModalContent
                title="Espionnage"
                description="Nous déployons des agents de renseignement pour récolter des informations sur ce pays (armée, stats, avantages, etc.)."
                effectText="Si validé par le MJ, les résultats de l'opération d'espionnage seront communiqués. La cible n'est pas informée de la demande."
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
            ) : modalType.key === "sabotage" ? (
              <CovertOpModalContent
                title="Sabotage"
                description="Nous infiltrons des commandos pour mener une opération de sabotage contre ce pays."
                effectText="Si validé par le MJ, les conséquences du sabotage seront appliquées selon le RP. La cible n'est pas informée de la demande."
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
            ) : modalType.key === "effort_fortifications" ? (
              <InternalActionModalContent
                title="Effort de fortifications"
                description="Nous mobilisons des ressources pour construire des fortifications (AP lvl1) dans une zone stratégique."
                effectText="Si validé par le MJ, les fortifications seront créées dans la zone déterminée par l'administration. Cette action consomme du budget."
                cost={modalType.cost}
                emitterCountry={emitterCountry}
                message={message}
                onMessageChange={(v) => setMessage(v.slice(0, 500))}
                messagePlaceholder="Indiquez la zone ou une description pour le MJ…"
                messageLabel="Zone ou description (optionnel)"
                messageHint="La zone exacte sera déterminée par le MJ."
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : modalType.key === "investissements" ? (
              <InternalActionModalContent
                title="Investissements"
                description="Nous investissons massivement dans notre politique interne pour stimuler notre économie ou renforcer notre société."
                effectText="Si validé par le MJ, les effets de l'investissement seront appliqués sur notre pays (PIB, stats, etc.)."
                cost={modalType.cost}
                emitterCountry={emitterCountry}
                message={message}
                onMessageChange={(v) => setMessage(v.slice(0, 500))}
                messagePlaceholder="Décrivez vos investissements (infrastructure, éducation, industrie, etc.)…"
                messageLabel="Description (optionnel)"
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : modalType.key === "demande_up" ? (
              <DemandeUpModalContent
                cost={modalType.cost}
                emitterCountry={emitterCountry}
                message={message}
                onMessageChange={(v) => setMessage(v.slice(0, 500))}
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            ) : (
              <GenericActionModalContent
                title={modalType.label_fr}
                cost={modalType.cost}
                requiresTarget={actionRequiresTarget(modalType.key)}
                countriesForTarget={countriesForTarget}
                targetCountryId={targetCountryId}
                onTargetChange={setTargetCountryId}
                showMessage={modalType.key === "demande_up"}
                message={message}
                onMessageChange={(v) => setMessage(v.slice(0, 500))}
                error={error}
                submitting={submitting}
                onConfirm={handleConfirm}
                onCancel={() => setModalType(null)}
              />
            )}
              </div>
            </div>
          </div>,
          getModalPortalRoot()
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

function MilitaryActionModalContent({
  actionKey,
  actionLabel,
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
  actionKey: "escarmouche_militaire" | "conflit_arme" | "guerre_ouverte";
  actionLabel: string;
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
  const minRelationRequired = getStateActionMinRelationRequired(actionKey, paramsSchema);
  const description =
    actionKey === "escarmouche_militaire"
      ? "Nous déclenchons une action militaire limitée contre ce pays."
      : actionKey === "conflit_arme"
        ? "Nous faisons franchir un cap militaire majeur à notre confrontation avec ce pays."
        : "Nous assumons une guerre ouverte contre ce pays.";
  const impactText =
    actionKey === "escarmouche_militaire"
      ? "Si validé par le MJ, un jet de succès puis un jet d'impact détermineront la dégradation des relations provoquée par l'escarmouche."
      : actionKey === "conflit_arme"
        ? "Si validé par le MJ, un jet de succès puis un jet d'impact détermineront l'ampleur de la rupture diplomatique provoquée par le conflit."
        : "Si validé par le MJ, un jet de succès puis un jet d'impact détermineront la violence de la rupture diplomatique liée à la guerre ouverte.";

  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        {actionLabel}
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> {description}</p>
        {minRelationRequired !== null && (
          <p><strong className="text-[var(--foreground)]">Pré-requis :</strong> relation bilatérale de {minRelationRequired} ou moins.</p>
        )}
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
        impactText={impactText}
        relationRequirement={minRelationRequired}
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
  relationRequirement = null,
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
  relationRequirement?: number | null;
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
                <p className="text-xs" style={{ color: getRelationColor(targetCountry.relation) }}>
                  Relation : {targetCountry.relation} ({getRelationLabel(targetCountry.relation)})
                </p>
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
        {relationRequirement !== null && (
          <p>
            Seuil requis : <strong className="text-[var(--foreground)]">{relationRequirement}</strong>
            {targetCountry ? (
              <>
                {" "}· relation actuelle :{" "}
                <strong style={{ color: getRelationColor(targetCountry.relation) }}>
                  {targetCountry.relation}
                </strong>
              </>
            ) : null}
          </p>
        )}
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

function BilateralAgreementModalContent({
  title,
  description,
  effectText,
  note,
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
  title: string;
  description: string;
  effectText: string;
  note: string;
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
        {title}
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> {description}</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> {effectText}</p>
      </div>

      <div className="mt-3 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
        {note}
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

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
                <p className="text-xs" style={{ color: getRelationColor(targetCountry.relation) }}>
                  Relation : {targetCountry.relation} ({getRelationLabel(targetCountry.relation)})
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
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function CovertOpModalContent({
  title,
  description,
  effectText,
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
  title: string;
  description: string;
  effectText: string;
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
        {title}
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> {description}</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> {effectText}</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

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
                <p className="text-xs" style={{ color: getRelationColor(targetCountry.relation) }}>
                  Relation : {targetCountry.relation} ({getRelationLabel(targetCountry.relation)})
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">Choisissez un pays cible ci-dessous.</p>
          )}
        </div>
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
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function DemandeUpModalContent({
  cost,
  emitterCountry,
  message,
  onMessageChange,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  cost: number;
  emitterCountry: EmitterCountry;
  message: string;
  onMessageChange: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        Demande d&apos;up nombre / tech
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p>
          <strong className="text-[var(--foreground)]">Description :</strong> Nous demandons au MJ une hausse de nos capacités (effectifs, niveau technologique, ou autre) selon les règles du jeu.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">Effet :</strong> Si le MJ accepte la demande, les modifications (unités, tech, etc.) seront appliquées selon sa décision.
        </p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Votre pays</p>
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

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="mb-4">
        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Message pour le MJ (optionnel)</label>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Précisez ce que vous souhaitez (type d'unité, tech, effectifs, zone, etc.)…"
          rows={4}
          className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">Si vide, « (Demande libre) » sera envoyé.</p>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="mb-4 text-xs text-[var(--foreground-muted)]">Coût : {cost} action(s).</p>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function InternalActionModalContent({
  title,
  description,
  effectText,
  cost,
  emitterCountry,
  message,
  onMessageChange,
  messagePlaceholder,
  messageLabel,
  messageHint,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  effectText: string;
  cost: number;
  emitterCountry: EmitterCountry;
  message: string;
  onMessageChange: (v: string) => void;
  messagePlaceholder: string;
  messageLabel: string;
  messageHint?: string;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 id="modal-title" className="text-xl font-semibold text-[var(--foreground)]">
        {title}
      </h3>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
        <p><strong className="text-[var(--foreground)]">Description :</strong> {description}</p>
        <p><strong className="text-[var(--foreground)]">Effet :</strong> {effectText}</p>
      </div>

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Pays émetteur</p>
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

      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      <div className="mb-4">
        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">{messageLabel}</label>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          rows={3}
          placeholder={messagePlaceholder}
          maxLength={500}
          className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          {message.length}/500 caractères{messageHint ? `. ${messageHint}` : ""}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="mb-4 text-xs text-[var(--foreground-muted)]">Coût : {cost} action(s).</p>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function GenericActionModalContent({
  title,
  cost,
  requiresTarget,
  countriesForTarget,
  targetCountryId,
  onTargetChange,
  showMessage,
  message,
  onMessageChange,
  error,
  submitting,
  onConfirm,
  onCancel,
}: {
  title: string;
  cost: number;
  requiresTarget: boolean;
  countriesForTarget: CountryForTarget[];
  targetCountryId: string;
  onTargetChange: (id: string) => void;
  showMessage: boolean;
  message: string;
  onMessageChange: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 id="modal-title" className="mb-2 text-lg font-semibold text-[var(--foreground)]">
        {title}
      </h3>
      <p className="mb-4 text-sm text-[var(--foreground-muted)]">
        Coût : {cost} action(s). Confirmez les paramètres ci-dessous.
      </p>
      {requiresTarget && (
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
      )}
      {showMessage && (
        <div className="mb-4">
          <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Message (stat, unité, tech, etc.)</label>
          <textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            rows={3}
            placeholder="Décrivez votre demande…"
            maxLength={500}
            className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">{message.length}/500 caractères</p>
        </div>
      )}
      {error && (
        <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {submitting ? "Envoi…" : "Confirmer"}
        </button>
      </div>
    </>
  );
}

function getRollConclusion(roll: number, total: number): string {
  if (roll === 1) return "ÉCHEC CRITIQUE";
  if (roll === 100) return "SUCCÈS CRITIQUE";
  if (total <= 24) return "ÉCHEC MAJEUR";
  if (total <= 49) return "ÉCHEC MINEUR";
  if (total <= 74) return "SUCCÈS MINEUR";
  return "SUCCÈS MAJEUR";
}

function RequestDetailView({
  request: r,
  countriesForTarget,
  types,
  effectLookups,
  onClose,
}: {
  request: RequestRow;
  countriesForTarget: CountryForTarget[];
  types: ActionType[];
  effectLookups?: EffectLookups;
  onClose: () => void;
}) {
  const targetId = typeof r.payload?.target_country_id === "string" ? r.payload.target_country_id : null;
  const targetCountry = targetId ? countriesForTarget.find((c) => c.id === targetId) : null;
  const targetName = targetCountry ? targetCountry.name : null;
  const message = typeof r.payload?.message === "string" ? r.payload.message : null;
  const zone = typeof r.payload?.zone === "string" ? r.payload.zone : null;
  const type = types.find((t) => t.id === r.action_type_id);
  const key = r.state_action_types?.key ?? undefined;
  const paramsSchema = (type?.params_schema != null ? type.params_schema : {}) as Record<string, unknown>;
  const impactMax = key && typeof paramsSchema.impact_maximum === "number" ? Number(paramsSchema.impact_maximum) : (key ? getDefaultImpactMaximum(key) : 0);
  const impactLabel = r.dice_results?.impact_roll && key ? getStateActionImpactPreviewLabel(key, impactMax, r.dice_results.impact_roll.total) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-2 py-1 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          Fermer
        </button>
      </div>
      <dl className="grid gap-2 text-sm">
        {(targetName || message || zone) && (
          <div>
            <dt className="text-[var(--foreground-muted)]">Contenu de la demande</dt>
            <dd className="text-[var(--foreground)]">
              {targetName && <span>Cible : <strong>{targetName}</strong></span>}
              {message && <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message}</p>}
              {zone && !targetName && <span>Zone / description : {zone}</span>}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[var(--foreground-muted)]">Statut</dt>
          <dd><StatusBadge status={r.status} request={r} types={types} /></dd>
        </div>
      </dl>
      {r.dice_results && (r.dice_results.success_roll || r.dice_results.impact_roll) && (
        <div className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]">Résultats des jets</p>
          <ul className="space-y-2 text-sm text-[var(--foreground)]">
            {r.dice_results.success_roll && (
              <li>
                Jet de succès : {r.dice_results.success_roll.roll} + mod. {r.dice_results.success_roll.modifier} = <strong>{r.dice_results.success_roll.total}</strong>
                <span className="ml-2 font-medium text-[var(--accent)]">
                  — {getRollConclusion(r.dice_results.success_roll.roll, r.dice_results.success_roll.total)}
                </span>
              </li>
            )}
            {r.dice_results.impact_roll && (
              <li>
                Jet d&apos;impact : {r.dice_results.impact_roll.roll} + mod. {r.dice_results.impact_roll.modifier} = <strong>{r.dice_results.impact_roll.total}</strong>
                <span className="ml-2 font-medium text-[var(--accent)]">
                  — {getRollConclusion(r.dice_results.impact_roll.roll, r.dice_results.impact_roll.total)}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
      {impactLabel && key && (
        <div className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Impact (jet de dés)</p>
          <p className="font-semibold text-[var(--foreground)]">
            {key === "prise_influence" ? "Influence (à l'acceptation)" : "Relation bilatérale"} : {impactLabel}
          </p>
        </div>
      )}
      {(() => {
        const effectsList = normalizeAdminEffectsAdded(r.admin_effect_added);
        if (effectsList.length === 0) return null;
        return (
          <div className="rounded border p-3" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Effets ajoutés par le MJ</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[var(--foreground)]">
              {effectsList.map((effect, i) => (
                <li key={i}>{formatAdminEffectLabel(effect, effectLookups)}</li>
              ))}
            </ul>
          </div>
        );
      })()}
      {r.refusal_message && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-red-400 mb-1">Message de refus</p>
          <p className="text-sm text-red-300 break-words [overflow-wrap:anywhere]">{r.refusal_message}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  request,
  types,
}: {
  status: string;
  request?: RequestRow;
  types?: ActionType[];
}) {
  if (status === "pending") {
    const type = request && types ? types.find((t) => t.id === request.action_type_id) : null;
    const requiresTargetAcceptance = type && actionRequiresTargetAcceptance(type.key, type.params_schema);
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-amber-600 dark:text-amber-400">
        <span aria-hidden>⏳</span> {requiresTargetAcceptance ? "Accepté par la cible, en attente validation MJ" : "En attente"}
      </span>
    );
  }
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
