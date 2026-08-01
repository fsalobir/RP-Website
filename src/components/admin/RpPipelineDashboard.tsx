import Link from "next/link";
import { ManualEffectsFields } from "@/components/admin/DemandesList";
import type { AdminEffectAdded } from "@/types/database";
import {
  changeActionRoll,
  classifyLoreArticle,
  createManualRpAction,
  decideRpAction,
  queueDiscordSync,
  queueDiscordDelivery,
  queueNarrativeRepair,
  retryPipelineJob,
  saveActionEffects,
  saveActionPublicFacts,
  saveActionAutomationConfig,
  saveArticleReview,
  saveCountryDiscordMapping,
  saveDiscordRoute,
  setRpPipelineEnabled,
  setRpStaffAccess,
  updateDiscordRoute,
} from "@/app/admin/event-ia/pipeline-actions";

export type RpPipelineJobView = {
  id: string;
  jobType: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  error: string | null;
  discordMessageId: string | null;
};

export type RpPipelineActionView = {
  id: string;
  createdAt: string;
  countryId: string;
  targetCountryId: string | null;
  countryName: string;
  targetName: string | null;
  actionLabel: string;
  importance: string;
  executionVersion: number;
  parentActionId: string | null;
  decisionStatus: string;
  executionStatus: string;
  roll: number | null;
  rollOutcome: string | null;
  selectionExplanation: string | null;
  publicFacts: string[];
  sourceIds: string[];
  factSheet: string | null;
  articleTitle: string | null;
  articleDescription: string | null;
  articleSections: Array<{ title: string; body: string }>;
  articleId: string | null;
  articleStatus: string | null;
  narrativeCertified: boolean;
  narrativeProvenance: string | null;
  discordMessageId: string | null;
  adminEffects: AdminEffectAdded[];
  consequencesApplied: boolean;
  ledger: Array<{ label: string; before: string | null; after: string | null }>;
  jobs: RpPipelineJobView[];
};

export type LoreArticleView = {
  id: string;
  title: string;
  excerpt: string;
  authorLabel: string;
  authority: string;
  countryLinks: Array<{ id: string; name: string; role: string }>;
  tags: string[];
  realDate: string;
  rpDate: string | null;
  status: string;
  discordMessageId: string | null;
  narrativeCertified: boolean;
};

export type PipelineAlertView = {
  id: string;
  kind: "job" | "article";
  title: string;
  detail: string;
  createdAt: string;
  jobId: string | null;
  reviewable: boolean;
};

export type DiscordRouteView = {
  id: string;
  priority: number;
  scope: string;
  label: string;
  destination: string;
  webhookSecretName: string;
  ingestEnabled: boolean;
  publishEnabled: boolean;
};

export type RpPipelineDashboardData = {
  actions: RpPipelineActionView[];
  articles: LoreArticleView[];
  articleTotal: number;
  libraryPage: number;
  alerts: PipelineAlertView[];
  routes: DiscordRouteView[];
  countries: Array<{
    id: string;
    name: string;
    discordRoleId: string | null;
    discordUserId: string | null;
  }>;
  actionTypes: Array<{ id: string; label: string }>;
  continents: Array<{ id: string; label: string }>;
  rosterUnits: Array<{
    id: string;
    name_fr: string;
    branch?: string;
    sub_type?: string | null;
  }>;
  automationConfigs: Array<{
    actionTypeId: string;
    actionLabel: string;
    enabledForMajor: boolean;
    enabledForMinor: boolean;
    weight: number;
    requiresTarget: boolean;
    targetRequiredByMechanics: boolean;
    preconditions: Record<string, unknown>;
    cooldownHours: number;
    rollMode: string;
    validationMode: string;
    publishFailures: boolean;
    articleProfile: string;
    maxContextArticles: number;
    contextWindowRpMonths: number;
    discordDestination: string;
    creativeLicense: "strict" | "controlled";
    narrativeGuidance: string;
    factBlueprints: string[][];
  }>;
  staffCandidates: Array<{
    userId: string;
    email: string;
    countryName: string;
    role: string | null;
  }>;
  pipelineEnabled: boolean;
};

export function isPipelineActionActive(
  action: Pick<RpPipelineActionView, "executionStatus">
) {
  return !["completed", "cancelled"].includes(action.executionStatus);
}

type TabId = "pipeline" | "bibliotheque" | "alertes" | "routage" | "reglages";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "pipeline", label: "Actions en cours" },
  { id: "bibliotheque", label: "Bibliothèque" },
  { id: "alertes", label: "Alertes" },
  { id: "routage", label: "Routage Discord" },
  { id: "reglages", label: "Réglages des actions" },
];

const stages = ["Action", "Jet", "Sources", "Article", "Conséquences", "Discord"];
const controlledTags = [
  "diplomatie",
  "militaire",
  "economie",
  "politique",
  "societe",
  "technologie",
  "renseignement",
  "crise",
  "alliance",
  "conflit",
  "commerce",
  "humanitaire",
];

const stateLabels: Record<string, string> = {
  pending: "En attente",
  running: "En cours",
  retry: "Nouvel essai",
  review: "À valider",
  succeeded: "Terminé",
  warning: "Alerte",
  cancelled: "Annulé",
  draft: "Brouillon",
  approved: "Validé",
  rejected: "Refusé",
  applied: "Appliqué",
  quarantined: "Quarantaine",
  ambiguous: "À classer",
  published: "Publié",
  critical_failure: "Échec critique",
  major_failure: "Échec majeur",
  minor_failure: "Échec mineur",
  minor_success: "Succès mineur",
  major_success: "Succès majeur",
  critical_success: "Succès critique",
  awaiting_roll: "Jet MJ requis",
  awaiting_review: "Validation MJ requise",
  waiting_decision: "Décision MJ requise",
  waiting_roll: "Jet MJ requis",
  waiting_article: "Rédaction Magnum",
  waiting_review: "Validation MJ requise",
  publishing: "Publication Discord",
  completed: "Terminé",
  brief: "Brève",
  standard: "Standard",
  dossier: "Dossier",
  generating: "Rédaction Magnum",
  ready: "Prêt",
};

function stateLabel(value: string | null) {
  return value ? (stateLabels[value] ?? value.replaceAll("_", " ")) : "Non démarré";
}

function stateTone(value: string | null) {
  if (["succeeded", "approved", "applied", "published", "minor_success", "major_success", "critical_success"].includes(value ?? "")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (["warning", "quarantined", "rejected", "minor_failure", "major_failure", "critical_failure"].includes(value ?? "")) {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (["review", "retry", "ambiguous", "awaiting_roll", "awaiting_review", "waiting_decision", "waiting_roll", "waiting_review"].includes(value ?? "")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (value === "running") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-[var(--border)] bg-[var(--background)] text-[var(--foreground-muted)]";
}

function StateBadge({ value }: { value: string | null }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${stateTone(value)}`}>
      {stateLabel(value)}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function actionStage(action: RpPipelineActionView) {
  if (action.discordMessageId || action.jobs.some((job) => job.jobType === "publish_discord" && job.status === "succeeded")) {
    return 6;
  }
  if (action.executionStatus === "applied" || action.ledger.length > 0) return 5;
  if (action.articleTitle || action.articleStatus) return 4;
  if (action.sourceIds.length > 0 || action.factSheet) return 3;
  if (action.roll != null) return 2;
  return 1;
}

function StageRail({ action }: { action: RpPipelineActionView }) {
  const reached = actionStage(action);
  return (
    <ol className="admin-horizontal-nav flex min-w-0 overflow-x-auto pb-1" aria-label="Progression de l’action">
      {stages.map((stage, index) => {
        const done = index + 1 <= reached;
        return (
          <li key={stage} className="relative min-w-[5.75rem] flex-1 pt-4">
            {index < stages.length - 1 ? (
              <span
                aria-hidden
                className={`absolute left-1/2 right-[-50%] top-[0.4rem] h-px ${
                  index + 1 < reached ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ) : null}
            <span
              aria-hidden
              className={`absolute left-1/2 top-0 z-[1] grid h-3.5 w-3.5 -translate-x-1/2 place-items-center rounded-full border-2 ${
                done
                  ? "border-[var(--accent)] bg-[var(--accent)] shadow-[0_3px_10px_rgba(34,197,94,0.25)]"
                  : "border-[var(--border)] bg-[var(--background)]"
              }`}
            />
            <span className={`block text-center text-[0.6875rem] font-medium ${done ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]"}`}>
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-y border-[var(--border)] px-4 py-12 text-center">
      <p className="font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--foreground-muted)]">{text}</p>
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" }) {
  return (
    <div className="rp-pipeline-metric px-3 py-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-[var(--foreground-muted)]">{label}</p>
      <p className={`stat-value mt-0.5 text-xl font-semibold tracking-[-0.025em] ${tone === "warning" ? "text-amber-200" : "text-[var(--foreground)]"}`}>
        {value}
      </p>
    </div>
  );
}

function PipelineView({ data }: { data: RpPipelineDashboardData }) {
  const activeActions = data.actions.filter(
    isPipelineActionActive
  );
  const completedActions = data.actions.filter(
    (action) => !isPipelineActionActive(action)
  );

  return (
    <div className="space-y-4">
      <details className="rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
          Créer une action narrative
        </summary>
        <form action={createManualRpAction} className="grid gap-4 border-t border-[var(--border)] p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm text-[var(--foreground-muted)]">
            Pays émetteur
            <select name="country_id" required className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="">Choisir…</option>
              {data.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)]">
            Action
            <select name="action_type_id" required className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="">Choisir…</option>
              {data.actionTypes.map((actionType) => <option key={actionType.id} value={actionType.id}>{actionType.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)]">
            Cible
            <select name="target_country_id" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="">Aucune</option>
              {data.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)]">
            Importance
            <select name="importance" defaultValue="minor" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="minor">Mineure</option>
              <option value="major">Majeure</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)] md:col-span-2">
            Intention narrative
            <input name="intent" required maxLength={500} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)] md:col-span-2">
            Enjeux narratifs
            <input name="stakes" maxLength={1000} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)] md:col-span-2 xl:col-span-4">
            Faits publics établis · un par ligne
            <textarea
              name="public_facts"
              required
              minLength={10}
              rows={4}
              placeholder={"La délégation remet une note officielle à la cible.\nLa note propose la reprise d’un canal ministériel.\nAucun accord n’est encore conclu."}
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
            />
            <span className="block text-xs">Deux à huit faits concrets. Magnum les raconte mais ne peut pas les compléter.</span>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)] md:col-span-2">
            Phase précédente
            <select name="parent_action_id" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="">Aucune — action indépendante</option>
              {data.actions.slice(0, 50).map((action) => (
                <option key={action.id} value={action.id}>
                  {action.countryName} · {action.actionLabel} · {formatDate(action.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-[var(--foreground-muted)] md:col-span-2">
            Notes MJ privées
            <input name="mj_notes" maxLength={1000} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <ManualEffectsFields
            countriesList={data.countries}
            rosterUnits={data.rosterUnits}
          />
          <div className="md:col-span-2 xl:col-span-4">
            <button type="submit" className="btn-primary">Ajouter au pipeline</button>
          </div>
        </form>
      </details>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="pipeline-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
          <h2 id="pipeline-title" className="font-semibold text-[var(--foreground)]">Actions en traitement</h2>
          <span className="text-xs text-[var(--foreground-muted)]">{activeActions.length} action{activeActions.length > 1 ? "s" : ""}</span>
        </div>
        {activeActions.length === 0 ? (
          <EmptyState
            title="Aucune action en cours"
            text="Les nouvelles actions apparaîtront ici."
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {activeActions.map((action) => {
              const currentJob = action.jobs.find((job) => ["warning", "review", "retry", "running"].includes(job.status)) ?? action.jobs[0];
              const publicationInFlight = action.jobs.some(
                (job) => job.jobType === "publish_discord" && ["pending", "running", "retry"].includes(job.status),
              );
              return (
                <details key={action.id} className="group">
                  <summary className="cursor-pointer list-none px-3 py-3 marker:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-[var(--foreground)]">{action.countryName}</h3>
                          {action.targetName && <span className="text-sm text-[var(--foreground-muted)]">→ {action.targetName}</span>}
                          <StateBadge value={currentJob?.status ?? action.executionStatus} />
                        </div>
                        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                          {action.actionLabel} · {action.importance === "major" ? "majeure" : "mineure"} · {formatDate(action.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-[var(--foreground-muted)] group-open:text-[var(--foreground)]">
                        Détails
                      </span>
                    </div>
                    <div className="mt-3">
                      <StageRail action={action} />
                    </div>
                  </summary>
                  <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] lg:grid-cols-3">
                    <section className="bg-[var(--background-panel)] p-4">
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">Décision et jet</h4>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-4"><dt className="text-[var(--foreground-muted)]">Décision</dt><dd><StateBadge value={action.decisionStatus} /></dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-[var(--foreground-muted)]">Jet D100</dt><dd className="stat-value text-[var(--foreground)]">{action.roll ?? "À tirer"}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-[var(--foreground-muted)]">Résultat</dt><dd className="text-right text-[var(--foreground)]">{stateLabel(action.rollOutcome)}</dd></div>
                      </dl>
                      {action.selectionExplanation && <p className="mt-3 text-xs leading-5 text-[var(--foreground-muted)]">{action.selectionExplanation}</p>}
                      <details className="mt-3 border-t border-[var(--border)] pt-3" open={action.publicFacts.length < 2}>
                        <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                          Faits publics · {action.publicFacts.length}
                        </summary>
                        <form action={saveActionPublicFacts} className="mt-3 space-y-2">
                          <input type="hidden" name="action_id" value={action.id} />
                          <textarea
                            name="public_facts"
                            required
                            rows={5}
                            defaultValue={action.publicFacts.join("\n")}
                            placeholder="Un fait concret par ligne"
                            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs leading-5 text-[var(--foreground)]"
                          />
                          <button className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                            Enregistrer et régénérer
                          </button>
                        </form>
                      </details>
                      {action.decisionStatus === "pending" && (
                        <form action={decideRpAction} className="mt-4 flex gap-2">
                          <input type="hidden" name="action_id" value={action.id} />
                          <button name="decision" value="approved" className="btn-primary text-xs">Accepter</button>
                          <button
                            name="decision"
                            value="rejected"
                            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                          >
                            Refuser
                          </button>
                        </form>
                      )}
                      {action.decisionStatus === "approved" && (action.roll != null || action.executionStatus === "waiting_roll") && (
                        <form action={changeActionRoll} className="mt-4 flex items-end gap-2">
                          <input type="hidden" name="action_id" value={action.id} />
                          <input type="hidden" name="expected_version" value={action.executionVersion} />
                          <label className="min-w-0 flex-1 space-y-1 text-xs text-[var(--foreground-muted)]">
                            {action.roll == null ? "Saisir le jet MJ" : "Corriger le jet"}
                            <input
                              name="roll"
                              type="number"
                              min={1}
                              max={100}
                              required
                              defaultValue={action.roll ?? undefined}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
                            />
                          </label>
                          <button className="rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                            {action.roll == null ? "Valider" : "Recalculer"}
                          </button>
                        </form>
                      )}
                    </section>
                    <section className="bg-[var(--background-panel)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Sources et article</h4>
                        <StateBadge value={action.articleStatus} />
                      </div>
                      <p className="mt-3 text-sm font-medium text-[var(--foreground)]">{action.articleTitle ?? "Article non généré"}</p>
                      {action.articleDescription && <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--foreground-muted)]">{action.articleDescription}</p>}
                      <p className="mt-3 text-xs text-[var(--foreground-muted)]">
                        {action.sourceIds.length} source{action.sourceIds.length > 1 ? "s" : ""} retenue{action.sourceIds.length > 1 ? "s" : ""}
                      </p>
                      {action.articleId && (
                        <p className={`mt-2 text-xs font-medium ${action.narrativeCertified ? "text-emerald-300" : "text-amber-200"}`}>
                          {action.narrativeCertified ? "Narration certifiée" : "Narration à certifier"}
                        </p>
                      )}
                      {action.articleId && (
                        <details className="mt-3 border-t border-[var(--border)] pt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">Corriger ou valider l’article</summary>
                          <form action={saveArticleReview} className="mt-3 space-y-2">
                            <input type="hidden" name="article_id" value={action.articleId} />
                            <label className="block space-y-1 text-xs text-[var(--foreground-muted)]">
                              Titre
                              <input
                                name="title"
                                required
                                maxLength={180}
                                defaultValue={action.articleTitle ?? ""}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
                              />
                            </label>
                            <label className="block space-y-1 text-xs text-[var(--foreground-muted)]">
                              Corps Discord
                              <textarea
                                name="description"
                                required
                                minLength={100}
                                maxLength={3500}
                                rows={6}
                                defaultValue={action.articleDescription ?? ""}
                                className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-5 text-[var(--foreground)]"
                              />
                            </label>
                            {action.articleSections.map((section, index) => (
                              <fieldset key={index} className="space-y-2 border-l-2 border-[var(--border)] pl-3">
                                <legend className="text-xs font-semibold text-[var(--foreground-muted)]">
                                  Section {index + 1}
                                </legend>
                                <input
                                  name="section_title"
                                  required
                                  maxLength={256}
                                  defaultValue={section.title}
                                  aria-label={`Titre de la section ${index + 1}`}
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
                                />
                                <textarea
                                  name="section_body"
                                  required
                                  maxLength={1024}
                                  rows={4}
                                  defaultValue={section.body}
                                  aria-label={`Contenu de la section ${index + 1}`}
                                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-5 text-[var(--foreground)]"
                                />
                              </fieldset>
                            ))}
                            <button className="btn-primary text-xs">Enregistrer et valider</button>
                          </form>
                        </details>
                      )}
                    </section>
                    <section className="bg-[var(--background-panel)] p-4">
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">Conséquences et livraison</h4>
                      <p className="mt-3 text-sm text-[var(--foreground)]">
                        {action.ledger.length > 0 ? `${action.ledger.length} modification${action.ledger.length > 1 ? "s" : ""} enregistrée${action.ledger.length > 1 ? "s" : ""}` : "Aucune conséquence appliquée"}
                      </p>
                      {!action.consequencesApplied && (
                        <details className="mt-3 border-t border-[var(--border)] pt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                            Préparer les conséquences
                          </summary>
                          <form action={saveActionEffects} className="mt-3 space-y-3">
                            <input type="hidden" name="action_id" value={action.id} />
                            <ManualEffectsFields
                              countriesList={data.countries}
                              rosterUnits={data.rosterUnits}
                              initialEffects={action.adminEffects}
                              fixedCountryId={action.countryId}
                              fixedTargetCountryId={action.targetCountryId}
                            />
                            <button className="btn-primary text-xs">Enregistrer les conséquences</button>
                          </form>
                        </details>
                      )}
                      {currentJob && (
                        <div className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">
                          <p>{stateLabel(currentJob.status)} · tentative {currentJob.attempts}</p>
                          {currentJob.nextAttemptAt && <p>Prochain essai : {formatDate(currentJob.nextAttemptAt)}</p>}
                          {currentJob.error && <p className="mt-1 text-red-300">{currentJob.error}</p>}
                        </div>
                      )}
                      {currentJob && ["warning", "retry"].includes(currentJob.status) && (
                        <form action={retryPipelineJob} className="mt-3">
                          <input type="hidden" name="job_id" value={currentJob.id} />
                          <button className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                            Relancer
                          </button>
                        </form>
                      )}
                      {currentJob?.status === "review" && (
                        <p className="mt-3 text-xs font-medium text-amber-200">
                          Corrigez puis validez l’article dans la colonne précédente.
                        </p>
                      )}
                      {action.articleId && action.executionVersion > 0 && !publicationInFlight && (
                        <details className="mt-4 border-t border-[var(--border)] pt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                            Opérations Discord manuelles
                          </summary>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <form action={queueDiscordDelivery}>
                              <input type="hidden" name="action_id" value={action.id} />
                              <input type="hidden" name="article_id" value={action.articleId} />
                              <button name="operation" value="resend" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                                Renvoyer
                              </button>
                            </form>
                            {action.discordMessageId && (
                              <form action={queueDiscordDelivery}>
                                <input type="hidden" name="action_id" value={action.id} />
                                <input type="hidden" name="article_id" value={action.articleId} />
                                <button name="operation" value="delete" className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10">
                                  Retirer de Discord
                                </button>
                              </form>
                            )}
                          </div>
                        </details>
                      )}
                    </section>
                  </div>
                  {(action.factSheet || action.narrativeProvenance || action.ledger.length > 0) && (
                    <div className="grid gap-6 border-t border-[var(--border)] bg-[var(--background)] p-4 md:grid-cols-2">
                      <section>
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Fiche factuelle transmise</h4>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground-muted)]">{action.factSheet ?? "Aucune fiche enregistrée."}</p>
                        {action.narrativeProvenance && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">Traçabilité narrative</summary>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--foreground-muted)]">{action.narrativeProvenance}</pre>
                          </details>
                        )}
                      </section>
                      <section>
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">Registre des conséquences</h4>
                        {action.ledger.length === 0 ? (
                          <p className="mt-2 text-xs text-[var(--foreground-muted)]">Aucune modification enregistrée.</p>
                        ) : (
                          <ul className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">
                            {action.ledger.map((entry, index) => (
                              <li key={`${entry.label}-${index}`}>
                                <span className="text-[var(--foreground)]">{entry.label}</span> : {entry.before ?? "—"} → {entry.after ?? "—"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>

      {completedActions.length > 0 ? (
        <details className="group border-y" style={{ borderColor: "var(--border)" }}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
            <span>Récemment terminées</span>
            <span className="flex items-center gap-2">
              {completedActions.length}
              <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
            </span>
          </summary>
          <div className="divide-y border-t" style={{ borderColor: "var(--border)" }}>
            {completedActions.slice(0, 50).map((action) => (
              <div key={action.id} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-[var(--foreground)]">{action.countryName}</span>
                  <span className="text-[var(--foreground-muted)]"> · {action.actionLabel}</span>
                </span>
                <div className="flex items-center gap-2">
                  {action.articleId && (
                    <span className={`text-xs font-medium ${action.narrativeCertified ? "text-emerald-300" : "text-amber-200"}`}>
                      {action.narrativeCertified ? "Certifiée" : "Non certifiée"}
                    </span>
                  )}
                  <span className="text-xs text-[var(--foreground-muted)]">{formatDate(action.createdAt)}</span>
                  {action.articleId && action.consequencesApplied && (
                    <form action={queueNarrativeRepair}>
                      <input type="hidden" name="action_id" value={action.id} />
                      <button className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                        Régénérer la narration
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function LibraryView({
  articles,
  articleTotal,
  countries,
  query,
  page,
}: {
  articles: LoreArticleView[];
  articleTotal: number;
  countries: RpPipelineDashboardData["countries"];
  query: string;
  page: number;
}) {
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(articleTotal / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="library-title">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="library-title" className="font-semibold text-[var(--foreground)]">Bibliothèque du monde</h2>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">Messages publics classés comme contexte, jamais comme instructions.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form method="get" className="flex gap-2">
            <input type="hidden" name="tab" value="bibliotheque" />
            <label className="sr-only" htmlFor="library-search">Rechercher dans la bibliothèque</label>
            <input
              id="library-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Titre ou contenu…"
              className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] sm:w-64"
            />
            <button className="rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background-panel)]">
              Rechercher
            </button>
          </form>
          <form action={queueDiscordSync}>
            <button className="btn-primary w-full text-sm sm:w-auto">Synchroniser Discord</button>
          </form>
        </div>
      </div>
      {articles.length === 0 ? (
        <EmptyState
          title={query ? "Aucun article ne correspond" : "Aucun article collecté"}
          text={query ? "Essayez un titre ou des mots plus généraux." : "La première collecte démarrera au dernier message présent dans les salons autorisés."}
        />
      ) : (
        <>
          <div className="divide-y divide-[var(--border)]">
            {articles.map((article) => (
            <article key={article.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-[var(--foreground)]">{article.title}</h3>
                  <StateBadge value={article.status} />
                  {article.authority === "engine" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${article.narrativeCertified ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>
                      {article.narrativeCertified ? "Narration certifiée" : "Non certifiée"}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--foreground-muted)]">{article.excerpt}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {article.countryLinks.map((country) => (
                    <span key={`${country.id}-${country.role}`} className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--foreground)]">
                      {country.name} · {country.role === "author" ? "auteur" : country.role === "target" ? "cible" : "mention"}
                    </span>
                  ))}
                  {article.tags.map((tag) => <span key={tag} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--foreground-muted)]">{tag}</span>)}
                </div>
                {article.status !== "quarantined" && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                      Corriger le classement
                    </summary>
                    <form action={classifyLoreArticle} className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 md:grid-cols-2">
                      <input type="hidden" name="article_id" value={article.id} />
                      <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                        Autorité
                        <select name="source_kind" defaultValue={["mj", "official", "player"].includes(article.authority) ? article.authority : "player"} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 text-sm text-[var(--foreground)]">
                          <option value="official">Publication officielle</option>
                          <option value="player">Article joueur</option>
                          <option value="mj">Décision MJ</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                        Pays auteur
                        <select name="author_country_id" defaultValue={article.countryLinks.find(({ role }) => role === "author")?.id ?? ""} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 text-sm text-[var(--foreground)]">
                          <option value="">Inconnu</option>
                          {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                        Pays cible
                        <select name="target_country_id" defaultValue={article.countryLinks.find(({ role }) => role === "target")?.id ?? ""} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 text-sm text-[var(--foreground)]">
                          <option value="">Aucun</option>
                          {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                        Autres pays mentionnés
                        <select
                          name="mentioned_country_ids"
                          multiple
                          defaultValue={article.countryLinks.filter(({ role }) => role === "mentioned").map(({ id }) => id)}
                          className="min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 py-2 text-sm text-[var(--foreground)]"
                        >
                          {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
                        </select>
                      </label>
                      <fieldset className="md:col-span-2">
                        <legend className="text-xs text-[var(--foreground-muted)]">Thèmes contrôlés</legend>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {controlledTags.map((tag) => (
                            <label key={tag} className="flex items-center gap-1.5 text-xs text-[var(--foreground)]">
                              <input name="tag_keys" value={tag} type="checkbox" defaultChecked={article.tags.includes(tag)} />
                              {tag}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <button className="btn-primary text-xs md:col-span-2 md:w-fit">Enregistrer le classement</button>
                    </form>
                  </details>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs lg:grid-cols-1">
                <div><dt className="text-[var(--foreground-muted)]">Auteur</dt><dd className="mt-0.5 text-[var(--foreground)]">{article.authorLabel}</dd></div>
                <div><dt className="text-[var(--foreground-muted)]">Autorité</dt><dd className="mt-0.5 text-[var(--foreground)]">{article.authority}</dd></div>
                <div><dt className="text-[var(--foreground-muted)]">Date réelle</dt><dd className="mt-0.5 text-[var(--foreground)]">{formatDate(article.realDate)}</dd></div>
                <div><dt className="text-[var(--foreground-muted)]">Date RP</dt><dd className="mt-0.5 text-[var(--foreground)]">{article.rpDate ?? "À déterminer"}</dd></div>
              </dl>
            </article>
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm" aria-label="Pagination de la bibliothèque">
              {currentPage > 1 ? (
                <Link href={`/admin/event-ia?tab=bibliotheque&q=${encodeURIComponent(query)}&page=${currentPage - 1}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
                  Page précédente
                </Link>
              ) : <span />}
              <span className="text-xs text-[var(--foreground-muted)]">Page {currentPage} sur {pageCount}</span>
              {currentPage < pageCount ? (
                <Link href={`/admin/event-ia?tab=bibliotheque&q=${encodeURIComponent(query)}&page=${currentPage + 1}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
                  Page suivante
                </Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function AlertsView({ alerts }: { alerts: PipelineAlertView[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="alerts-title">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 id="alerts-title" className="font-semibold text-[var(--foreground)]">Points à traiter</h2>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">Trois échecs, contenu en quarantaine ou pays ambigu requièrent une décision humaine.</p>
      </div>
      {alerts.length === 0 ? (
        <EmptyState title="Aucune alerte" text="Les tâches se poursuivent normalement. Rien ne demande l’intervention d’un MJ." />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {alerts.map((alert) => (
            <li key={`${alert.kind}-${alert.id}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-[var(--foreground)]">{alert.title}</h3>
                  <StateBadge value={alert.reviewable ? "review" : "warning"} />
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)]">{alert.detail}</p>
                <p className="mt-2 text-xs text-[var(--foreground-muted)]">{formatDate(alert.createdAt)}</p>
              </div>
              {alert.jobId && (
                alert.reviewable ? (
                  <Link href="/admin/event-ia?tab=pipeline" className="whitespace-nowrap text-sm font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
                    Ouvrir l’action
                  </Link>
                ) : (
                  <form action={retryPipelineJob}>
                    <input type="hidden" name="job_id" value={alert.jobId} />
                    <button className="whitespace-nowrap rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background-panel)]">
                      Relancer
                    </button>
                  </form>
                )
              )}
              {!alert.jobId && (
                <Link href="/admin/event-ia?tab=bibliotheque" className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
                  Ouvrir la bibliothèque
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoutingView({
  routes,
  countries,
  actionTypes,
  continents,
}: Pick<RpPipelineDashboardData, "routes" | "countries" | "actionTypes" | "continents">) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="routes-title">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 id="routes-title" className="font-semibold text-[var(--foreground)]">Ordre de routage</h2>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">Une seule destination : pays, type d’action, continent, puis défaut.</p>
        </div>
        {routes.length === 0 ? (
          <EmptyState title="Aucune destination configurée" text="Ajoutez au minimum une route par défaut pour rendre les publications livrables." />
        ) : (
          <table className="admin-responsive-table w-full text-left text-sm">
            <thead className="bg-[var(--background)] text-xs text-[var(--foreground-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Priorité</th>
                <th className="px-4 py-2 font-medium">Portée</th>
                <th className="px-4 py-2 font-medium">Destination</th>
                <th className="px-4 py-2 font-medium">Secret serveur</th>
                <th className="px-4 py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {routes.map((route) => (
                <tr key={route.id}>
                  <td data-label="Priorité" className="stat-value px-4 py-3 text-[var(--foreground)]">{route.priority}</td>
                  <td data-label="Portée" className="px-4 py-3 text-[var(--foreground)]">{route.scope} · {route.label}</td>
                  <td data-label="Destination" className="px-4 py-3 text-[var(--foreground-muted)]">{route.destination}</td>
                  <td data-label="Secret serveur" className="px-4 py-3 text-[var(--foreground-muted)]">{route.webhookSecretName}</td>
                  <td data-label="État" className="px-4 py-3">
                    <form action={updateDiscordRoute} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="route_id" value={route.id} />
                      <label className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                        <input name="ingest_enabled" type="checkbox" defaultChecked={route.ingestEnabled} />
                        Lecture
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                        <input name="publish_enabled" type="checkbox" defaultChecked={route.publishEnabled} />
                        Publication
                      </label>
                      <button className="rounded border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]">
                        Sauver
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-4" aria-labelledby="route-create-title">
        <h2 id="route-create-title" className="font-semibold text-[var(--foreground)]">Ajouter une destination</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">Le nom du secret référence un webhook stocké côté serveur. Sa valeur n’est jamais affichée.</p>
        <form action={saveDiscordRoute} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Nom de la destination
            <input name="label" required maxLength={100} placeholder="Actualités internationales" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Portée
            <select name="scope_type" defaultValue="default" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="country">Pays</option>
              <option value="action_type">Type d’action</option>
              <option value="continent">Continent</option>
              <option value="default">Défaut</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Élément ciblé par la portée
            <select name="scope_value" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="">Non applicable</option>
              <optgroup label="Pays">
                {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </optgroup>
              <optgroup label="Types d’action">
                {actionTypes.map((actionType) => <option key={actionType.id} value={actionType.id}>{actionType.label}</option>)}
              </optgroup>
              <optgroup label="Continents">
                {continents.map((continent) => <option key={continent.id} value={continent.id}>{continent.label}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Type de salon
            <select name="channel_kind" defaultValue="international" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="international">International</option>
              <option value="national">National</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Autorité des messages lus
            <select name="source_authority" defaultValue="player" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="player">Joueurs ou auteur à classer</option>
              <option value="official">Publication officielle</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Identifiant du serveur
            <input name="discord_guild_id" required inputMode="numeric" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Identifiant du salon
            <input name="discord_channel_id" required inputMode="numeric" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <label className="block space-y-1 text-sm text-[var(--foreground-muted)]">
            Nom du secret webhook
            <input name="webhook_secret_name" pattern="[A-Z][A-Z0-9_]*" placeholder="DISCORD_WEBHOOK_DEFAULT" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-[var(--foreground)]">
            <label className="flex items-center gap-2">
              <input name="ingest_enabled" type="checkbox" />
              Lire ce salon
            </label>
            <label className="flex items-center gap-2">
              <input name="publish_enabled" type="checkbox" defaultChecked />
              Publier dans ce salon
            </label>
          </div>
          <button className="btn-primary w-full text-sm">Enregistrer la route</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] xl:col-span-2" aria-labelledby="discord-identities-title">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 id="discord-identities-title" className="font-semibold text-[var(--foreground)]">Identités Discord des pays</h2>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">Le compte identifie l’auteur collecté ; le rôle est le seul utilisé pour les mentions publiées.</p>
        </div>
        <div className="grid gap-px bg-[var(--border)] md:grid-cols-2 xl:grid-cols-3">
          {countries.map((country) => (
            <form key={country.id} action={saveCountryDiscordMapping} className="space-y-3 bg-[var(--background-panel)] p-4">
              <input type="hidden" name="country_id" value={country.id} />
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{country.name}</h3>
              <label className="block space-y-1 text-xs text-[var(--foreground-muted)]">
                Compte joueur
                <input name="discord_user_id" defaultValue={country.discordUserId ?? ""} inputMode="numeric" placeholder="Identifiant utilisateur" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
              </label>
              <label className="block space-y-1 text-xs text-[var(--foreground-muted)]">
                Rôle pays
                <input name="discord_role_id" defaultValue={country.discordRoleId ?? ""} inputMode="numeric" placeholder="Identifiant du rôle" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
              </label>
              <button className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-elevated)]">
                Enregistrer
              </button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}

function AutomationSettingsView({
  configs,
  staffCandidates,
  pipelineEnabled,
}: {
  configs: RpPipelineDashboardData["automationConfigs"];
  staffCandidates: RpPipelineDashboardData["staffCandidates"];
  pipelineEnabled: boolean;
}) {
  const numberValue = (preconditions: Record<string, unknown>, key: string) =>
    typeof preconditions[key] === "number" ? String(preconditions[key]) : "";

  return (
    <div className="space-y-4">
    <section className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold text-[var(--foreground)]">Génération automatique</h2>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          {pipelineEnabled ? "Le moteur peut créer les prochaines actions dues." : "Le moteur est suspendu ; les actions manuelles restent disponibles."}
        </p>
      </div>
      <form action={setRpPipelineEnabled}>
        <button
          name="enabled"
          value={pipelineEnabled ? "false" : "true"}
          className={pipelineEnabled ? "rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200" : "btn-primary text-sm"}
        >
          {pipelineEnabled ? "Suspendre" : "Activer le moteur"}
        </button>
      </form>
    </section>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="automation-title">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 id="automation-title" className="font-semibold text-[var(--foreground)]">Réglages par type d’action</h2>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">Chaque type décide séparément de sa génération, de son jet, de sa validation et du format de son article.</p>
      </div>
      {configs.length === 0 ? (
        <EmptyState title="Aucun type configuré" text="Les types d’actions doivent d’abord être créés dans les règles." />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {configs.map((config) => {
            const continentRule =
              config.preconditions.same_continent === true
                ? "same"
                : config.preconditions.different_continent === true
                  ? "different"
                  : "any";
            return (
              <details key={config.actionTypeId}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 marker:hidden">
                  <span className="font-semibold text-[var(--foreground)]">{config.actionLabel}</span>
                  <span className="flex flex-wrap gap-2">
                    <StateBadge value={config.enabledForMajor || config.enabledForMinor ? "succeeded" : "cancelled"} />
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Jet {config.rollMode === "mj" ? "MJ" : "auto"} · {stateLabel(config.articleProfile)}
                    </span>
                  </span>
                </summary>
                <form action={saveActionAutomationConfig} className="grid gap-4 border-t border-[var(--border)] bg-[var(--background-panel)] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="action_type_id" value={config.actionTypeId} />
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold text-[var(--foreground)]">Génération</legend>
                    <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                      <input name="enabled_for_major" type="checkbox" defaultChecked={config.enabledForMajor} />
                      IA majeures
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                      <input name="enabled_for_minor" type="checkbox" defaultChecked={config.enabledForMinor} />
                      IA mineures
                    </label>
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                      Poids
                      <input name="weight" type="number" min="0.01" max="1000" step="0.01" required defaultValue={config.weight} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
                    </label>
                    <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                      Anti-répétition (h)
                      <input name="cooldown_hours" type="number" min="0" max="87600" step="0.5" required defaultValue={config.cooldownHours} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                    Jet
                    <select name="roll_mode" defaultValue={config.rollMode} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                      <option value="auto">Automatique</option>
                      <option value="mj">Saisi par un MJ</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                    Validation
                    <select name="validation_mode" defaultValue={config.validationMode} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                      <option value="mj">Validation MJ</option>
                      <option value="auto">Automatique</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                    Format d’article
                    <select name="article_profile" defaultValue={config.articleProfile} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                      <option value="brief">Brève · 250–650</option>
                      <option value="standard">Standard · 450–1 200</option>
                      <option value="dossier">Dossier · 2 000–3 500</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                    Liberté narrative
                    <select name="creative_license" defaultValue={config.creativeLicense} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                      <option value="strict">Stricte · aucun détail inventé</option>
                      <option value="controlled">Contrôlée · détails non mécaniques</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                      Sources max.
                      <input name="max_context_articles" type="number" min="1" max="8" required defaultValue={config.maxContextArticles} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
                    </label>
                    <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                      Fenêtre RP (mois)
                      <input name="context_window_rp_months" type="number" min="1" max="120" required defaultValue={config.contextWindowRpMonths} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]" />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                    Destination
                    <select name="discord_destination" defaultValue={config.discordDestination} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                      <option value="international">International</option>
                      <option value="national">National</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end text-sm text-[var(--foreground-muted)]">
                    <input name="publish_failures" type="checkbox" defaultChecked={config.publishFailures} />
                    Publier aussi les échecs
                  </label>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)] md:col-span-2 xl:col-span-4">
                    Consigne narrative propre à ce type d’action
                    <textarea
                      name="narrative_guidance"
                      rows={3}
                      maxLength={1000}
                      defaultValue={config.narrativeGuidance}
                      placeholder="Ex. ton d’agence officielle, éléments à mettre en avant, limites particulières…"
                      className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-5 text-[var(--foreground)]"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[var(--foreground-muted)] md:col-span-2 xl:col-span-4">
                    Scènes factuelles automatiques
                    <textarea
                      name="fact_blueprints"
                      rows={5}
                      required
                      defaultValue={config.factBlueprints.map((facts) => facts.join(" | ")).join("\n")}
                      placeholder="Une scène par ligne ; séparez ses faits avec |. Variables : {auteur}, {cible}, {action}."
                      className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-5 text-[var(--foreground)]"
                    />
                    <span className="block">Le moteur tire une ligne au hasard puis fige ses faits avant Magnum.</span>
                  </label>
                  <details className="md:col-span-2 xl:col-span-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Préconditions facultatives</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] sm:col-span-2 lg:col-span-4">
                        {config.targetRequiredByMechanics && <input name="requires_target" type="hidden" value="on" />}
                        <input
                          name={config.targetRequiredByMechanics ? undefined : "requires_target"}
                          type="checkbox"
                          defaultChecked={config.requiresTarget}
                          disabled={config.targetRequiredByMechanics}
                        />
                        Cette action exige un pays cible
                        {config.targetRequiredByMechanics ? " (requis par ses conséquences)" : ""}
                      </label>
                      {([
                        ["emitter_min_stability", "Stabilité émetteur min.", -3, 3, 1],
                        ["emitter_max_stability", "Stabilité émetteur max.", -3, 3, 1],
                        ["target_min_stability", "Stabilité cible min.", -3, 3, 1],
                        ["target_max_stability", "Stabilité cible max.", -3, 3, 1],
                        ["emitter_min_militarism", "Militarisme émetteur min.", 0, 10, 0.1],
                        ["emitter_max_militarism", "Militarisme émetteur max.", 0, 10, 0.1],
                        ["target_min_militarism", "Militarisme cible min.", 0, 10, 0.1],
                        ["target_max_militarism", "Militarisme cible max.", 0, 10, 0.1],
                        ["min_relation", "Relation min.", -100, 100, 1],
                        ["max_relation", "Relation max.", -100, 100, 1],
                      ] as const).map(([key, label, min, max, step]) => (
                        <label key={key} className="space-y-1 text-xs text-[var(--foreground-muted)]">
                          {label}
                          <input
                            name={key}
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            defaultValue={numberValue(config.preconditions, key)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
                          />
                        </label>
                      ))}
                      <label className="space-y-1 text-xs text-[var(--foreground-muted)]">
                        Géographie
                        <select name="continent_rule" defaultValue={continentRule} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]">
                          <option value="any">Indifférente</option>
                          <option value="same">Même continent</option>
                          <option value="different">Continents différents</option>
                        </select>
                      </label>
                    </div>
                  </details>
                  <button className="btn-primary md:col-span-2 md:w-fit xl:col-span-4">Enregistrer ce type</button>
                </form>
              </details>
            );
          })}
        </div>
      )}
    </section>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]" aria-labelledby="staff-title">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 id="staff-title" className="font-semibold text-[var(--foreground)]">Équipe MJ</h2>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">Un MJ peut piloter le pipeline sans recevoir les autres droits d’administration.</p>
      </div>
      {staffCandidates.length === 0 ? (
        <EmptyState title="Aucun compte joueur" text="Créez d’abord le compte dans l’administration des joueurs." />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {staffCandidates.map((candidate) => (
            <form key={candidate.userId} action={setRpStaffAccess} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <input type="hidden" name="user_id" value={candidate.userId} />
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">{candidate.email}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{candidate.countryName}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                  <input name="enabled" type="checkbox" defaultChecked={candidate.role === "mj"} />
                  Accès MJ
                </label>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background-panel)]">
                  Enregistrer
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
    </div>
  );
}

export function RpPipelineDashboard({
  data,
  activeTab,
  query,
  isAdmin,
}: {
  data: RpPipelineDashboardData;
  activeTab: TabId;
  query: string;
  isAdmin: boolean;
}) {
  const pending = data.actions.filter((action) => !["completed", "cancelled"].includes(action.executionStatus)).length;
  const generating = data.actions.filter((action) => action.jobs.some((job) => ["pending", "running", "retry"].includes(job.status))).length;
  const delivered = data.actions.filter((action) => action.jobs.some((job) => Boolean(job.discordMessageId))).length;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:grid-cols-4" aria-label="État du pipeline">
        <Metric label="Actions ouvertes" value={pending} />
        <Metric label="En génération" value={generating} />
        <Metric label="Livrées" value={delivered} />
        <Metric label="À traiter" value={data.alerts.length} tone={data.alerts.length ? "warning" : "normal"} />
      </section>

      <form action="/admin/event-ia" method="get" className="sm:hidden">
        <label className="block">
          <span className="sr-only">Vue du moteur RP</span>
          <div className="flex gap-2">
            <select
              name="tab"
              defaultValue={activeTab}
              className="min-h-11 min-w-0 flex-1 rounded-lg border bg-[var(--background-panel)] px-3 text-sm font-semibold text-[var(--foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              {tabs.filter((tab) => isAdmin || !["routage", "reglages"].includes(tab.id)).map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}{tab.id === "alertes" && data.alerts.length ? ` (${data.alerts.length})` : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#08110c]">
              Afficher
            </button>
          </div>
        </label>
      </form>

      <nav className="hidden gap-1 border-b border-[var(--border)] sm:flex" aria-label="Vues du moteur RP">
        {tabs.filter((tab) => isAdmin || !["routage", "reglages"].includes(tab.id)).map((tab) => (
          <Link
            key={tab.id}
            href={`/admin/event-ia?tab=${tab.id}`}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
            {tab.id === "alertes" && data.alerts.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">{data.alerts.length}</span>
            )}
          </Link>
        ))}
      </nav>

      {activeTab === "pipeline" && <PipelineView data={data} />}
      {activeTab === "bibliotheque" && (
        <LibraryView
          articles={data.articles}
          articleTotal={data.articleTotal}
          countries={data.countries}
          query={query}
          page={data.libraryPage}
        />
      )}
      {activeTab === "alertes" && <AlertsView alerts={data.alerts} />}
      {isAdmin && activeTab === "routage" && (
        <RoutingView
          routes={data.routes}
          countries={data.countries}
          actionTypes={data.actionTypes}
          continents={data.continents}
        />
      )}
      {isAdmin && activeTab === "reglages" && (
        <AutomationSettingsView
          configs={data.automationConfigs}
          staffCandidates={data.staffCandidates}
          pipelineEnabled={data.pipelineEnabled}
        />
      )}
    </div>
  );
}
