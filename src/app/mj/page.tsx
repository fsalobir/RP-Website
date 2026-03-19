import { createServiceRoleClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MjPanel } from "./_components/MjPanel";
import { dissiperEffet, creerEffet } from "./_actions/effects";
import { triggerTick } from "./_actions/tick";

export const revalidate = 0;

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export default async function MjDashboardPage() {
  const admin = createServiceRoleClient();

  const [realmsRes, provincesRes, racesRes, effectsRes, tickRunsRes] = await Promise.all([
    admin.from("realms").select("id, slug, name, player_user_id, is_npc").order("name"),
    admin.from("provinces").select("id, realm_id, name, attrs").order("name"),
    admin
      .from("province_races")
      .select("province_id, share_pct, count, races ( id, key, label_fr )")
      .order("province_id"),
    admin
      .from("effects")
      .select("id, effect_kind, value, duration_kind, duration_remaining, target_type, target_id, target_subkey, source_label, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("tick_runs")
      .select("id, started_at, ended_at, status, triggered_by, notes")
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  const realms = (realmsRes.data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    player_user_id: string | null;
    is_npc: boolean;
  }>;
  const provinces = (provincesRes.data ?? []) as Array<{ id: string; realm_id: string; name: string; attrs: unknown }>;
  const effects = (effectsRes.data ?? []) as Array<{
    id: string;
    effect_kind: string;
    value: number;
    duration_kind: string;
    duration_remaining: number | null;
    target_type: string;
    target_id: string;
    target_subkey: string | null;
    source_label: string | null;
    created_at: string;
  }>;

  const provinceRaces = (racesRes.data ?? []) as Array<{
    province_id: string;
    share_pct: number | null;
    count: number | null;
    // Selon PostgREST, le join peut ressortir en tableau.
    races: Array<{ id: string; key: string; label_fr: string }> | { id: string; key: string; label_fr: string } | null;
  }>;

  const racesByProvinceId = new Map<string, typeof provinceRaces>();
  for (const pr of provinceRaces) {
    const list = racesByProvinceId.get(pr.province_id) ?? [];
    list.push(pr);
    racesByProvinceId.set(pr.province_id, list);
  }

  const realmsById = new Map(realms.map((r) => [r.id, r]));

  const tickRuns = (tickRunsRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    triggered_by: string;
    notes: string | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tableau de bord MJ</h1>
          <p className="mt-1 text-sm text-white/60">
            Supervision des royaumes, provinces, effets et du temps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/mj/entites"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            Gérer les entités
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MjPanel
          title="Levier du Temps"
          subtitle="Décrémentation des durées d’effets et purge des effets expirés."
          right={
            <form
              action={async () => {
                "use server";
                await triggerTick();
              }}
            >
              <button
                type="submit"
                className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300"
              >
                DÉCLENCHER UN TOUR
              </button>
            </form>
          }
        >
          <p className="text-sm text-white/70">
            Cette action crée un <code className="text-white/90">tick_runs</code>, décrémente les durées des effets et supprime ceux arrivés à zéro.
          </p>
        </MjPanel>

        <MjPanel
          title="Gestionnaire de Sortilèges"
          subtitle="Lister, dissiper et créer des effets (table `effects`)."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">Créer un effet</h3>
              <p className="mt-1 text-xs text-white/60">
                Type <span className="font-mono">sum_</span> / <span className="font-mono">mult_</span> + ressource (ex: <span className="font-mono">gold</span>).
              </p>

              <form
                action={async (formData) => {
                  "use server";
                  const targetType = String(formData.get("targetType") ?? "") as "realm" | "province";
                  const targetId = String(formData.get("targetId") ?? "");
                  const targetSubkey = String(formData.get("targetSubkey") ?? "");
                  const kindPrefix = String(formData.get("kindPrefix") ?? "") as "sum_" | "mult_";
                  const value = Number(formData.get("value") ?? 0);
                  const durationMode = String(formData.get("durationMode") ?? "") as "permanent" | "ticks";
                  const durationTicksRaw = String(formData.get("durationTicks") ?? "");
                  const durationTicks = durationTicksRaw ? Number(durationTicksRaw) : undefined;
                  const sourceLabel = String(formData.get("sourceLabel") ?? "");
                  await creerEffet({
                    targetType,
                    targetId,
                    targetSubkey,
                    kindPrefix,
                    value,
                    durationMode,
                    durationTicks,
                    sourceLabel,
                  });
                }}
                className="mt-4 space-y-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-white/70">
                    Cible
                    <select
                      name="targetType"
                      defaultValue="realm"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
                    >
                      <option value="realm">Royaume</option>
                      <option value="province">Province</option>
                    </select>
                  </label>
                  <label className="text-xs text-white/70">
                    ID cible
                    <select
                      name="targetId"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
                      required
                    >
                      <optgroup label="Royaumes">
                        {realms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.slug})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Provinces">
                        {provinces.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-white/70">
                    Ressource ciblée
                    <input
                      name="targetSubkey"
                      placeholder="gold"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
                      required
                    />
                  </label>
                  <label className="text-xs text-white/70">
                    Type
                    <select
                      name="kindPrefix"
                      defaultValue="sum_"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
                    >
                      <option value="sum_">sum_ (ajout)</option>
                      <option value="mult_">mult_ (multiplicateur)</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-white/70">
                    Valeur
                    <input
                      name="value"
                      type="number"
                      step="0.01"
                      defaultValue="1"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      required
                    />
                  </label>
                  <label className="text-xs text-white/70">
                    Source (libellé)
                    <input
                      name="sourceLabel"
                      placeholder="MJ"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-white/70">
                    Durée
                    <select
                      name="durationMode"
                      defaultValue="ticks"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
                    >
                      <option value="ticks">Ticks</option>
                      <option value="permanent">Permanent</option>
                    </select>
                  </label>
                  <label className="text-xs text-white/70">
                    Nombre de ticks
                    <input
                      name="durationTicks"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={3}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Créer l’effet
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">Effets actifs</h3>
              <p className="mt-1 text-xs text-white/60">
                {effects.length} effet(s)
              </p>
              <div className="mt-4 space-y-3 max-h-[22rem] overflow-auto pr-1">
                {effects.length === 0 ? (
                  <p className="text-sm text-white/60">Aucun effet en base.</p>
                ) : (
                  effects.map((e) => (
                    <div key={e.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/90 truncate">
                            {e.effect_kind} = {e.value}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            Cible: {e.target_type} / {e.target_id}
                            {e.target_subkey ? ` • ${e.target_subkey}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-white/50">
                            Durée: {e.duration_kind === "permanent" ? "Permanent" : `${e.duration_remaining ?? "?"} ticks`}
                            {e.source_label ? ` • Source: ${e.source_label}` : ""}
                          </p>
                        </div>
                        <form
                          action={async () => {
                            "use server";
                            await dissiperEffet(e.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/60"
                          >
                            Dissiper
                          </button>
                        </form>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </MjPanel>
      </div>

      <MjPanel
        title="Historique des Tours"
        subtitle="Derniers ticks exécutés : statut, date et erreurs éventuelles."
      >
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/60">
                <th className="py-2 pr-4">Début</th>
                <th className="py-2 pr-4">Fin</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Déclenché par</th>
                <th className="py-2 pr-4">Notes / Erreur</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              {tickRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-white/50">
                    Aucun tour enregistré.
                  </td>
                </tr>
              ) : (
                tickRuns.map((t) => (
                  <tr key={t.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 font-mono text-xs text-white/70">
                      {t.started_at
                        ? new Date(t.started_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-white/70">
                      {t.ended_at
                        ? new Date(t.ended_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          t.status === "succeeded"
                            ? "rounded bg-emerald-900/50 px-2 py-0.5 text-emerald-200"
                            : t.status === "failed"
                              ? "rounded bg-red-900/50 px-2 py-0.5 text-red-200"
                              : t.status === "running"
                                ? "rounded bg-amber-900/50 px-2 py-0.5 text-amber-200"
                                : "rounded bg-stone-600 px-2 py-0.5 text-stone-300"
                        }
                      >
                        {t.status === "succeeded"
                          ? "Réussi"
                          : t.status === "failed"
                            ? "Échec"
                            : t.status === "running"
                              ? "En cours"
                              : t.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-white/70">{t.triggered_by}</td>
                    <td className="max-w-xs py-2 pr-4 text-xs text-white/60 truncate" title={t.notes ?? undefined}>
                      {t.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </MjPanel>

      <MjPanel title="Royaumes" subtitle="Liste complète des royaumes (table `realms`).">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/60">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4">PNJ</th>
                <th className="py-2 pr-4">Joueur (user_id)</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              {realms.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 pr-4 font-medium text-white">{r.name}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-white/70">{r.slug}</td>
                  <td className="py-2 pr-4">{r.is_npc ? "Oui" : "Non"}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-white/70">{r.player_user_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MjPanel>

      <MjPanel title="Provinces" subtitle="Ressources de base (attrs) et habitants (races) par province.">
        <div className="space-y-4">
          {provinces.map((p) => {
            const realm = realmsById.get(p.realm_id);
            const inhabitants = racesByProvinceId.get(p.id) ?? [];
            return (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {p.name}{" "}
                      <span className="text-xs font-normal text-white/50">
                        — Royaume: {realm ? `${realm.name} (${realm.slug})` : p.realm_id}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-white/50 font-mono">province_id: {p.id}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-white/60">Attrs (JSONB)</h4>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80 whitespace-pre-wrap break-words">
                      {prettyJson(p.attrs)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-white/60">Habitants</h4>
                    <div className="mt-2 space-y-2">
                      {inhabitants.length === 0 ? (
                        <p className="text-sm text-white/60">Aucune race rattachée.</p>
                      ) : (
                        inhabitants.map((h, idx) => {
                          const race = Array.isArray(h.races) ? (h.races[0] ?? null) : h.races;
                          return (
                          <div key={`${p.id}-${race?.id ?? idx}`} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <p className="text-sm font-semibold text-white/90">
                              {race?.label_fr ?? "Race inconnue"}
                              {race?.key ? (
                                <span className="ml-2 text-xs font-normal text-white/50 font-mono">
                                  ({race.key})
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs text-white/60">
                              {h.share_pct != null ? `Part: ${Number(h.share_pct)}%` : null}
                              {h.share_pct != null && h.count != null ? " • " : null}
                              {h.count != null ? `Nombre: ${Number(h.count)}` : null}
                              {h.share_pct == null && h.count == null ? "Aucun détail (share_pct/count vides)." : null}
                            </p>
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </MjPanel>
    </div>
  );
}

