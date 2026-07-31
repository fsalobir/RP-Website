"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { AdminJobView } from "@/lib/ai/contracts";

const JOB_KEY = "fon-admin-assistant-job-v1";
const STAGES: Array<{ id: AdminJobView["stage"]; label: string }> = [
  { id: "file", label: "File" }, { id: "analysis", label: "Analyse" }, { id: "lecture", label: "Lecture" },
  { id: "plan", label: "Plan" }, { id: "sauvegarde", label: "Sauvegarde" },
  { id: "validations", label: "Validations" }, { id: "execution", label: "Exécution" },
];
const TERMINAL = ["completed", "partial", "failed", "cancelled", "expired"];

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/ai/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export function AdminAssistant() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<AdminJobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const refresh = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/ai/admin?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as AdminJobView;
    setJob(next);
    localStorage.setItem(JOB_KEY, next.id);
  }, []);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;

  useEffect(() => {
    const saved = localStorage.getItem(JOB_KEY);
    if (!saved) return;
    const timer = window.setTimeout(() => void refresh(saved), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);
  useEffect(() => {
    if (!activeJobId || !activeJobStatus || TERMINAL.includes(activeJobStatus) || ["awaiting_first_approval", "awaiting_second_approval"].includes(activeJobStatus)) return;
    const timer = window.setInterval(() => void refresh(activeJobId), 2_000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus, refresh]);

  async function create(event?: FormEvent, confirmed = false) {
    event?.preventDefault();
    const request = (fallbackMessage ?? message).trim();
    if (!request || request.length > 4000) return;
    setBusy(true);
    setError(null);
    const { response, data } = await api({ operation: "create", message: request, fallbackConfirmed: confirmed });
    setBusy(false);
    if (response.status === 409 && data.fallbackRequired) {
      setFallbackMessage(request);
      return;
    }
    if (!response.ok) {
      setError(data.error || "La tâche n'a pas pu démarrer.");
      return;
    }
    setFallbackMessage(null);
    setMessage("");
    setJob(data.job);
    localStorage.setItem(JOB_KEY, data.job.id);
  }

  async function operate(operation: "approve_first" | "approve_second" | "cancel" | "restore") {
    if (!job) return;
    setBusy(true);
    setError(null);
    const { response, data } = await api({ operation, jobId: job.id });
    setBusy(false);
    if (!response.ok) return setError(data.error || "L'opération n'a pas abouti.");
    if (data.changed) setError("Les données ont changé. L'aperçu a été recalculé : vérifiez-le avant de confirmer à nouveau.");
    setJob(data.job);
    localStorage.setItem(JOB_KEY, data.job.id);
  }

  function newTask() {
    setJob(null);
    setError(null);
    setFallbackMessage(null);
    localStorage.removeItem(JOB_KEY);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const stageIndex = job ? STAGES.findIndex((stage) => stage.id === job.stage) : -1;
  const answer = job?.result && typeof job.result === "object" && "answer" in job.result
    ? String((job.result as { answer?: unknown }).answer ?? "")
    : null;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant admin" className={`fixed bottom-5 right-5 z-[70] flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 font-semibold text-[#071016] shadow-[0_14px_34px_rgba(0,0,0,0.42)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${open ? "pointer-events-none opacity-0" : ""}`}>
        <BotIcon className="h-5 w-5" /><span className="hidden sm:inline">Assistant admin</span>
      </button>
      {open && (
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-assistant-title" className={`fixed inset-0 z-[90] flex flex-col bg-[#111923] shadow-[-18px_0_50px_rgba(0,0,0,0.45)] lg:left-auto lg:border-l lg:border-[var(--border)] ${expanded ? "lg:w-[calc(100vw-15.5rem)]" : "lg:w-[32rem]"}`}>
          <header className="flex min-h-16 items-center gap-3 border-b border-[var(--border)] px-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[#071016]"><BotIcon className="h-5 w-5" /></span>
            <div className="min-w-0"><h2 id="admin-assistant-title" className="truncate font-semibold tracking-[-0.02em]">Assistant admin</h2><p className="text-xs text-[var(--foreground-muted)]">Codex local · lecture et opérations validées</p></div>
            <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-auto hidden h-10 w-10 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--background-panel)] hover:text-[var(--foreground)] lg:flex" aria-label={expanded ? "Réduire le tiroir" : "Agrandir le tiroir"}><ExpandIcon expanded={expanded} /></button>
            <button type="button" onClick={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--background-panel)] hover:text-[var(--foreground)]" aria-label="Fermer l'assistant"><CloseIcon /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" aria-live="polite">
            {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">{error}</p>}
            {fallbackMessage && (
              <div className="mb-5 rounded-xl border border-amber-400/35 bg-amber-400/10 p-4">
                <h3 className="font-semibold text-amber-100">Relais local hors ligne</h3>
                <p className="mt-1 text-sm leading-6 text-amber-50/80">Cette demande concerne le jeu. Elle peut utiliser l'API payante et le budget commun. Le code du site ne sera pas transmis.</p>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void create(undefined, true)} className="min-h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-[#241b02] disabled:opacity-50">Confirmer l'utilisation payante</button><button type="button" onClick={() => setFallbackMessage(null)} className="min-h-11 rounded-lg border border-amber-200/25 px-4 text-sm text-amber-50">Annuler</button></div>
              </div>
            )}

            {!job ? (
              <form onSubmit={create} className="flex min-h-full flex-col">
                <label htmlFor="admin-assistant-message" className="mb-2 text-sm font-medium">Votre demande</label>
                <textarea ref={inputRef} id="admin-assistant-message" value={message} onChange={(event) => setMessage(event.target.value.slice(0, 4000))} rows={8} maxLength={4000} placeholder="Question sur le jeu, diagnostic du site ou opération à préparer…" className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-base leading-6 placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 sm:text-sm" />
                <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-[var(--foreground-muted)]">{message.length > 3500 ? `${message.length}/4 000` : "Aucune écriture sans deux validations"}</span><button type="submit" disabled={busy || !message.trim()} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#071016] hover:bg-[var(--accent-hover)] disabled:opacity-45">{busy ? "Préparation…" : "Envoyer"}</button></div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{job.summary ?? "Tâche en cours"}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{statusLabel(job)}{job.queuePosition ? ` · position ${job.queuePosition}` : ""}</p></div>{TERMINAL.includes(job.status) && <button type="button" onClick={newTask} className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm hover:bg-[var(--background-panel)]">Nouvelle tâche</button>}</div>

                {!TERMINAL.includes(job.status) && (
                  <ol className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-7" aria-label="Avancement">
                    {STAGES.map((stage, index) => <li key={stage.id} className={`text-center text-[0.68rem] ${index <= stageIndex ? "text-[var(--accent)]" : "text-[var(--foreground-muted)]"}`}><span className={`mx-auto mb-1 block h-1.5 rounded-full ${index <= stageIndex ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />{stage.label}</li>)}
                  </ol>
                )}

                {answer && <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><p className="whitespace-pre-wrap text-sm leading-6">{answer}</p></div>}

                {job.plan?.actions && job.plan.actions.length > 0 && (
                  <section><h3 className="mb-2 font-semibold">Plan proposé</h3><ol className="space-y-2">{job.plan.actions.map((action, index) => <li key={`${action.id}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{index + 1}. {action.id.replaceAll(".", " · ")}</span><RiskBadge risk={action.risk} /></div><p className="mt-1 text-sm leading-5 text-[var(--foreground-muted)]">{action.reason}</p></li>)}</ol></section>
                )}

                {Array.isArray(job.preview) && (
                  <section><h3 className="mb-2 font-semibold">Aperçu exact</h3><div className="space-y-3">{job.preview.map((row, index) => <Preview key={index} row={row as Record<string, unknown>} />)}</div></section>
                )}

                {job.items.length > 0 && TERMINAL.includes(job.status) && (
                  <section><h3 className="mb-2 font-semibold">Résultats</h3><ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">{job.items.map((item) => <li key={item.sequence} className="flex items-start justify-between gap-3 py-3 text-sm"><span>{item.id.replaceAll(".", " · ")}{item.error ? <span className="mt-1 block text-red-300">{item.error}</span> : null}</span><span className={item.status === "completed" || item.status === "restored" ? "text-[var(--accent)]" : "text-red-300"}>{item.status === "completed" ? "Appliqué" : item.status === "restored" ? "Restauré" : "Échec"}</span></li>)}</ul></section>
                )}

                <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                  {job.status === "awaiting_first_approval" && <button type="button" disabled={busy} onClick={() => void operate("approve_first")} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#071016] disabled:opacity-50">Valider le plan et préparer la sauvegarde</button>}
                  {job.status === "awaiting_second_approval" && <button type="button" disabled={busy} onClick={() => void operate("approve_second")} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#071016] disabled:opacity-50">Confirmer l'exécution</button>}
                  {!TERMINAL.includes(job.status) && job.status !== "executing" && <button type="button" disabled={busy} onClick={() => void operate("cancel")} className="min-h-11 rounded-lg border border-red-500/40 px-4 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-50">Annuler la tâche</button>}
                  {["completed", "partial"].includes(job.status) && job.items.some((item) => item.status === "completed") && job.items.filter((item) => item.status === "completed").every((item) => item.reversible) && <button type="button" disabled={busy} onClick={() => void operate("restore")} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm hover:bg-[var(--background-panel)] disabled:opacity-50">Préparer la restauration des actions appliquées</button>}
                  <Link href="/admin/assistants-ia" className="ml-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-panel)] hover:text-[var(--foreground)]">Voir l'historique</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function statusLabel(job: AdminJobView) {
  if (job.status === "queued") return "En file";
  if (job.status === "awaiting_first_approval") return "Plan à valider";
  if (job.status === "awaiting_second_approval") return "Aperçu à confirmer";
  if (job.status === "executing") return "Exécution en cours";
  if (job.status === "completed") return "Terminé";
  if (job.status === "partial") return "Terminé avec des échecs";
  if (job.status === "failed") return "Échec";
  if (job.status === "cancelled") return "Annulé";
  if (job.status === "expired") return "Expiré";
  return "Analyse en cours";
}

function RiskBadge({ risk }: { risk: string }) { const label = risk === "isolated" ? "Renforcé" : risk === "reversible" ? "Réversible" : "Lecture"; return <span className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${risk === "isolated" ? "bg-red-500/15 text-red-200" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>{label}</span>; }

function Preview({ row }: { row: Record<string, unknown> }) {
  return <details className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3" open><summary className="cursor-pointer text-sm font-medium">{String(row.actionId ?? "Modification").replaceAll(".", " · ")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Snapshot title="Avant" value={row.before} /><Snapshot title="Après" value={row.after} /></div></details>;
}
function Snapshot({ title, value }: { title: string; value: unknown }) { const entries = value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).filter(([key]) => !["created_at", "updated_at"].includes(key)).slice(0, 30) : []; return <div><h4 className="mb-1 text-xs font-semibold text-[var(--foreground-muted)]">{title}</h4>{entries.length ? <dl className="space-y-1 text-xs">{entries.map(([key, content]) => <div key={key} className="grid grid-cols-[minmax(6rem,38%)_1fr] gap-2"><dt className="text-[var(--foreground-muted)]">{key.replaceAll("_", " ")}</dt><dd className="break-words text-[var(--foreground)]">{typeof content === "object" ? JSON.stringify(content) : String(content ?? "—")}</dd></div>)}</dl> : <p className="text-xs text-[var(--foreground-muted)]">Aucune donnée</p>}</div>; }
function BotIcon({ className }: { className: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 13h.01M15 13h.01M8 17h8" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function ExpandIcon({ expanded }: { expanded: boolean }) { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>{expanded ? <><path d="m9 3 .1 5.9L3 9M15 21l-.1-5.9L21 15" /></> : <><path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" /></>}</svg>; }
