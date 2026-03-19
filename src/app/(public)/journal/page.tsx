import Link from "next/link";
import { getCachedAuth } from "@/lib/auth-server";
import { getRealmBySlug } from "@/lib/effects/service";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";

export const revalidate = 60;

type RealmHistoryRow = {
  id: string;
  tick_run_id: string;
  realm_id: string;
  snapshot: { resources?: Record<string, number>; meta?: unknown };
  created_at: string;
  tick_runs: Array<{ started_at: string; status: string }> | null;
};

function getResourceDeltas(
  current: Record<string, number>,
  previous: Record<string, number> | undefined,
): Array<{ key: string; value: number; delta: number }> {
  const keys = new Set([...Object.keys(current), ...(previous ? Object.keys(previous) : [])]);
  return Array.from(keys).map((key) => {
    const value = current[key] ?? 0;
    const prev = previous?.[key] ?? 0;
    return { key, value, delta: value - prev };
  });
}

export default async function JournalPage() {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.playerRealmSlug) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="font-serif text-2xl font-bold text-amber-100">Chroniques du Royaume</h1>
          <p className="mt-4 text-stone-500">
            Vous devez être connecté et avoir un royaume assigné pour consulter les chroniques.
          </p>
          <Link href="/" className="mt-6 inline-block text-amber-200 underline hover:text-amber-100">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const realm = await getRealmBySlug(auth.playerRealmSlug);
  if (!realm) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="font-serif text-2xl font-bold text-amber-100">Chroniques du Royaume</h1>
          <p className="mt-4 text-stone-500">Royaume introuvable.</p>
          <Link href="/" className="mt-6 inline-block text-amber-200 underline hover:text-amber-100">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: resourceKindsData } = await supabase.from("resource_kinds").select("key, label_fr");
  const resourceKinds = (resourceKindsData ?? []) as Array<{ key: string; label_fr: string }>;
  const labelByKey = Object.fromEntries(resourceKinds.map((rk) => [rk.key, rk.label_fr]));

  const { data: historyData, error: historyError } = await supabase
    .from("realm_history")
    .select("id, tick_run_id, realm_id, snapshot, created_at, tick_runs(started_at, status)")
    .eq("realm_id", realm.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (historyError) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="font-serif text-2xl font-bold text-amber-100">Chroniques du Royaume</h1>
          <p className="mt-4 text-red-400">Erreur lors du chargement de l&apos;historique.</p>
          <Link href="/" className="mt-6 inline-block text-amber-200 underline hover:text-amber-100">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const history = (historyData ?? []) as RealmHistoryRow[];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-10 border-b border-amber-900/50 pb-6">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">
            Chroniques du Royaume
          </h1>
          <p className="mt-2 text-stone-500">
            {realm.name} · Historique des tours et variations des ressources
          </p>
        </header>

        {history.length === 0 ? (
          <section className="rounded-lg border border-stone-700 bg-stone-900/80 p-6">
            <p className="text-stone-500">Aucun tour enregistré pour l&apos;instant.</p>
            <Link href="/" className="mt-4 inline-block text-amber-200 underline hover:text-amber-100">
              Retour à l&apos;accueil
            </Link>
          </section>
        ) : (
          <ul className="space-y-6">
            {history.map((row, index) => {
              const resources = (row.snapshot?.resources && typeof row.snapshot.resources === "object")
                ? (row.snapshot.resources as Record<string, number>)
                : {};
              const previous = history[index + 1]?.snapshot?.resources;
              const previousResources =
                previous && typeof previous === "object" ? (previous as Record<string, number>) : undefined;
              const deltas = getResourceDeltas(resources, previousResources);
              const tickRun = row.tick_runs?.[0] ?? null;
              const startedAt = tickRun?.started_at
                ? new Date(tickRun.started_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(row.created_at).toLocaleDateString("fr-FR");
              const isSuccess = tickRun?.status === "succeeded";

              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-stone-700 bg-stone-900/80 p-5 shadow-lg"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-serif text-xl font-semibold text-amber-100">
                      Tour du {startedAt}
                    </h2>
                    <span
                      className={
                        isSuccess
                          ? "rounded bg-emerald-900/50 px-2 py-0.5 text-sm text-emerald-200"
                          : "rounded bg-stone-600 px-2 py-0.5 text-sm text-stone-300"
                      }
                    >
                      {isSuccess ? "Terminé" : tickRun?.status ?? "—"}
                    </span>
                  </div>
                  {index === history.length - 1 && (
                    <p className="mt-1 text-sm text-stone-500">État au dernier tour.</p>
                  )}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[280px] text-sm">
                      <thead>
                        <tr className="border-b border-stone-600 text-left text-stone-500">
                          <th className="py-2 font-medium">Ressource</th>
                          <th className="py-2 text-right font-medium">Valeur</th>
                          <th className="py-2 text-right font-medium">Variation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deltas.map(({ key, value, delta }) => (
                          <tr key={key} className="border-b border-stone-800/80">
                            <td className="py-2 text-stone-300">{labelByKey[key] ?? key}</td>
                            <td className="py-2 text-right font-medium text-amber-100">
                              {formatNumber(value)}
                            </td>
                            <td className="py-2 text-right">
                              {index < history.length - 1 ? (
                                <span
                                  className={
                                    delta > 0
                                      ? "text-emerald-400"
                                      : delta < 0
                                        ? "text-red-400"
                                        : "text-stone-500"
                                  }
                                >
                                  {delta > 0 ? "+" : ""}
                                  {formatNumber(delta)}
                                </span>
                              ) : (
                                <span className="text-stone-500">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-sm text-stone-500">
          <Link href="/" className="underline hover:text-amber-200">
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
