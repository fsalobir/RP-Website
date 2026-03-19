import Link from "next/link";
import { createAnonClientForCache } from "@/lib/supabase/server";

export const revalidate = 60;

type RealmRow = {
  id: string;
  slug: string;
  name: string;
  is_npc: boolean;
  color_hex?: string | null;
  banner_url?: string | null;
  summary?: string | null;
  leader_name?: string | null;
  settings: any;
};

function safeSettingString(settings: any, key: string): string {
  const v = settings && typeof settings === "object" && !Array.isArray(settings) ? settings[key] : null;
  return typeof v === "string" ? v : "—";
}

function safeSettingUrl(settings: any, key: string): string | null {
  const v = settings && typeof settings === "object" && !Array.isArray(settings) ? settings[key] : null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function RoyaumesPage() {
  const supabase = createAnonClientForCache();

  const { data, error } = await supabase
    .from("realms")
    .select("id, slug, name, is_npc, color_hex, banner_url, summary, leader_name, settings")
    .order("name");

  const realms = (data ?? []) as RealmRow[];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 border-b border-amber-900/40 pb-4">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">Royaumes</h1>
          <p className="mt-2 text-sm text-stone-500">
            Liste des royaumes connus et de leurs informations publiques.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-5">
            <p className="font-semibold text-red-200">Erreur lors du chargement.</p>
            <p className="mt-2 text-sm text-red-200/80">{error.message}</p>
          </div>
        ) : realms.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-stone-300">
            Aucun royaume pour l’instant.
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-white/10 text-left text-stone-300">
                <tr>
                  <th className="px-4 py-3">Drapeau</th>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Race</th>
                  <th className="px-4 py-3">Leader</th>
                  <th className="px-4 py-3">Résumé</th>
                </tr>
              </thead>
              <tbody className="text-stone-100/90">
                {realms.map((r) => {
                  const flagUrl = r.banner_url || safeSettingUrl(r.settings, "flag_url");
                  const race = safeSettingString(r.settings, "race");
                  const leader = r.leader_name || safeSettingString(r.settings, "leader");
                  return (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="px-4 py-3">
                        {flagUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={flagUrl}
                            alt={`Drapeau de ${r.name}`}
                            className="h-7 w-11 rounded border border-white/10 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-7 w-11 rounded border border-white/10 bg-black/30" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-white/20 align-middle"
                          style={{ backgroundColor: r.color_hex ?? "rgba(245, 158, 11, 0.8)" }}
                        />
                        <Link href={`/royaume/${r.slug}`} className="hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-300">{r.is_npc ? "PNJ" : "Joueur"}</td>
                      <td className="px-4 py-3 text-stone-200/90">{race}</td>
                      <td className="px-4 py-3 text-stone-200/90">{leader}</td>
                      <td className="max-w-[320px] px-4 py-3 text-stone-300">{r.summary || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-sm text-stone-500">
          <Link href="/" className="underline hover:text-amber-200">
            ← Retour à l’accueil
          </Link>
        </p>
      </div>
    </div>
  );
}

