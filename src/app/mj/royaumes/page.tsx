import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRealm } from "../_actions/realms";
import { MjCreateRealmModal } from "./MjCreateRealmModal";

export const revalidate = 0;

type RealmRow = {
  id: string;
  name: string;
  slug: string;
  is_npc: boolean;
  color_hex: string | null;
  banner_url: string | null;
  summary: string | null;
  leader_name: string | null;
  player_user_id: string | null;
  settings: Record<string, unknown> | null;
};

export default async function MjRoyaumesPage() {
  const admin = createServiceRoleClient();
  const [{ data: realmsData, error: realmsError }, { data: assignmentsData }] = await Promise.all([
    admin
      .from("realms")
      .select("id, name, slug, is_npc, color_hex, banner_url, summary, leader_name, player_user_id, settings")
      .order("name"),
    admin.from("realm_player_assignments").select("realm_id, email, display_name, user_id"),
  ]);

  const realms = (realmsData ?? []) as RealmRow[];
  const assignments = new Map<string, { email: string | null; display_name: string | null; user_id: string | null }>();
  for (const row of assignmentsData ?? []) assignments.set(String((row as any).realm_id), row as any);

  async function createRealmAction(formData: FormData) {
    "use server";
    await createRealm({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      is_npc: String(formData.get("is_npc") ?? "") === "on",
      color_hex: String(formData.get("color_hex") ?? "") || null,
      banner_url: String(formData.get("banner_url") ?? "") || null,
      summary: String(formData.get("summary") ?? "") || null,
      leader_name: String(formData.get("leader_name") ?? "") || null,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Royaumes (MJ)</h1>
          <p className="mt-1 text-sm text-white/60">Vue miroir de la page publique, avec édition complète et assignation joueur.</p>
        </div>
        <div className="flex items-center gap-2">
          <MjCreateRealmModal createRealmAction={createRealmAction} />
          <Link href="/royaumes" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10">
            Voir la page publique
          </Link>
        </div>
      </header>

      {realmsError && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
          Erreur de chargement: {realmsError.message}
        </div>
      )}

      <section className="space-y-4">
        <div className="overflow-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-white/10 text-left text-stone-300">
              <tr>
                <th className="px-4 py-3">Couleur</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Leader</th>
                <th className="px-4 py-3">Joueur assigné</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-stone-100/90">
              {realms.map((realm) => {
                const assignment = assignments.get(realm.id);
                return (
                  <tr key={realm.id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <span className="inline-block h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: realm.color_hex ?? "#888888" }} />
                    </td>
                    <td className="px-4 py-3 font-medium">{realm.name}</td>
                    <td className="px-4 py-3 text-xs text-stone-400">{realm.slug}</td>
                    <td className="px-4 py-3 text-xs text-stone-300">{realm.is_npc ? "PNJ" : "Joueur"}</td>
                    <td className="px-4 py-3">{realm.leader_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-stone-300">
                      {assignment?.display_name || assignment?.email || assignment?.user_id || realm.player_user_id || "non lié"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/mj/royaumes/${realm.id}`} className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                          Éditer
                        </Link>
                        <Link href={`/royaume/${realm.slug}`} className="text-xs text-amber-200 underline">
                          Voir public
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

