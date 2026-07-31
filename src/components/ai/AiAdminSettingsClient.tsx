"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";

type Dashboard = {
  settings: Record<string, unknown>;
  usage: {
    committedUsd: number; settledUsd: number; reservedUsd: number; calls: number;
    inputTokens: number; cachedInputTokens: number; outputTokens: number;
    perPlayer: Array<{ userId: string; name: string; country: string | null; costUsd: number; calls: number }>;
  };
  feedback: Array<Record<string, unknown>>;
  reportCount: number;
  worker: Record<string, unknown> | null;
  jobs: Array<Record<string, unknown>>;
};

const MODELS = [
  ["gpt-5.6-luna", "Luna"], ["gpt-5.6-terra", "Terra"], ["gpt-5.6-sol", "Sol"],
] as const;
const EFFORTS = [["none", "Aucun"], ["low", "Faible"], ["medium", "Moyen"], ["high", "Élevé"]] as const;
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function AiAdminSettingsClient() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState(false);
  const [installCommand, setInstallCommand] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/ai/admin?view=settings", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error || "Chargement impossible.");
    setDashboard(data);
    setForm({
      playerEnabled: data.settings.player_enabled,
      playerModel: data.settings.player_model,
      playerEffort: data.settings.player_effort,
      adminSimpleModel: data.settings.admin_simple_model,
      adminComplexModel: data.settings.admin_complex_model,
      adminEffort: data.settings.admin_effort,
      budgetUsd: Number(data.settings.budget_usd),
    });
  }
  useEffect(() => { void load(); }, []);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/ai/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Opération impossible.");
    return data;
  }

  async function save() {
    setSaving(true); setError(null); setNotice(null);
    try {
      await post({ operation: "update_settings", ...form });
      setNotice("Réglages enregistrés.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  async function generateToken() {
    setSaving(true); setError(null);
    try {
      const data = await post({ operation: "create_worker_token" });
      setInstallCommand(data.installCommand);
      setConfirmToken(false);
      setNotice("Nouveau jeton créé. L'ancien relais est révoqué.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Jeton impossible."); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!dashboard?.worker?.id) return;
    setSaving(true); setError(null);
    try { await post({ operation: "revoke_worker", workerId: dashboard.worker.id }); setNotice("Relais désactivé."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Désactivation impossible."); }
    finally { setSaving(false); }
  }

  const workerOnline = useMemo(() => {
    const lastSeen = dashboard?.worker?.last_seen_at;
    return dashboard?.worker?.enabled === true && typeof lastSeen === "string" && Date.now() - new Date(lastSeen).getTime() < 60_000;
  }, [dashboard]);

  if (loading && !dashboard) return <p className="mt-8 text-sm text-[var(--foreground-muted)]">Chargement…</p>;
  if (!dashboard) return <p className="mt-8 text-sm text-red-300">{error ?? "Données indisponibles."}</p>;
  const budget = Number(form.budgetUsd ?? dashboard.settings.budget_usd ?? 20);
  const committed = dashboard.usage.committedUsd;
  const progress = Math.min(100, budget > 0 ? committed / budget * 100 : 100);

  return (
    <div className="admin-settings-form mt-7 border-y border-[var(--border)]">
      {(error || notice) && <p role={error ? "alert" : "status"} className={`my-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-500/35 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>{error ?? notice}</p>}

      <section className="grid gap-5 border-b border-[var(--border)] py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div><h2 className="font-semibold">Relais Windows</h2><p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">Codex local et copie filtrée du dépôt.</p></div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${workerOnline ? "bg-[var(--accent)]" : "bg-red-400"}`} aria-hidden /><strong>{workerOnline ? "En ligne" : "Hors ligne"}</strong>{dashboard.worker?.codex_version ? <span className="text-sm text-[var(--foreground-muted)]">{String(dashboard.worker.codex_version)}</span> : null}</div>
          <p className="text-sm leading-6 text-[var(--foreground-muted)]">{dashboard.worker?.sandbox_verified_at ? "Bac à sable Windows élevé vérifié." : "Le relais restera inactif tant que le bac à sable élevé n'est pas vérifié."}</p>
          {!confirmToken ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setConfirmToken(true)} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#071016]">{dashboard.worker ? "Régénérer le jeton" : "Installer le relais"}</button>{dashboard.worker && <button type="button" disabled={saving} onClick={() => void revoke()} className="min-h-11 rounded-lg border border-red-500/40 px-4 text-sm text-red-200">Désactiver</button>}</div> : <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4"><p className="text-sm leading-6 text-amber-50">Créer un nouveau jeton révoque immédiatement l'ancien relais.</p><div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={() => void generateToken()} className="min-h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-[#241b02]">Confirmer</button><button type="button" onClick={() => setConfirmToken(false)} className="min-h-11 rounded-lg border border-amber-200/25 px-4 text-sm">Annuler</button></div></div>}
          {installCommand && <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><p className="mb-2 text-sm font-medium">À exécuter une seule fois sur le PC Windows</p><code className="block overflow-x-auto whitespace-pre-wrap break-all text-xs leading-5 text-[var(--foreground-muted)]">{installCommand}</code><button type="button" onClick={() => navigator.clipboard.writeText(installCommand)} className="mt-3 min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm hover:bg-[var(--background-panel)]">Copier la commande</button></div>}
        </div>
      </section>

      <section className="grid gap-5 border-b border-[var(--border)] py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div><h2 className="font-semibold">Secrétaire joueur</h2><p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">Désactivé au lancement jusqu'à votre décision.</p></div>
        <div className="space-y-4">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={form.playerEnabled === true} onChange={(event) => setForm((row) => ({ ...row, playerEnabled: event.target.checked }))} className="h-5 w-5 accent-[var(--accent)]" /><span>Autoriser les joueurs liés à un pays</span></label>
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Modèle" value={String(form.playerModel)} onChange={(value) => setForm((row) => ({ ...row, playerModel: value }))} options={MODELS} /><SelectField label="Effort" value={String(form.playerEffort)} onChange={(value) => setForm((row) => ({ ...row, playerEffort: value }))} options={EFFORTS} /></div>
        </div>
      </section>

      <section className="grid gap-5 border-b border-[var(--border)] py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div><h2 className="font-semibold">Routage admin</h2><p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">Terra pour une tâche simple, Sol pour une demande complexe.</p></div>
        <div className="grid gap-4 sm:grid-cols-3"><SelectField label="Tâche simple" value={String(form.adminSimpleModel)} onChange={(value) => setForm((row) => ({ ...row, adminSimpleModel: value }))} options={MODELS.slice(1)} /><SelectField label="Tâche complexe" value={String(form.adminComplexModel)} onChange={(value) => setForm((row) => ({ ...row, adminComplexModel: value }))} options={MODELS.slice(1)} /><SelectField label="Effort" value={String(form.adminEffort)} onChange={(value) => setForm((row) => ({ ...row, adminEffort: value }))} options={EFFORTS} /></div>
      </section>

      <section className="grid gap-5 border-b border-[var(--border)] py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div><h2 className="font-semibold">Budget OpenAI</h2><p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">Commun aux joueurs et au fallback admin.</p></div>
        <div className="space-y-4"><label className="block max-w-xs"><span className="mb-1 block text-sm text-[var(--foreground-muted)]">Plafond en dollars</span><input type="number" min="0.01" max="100000" step="0.01" value={Number(form.budgetUsd ?? 20)} onChange={(event) => setForm((row) => ({ ...row, budgetUsd: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3" /></label><div><div className="mb-2 flex justify-between text-sm"><strong>{money.format(committed)} engagés</strong><span className="text-[var(--foreground-muted)]">sur {money.format(budget)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div></div><dl className="grid gap-2 text-sm sm:grid-cols-3"><Stat label="Appels réglés" value={formatNumber(dashboard.usage.calls)} /><Stat label="Entrée / cache" value={`${formatNumber(dashboard.usage.inputTokens)} / ${formatNumber(dashboard.usage.cachedInputTokens)}`} /><Stat label="Sortie" value={formatNumber(dashboard.usage.outputTokens)} /></dl></div>
      </section>

      <div className="flex justify-end border-b border-[var(--border)] py-4"><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[#071016] hover:bg-[var(--accent-hover)] disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer les réglages"}</button></div>

      <section className="border-b border-[var(--border)] py-6"><div className="mb-4 flex items-center gap-3"><h2 className="font-semibold">Consommation par joueur</h2><span className="text-xs text-[var(--foreground-muted)]">Aucun texte de conversation conservé</span></div>{dashboard.usage.perPlayer.length ? <div className="overflow-x-auto"><table className="admin-responsive-table w-full text-sm"><thead><tr className="text-left text-[var(--foreground-muted)]"><th className="py-2">Joueur</th><th>Pays</th><th>Appels</th><th>Coût</th></tr></thead><tbody>{dashboard.usage.perPlayer.map((row) => <tr key={row.userId} className="border-t border-[var(--border-muted)]"><td data-label="Joueur" className="py-2">{row.name}</td><td data-label="Pays">{row.country ?? "—"}</td><td data-label="Appels">{formatNumber(row.calls)}</td><td data-label="Coût">{money.format(row.costUsd)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--foreground-muted)]">Aucune consommation joueur.</p>}</section>

      <section className="border-b border-[var(--border)] py-6"><div className="mb-4 flex items-center gap-3"><h2 className="font-semibold">Retours joueurs</h2>{dashboard.reportCount > 0 && <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">{dashboard.reportCount} signalement{dashboard.reportCount > 1 ? "s" : ""}</span>}</div>{dashboard.feedback.length ? <ul className="divide-y divide-[var(--border-muted)] border-y border-[var(--border-muted)]">{dashboard.feedback.map((row) => <li key={String(row.id)} className="py-3 text-sm"><div className="flex items-center justify-between gap-3"><span className={row.rating === 1 ? "text-[var(--accent)]" : "text-red-300"}>{row.rating === 1 ? "Positif" : "Négatif"}{row.is_report === true ? " · Signalé" : ""}</span><time className="text-xs text-[var(--foreground-muted)]">{new Date(String(row.created_at)).toLocaleString("fr-FR")}</time></div>{row.is_report === true && <div className="mt-2 space-y-1 rounded-xl bg-[var(--background)] p-3"><p><strong>Question :</strong> {String(row.question)}</p><p><strong>Réponse :</strong> {String(row.answer)}</p></div>}</li>)}</ul> : <p className="text-sm text-[var(--foreground-muted)]">Aucun retour.</p>}</section>

      <section className="py-6"><h2 className="mb-4 font-semibold">Mes opérations récentes</h2>{dashboard.jobs.length ? <ul className="divide-y divide-[var(--border-muted)] border-y border-[var(--border-muted)]">{dashboard.jobs.map((job) => <li key={String(job.id)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium">{String(job.summary ?? "Tâche en cours")}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{new Date(String(job.created_at)).toLocaleString("fr-FR")}</p></div><span className="text-[var(--foreground-muted)]">{String(job.status).replaceAll("_", " ")}</span></li>)}</ul> : <p className="text-sm text-[var(--foreground-muted)]">Aucune opération.</p>}</section>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <label className="block"><span className="mb-1 block text-sm text-[var(--foreground-muted)]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3">{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="border-t border-[var(--border-muted)] pt-2"><dt className="text-xs text-[var(--foreground-muted)]">{label}</dt><dd className="mt-1 font-mono tabular-nums">{value}</dd></div>; }
