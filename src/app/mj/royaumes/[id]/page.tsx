import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assignRealmPlayer, updateProvinceCapital, updateRealm, updateRealmNationalCapital } from "../../_actions/realms";

export const revalidate = 0;

export default async function MjRealmEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();
  const [{ data: realm }, { data: assignment }, usersRes, provincesRes, citiesRes] = await Promise.all([
    admin
      .from("realms")
      .select("id, name, slug, is_npc, color_hex, banner_url, summary, leader_name, player_user_id, capital_city_id, settings")
      .eq("id", id)
      .maybeSingle(),
    admin.from("realm_player_assignments").select("realm_id, user_id, email, display_name").eq("realm_id", id).maybeSingle(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("provinces").select("id, realm_id, name, capital_city_id").eq("realm_id", id).order("name"),
    admin.from("cities").select("id, province_id, realm_id, name, lon, lat").eq("realm_id", id).order("name"),
  ]);
  if (!realm) notFound();

  const users = (usersRes.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    name:
      (typeof u.user_metadata?.full_name === "string" && u.user_metadata.full_name.trim()) ||
      (typeof u.user_metadata?.name === "string" && u.user_metadata.name.trim()) ||
      "",
  }));

  const selectedUserId = assignment?.user_id ?? realm.player_user_id ?? "";
  const provinces = (provincesRes.data ?? []) as Array<{ id: string; realm_id: string; name: string; capital_city_id: string | null }>;
  const cities = (citiesRes.data ?? []) as Array<{ id: string; province_id: string; realm_id: string; name: string; lon: number; lat: number }>;
  const citiesByProvince = new Map<string, Array<{ id: string; name: string }>>();
  for (const c of cities) {
    if (!citiesByProvince.has(c.province_id)) citiesByProvince.set(c.province_id, []);
    citiesByProvince.get(c.province_id)!.push({ id: c.id, name: c.name });
  }
  const regionalCapitalOptions = provinces
    .map((p) => {
      const city = p.capital_city_id ? cities.find((c) => c.id === p.capital_city_id) : null;
      if (!city) return null;
      return { id: city.id, name: city.name, provinceName: p.name };
    })
    .filter((x): x is { id: string; name: string; provinceName: string } => x !== null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Édition du Royaume</h1>
          <p className="mt-1 text-sm text-white/60">{realm.name} · {realm.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/mj/royaumes" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">
            ← Retour à la liste
          </Link>
          <Link href={`/royaume/${realm.slug}`} className="rounded-md border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 hover:bg-amber-900/40">
            Voir fiche publique
          </Link>
        </div>
      </header>

      <form
        action={async (fd) => {
          "use server";
          await updateRealm({
            id: realm.id,
            name: String(fd.get("name") ?? ""),
            slug: String(fd.get("slug") ?? ""),
            is_npc: String(fd.get("is_npc") ?? "") === "on",
            color_hex: String(fd.get("color_hex") ?? "") || null,
            banner_url: String(fd.get("banner_url") ?? "") || null,
            summary: String(fd.get("summary") ?? "") || null,
            leader_name: String(fd.get("leader_name") ?? "") || null,
            capital_city_id: String(fd.get("capital_city_id") ?? "") || null,
          });
        }}
        className="space-y-4"
      >
        <section className="rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-semibold text-amber-100">Catégorie: Identité</h2>
            <p className="text-xs text-stone-400">Informations générales affichées partout.</p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-stone-300">Nom</label>
              <input name="name" defaultValue={realm.name} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-stone-300">Slug</label>
              <input name="slug" defaultValue={realm.slug} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-stone-300">Leader</label>
              <input name="leader_name" defaultValue={realm.leader_name ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <div className="flex items-end gap-3">
              <label className="text-xs text-stone-300">
                Couleur
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                  <input type="color" name="color_hex" defaultValue={realm.color_hex ?? "#3b82f6"} className="h-8 w-11 rounded border border-white/20 bg-transparent" />
                  <span className="text-xs text-stone-400">{realm.color_hex ?? "#3b82f6"}</span>
                </div>
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="is_npc" defaultChecked={realm.is_npc} />
                Royaume PNJ
              </label>
            </div>
            <div>
              <label className="text-xs text-stone-300">Capitale nationale</label>
              <select
                name="capital_city_id"
                defaultValue={realm.capital_city_id ?? ""}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="">Aucune capitale nationale</option>
                {regionalCapitalOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} ({opt.provinceName})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-stone-400">La capitale nationale doit être une capitale régionale du royaume.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-semibold text-amber-100">Catégorie: Présentation</h2>
            <p className="text-xs text-stone-400">Visuels et contenu public.</p>
          </div>
          <div className="grid gap-3 p-4">
            <div>
              <label className="text-xs text-stone-300">Bannière / Drapeau (URL)</label>
              <input name="banner_url" defaultValue={realm.banner_url ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-stone-300">Résumé</label>
              <textarea name="summary" defaultValue={realm.summary ?? ""} rows={4} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            Enregistrer cette fiche
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10">
        <div className="border-b border-emerald-500/20 px-4 py-3">
          <h2 className="font-semibold text-emerald-100">Catégorie: Territoire et capitales régionales</h2>
          <p className="text-xs text-emerald-200/70">
            Définissez la ville maîtresse de chaque province. La capitale nationale doit être choisie parmi cette liste.
          </p>
        </div>
        <div className="space-y-2 p-4">
          {provinces.length === 0 && <p className="text-sm text-stone-300">Aucune province liée à ce royaume.</p>}
          {provinces.map((province) => {
            const provinceCities = citiesByProvince.get(province.id) ?? [];
            return (
              <form
                key={province.id}
                action={async (fd) => {
                  "use server";
                  await updateProvinceCapital({
                    province_id: province.id,
                    capital_city_id: String(fd.get("capital_city_id") ?? "") || null,
                  });
                }}
                className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_1fr_auto]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{province.name}</p>
                  <p className="text-xs text-stone-400">Province</p>
                </div>
                <div>
                  <label className="text-xs text-stone-300">Capitale régionale</label>
                  <select
                    name="capital_city_id"
                    defaultValue={province.capital_city_id ?? ""}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Aucune capitale régionale</option>
                    {provinceCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                  Sauver
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/20 bg-amber-950/10">
        <div className="border-b border-amber-500/20 px-4 py-3">
          <h2 className="font-semibold text-amber-100">Action rapide: capitale nationale</h2>
          <p className="text-xs text-amber-200/70">Mise à jour directe sans modifier le reste de la fiche.</p>
        </div>
        <form
          action={async (fd) => {
            "use server";
            await updateRealmNationalCapital({
              realm_id: realm.id,
              capital_city_id: String(fd.get("capital_city_id") ?? "") || null,
            });
          }}
          className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
        >
          <div>
            <label className="text-xs text-amber-100">Capitale nationale</label>
            <select
              name="capital_city_id"
              defaultValue={realm.capital_city_id ?? ""}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value="">Aucune capitale nationale</option>
              {regionalCapitalOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.provinceName})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            Mettre à jour
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-indigo-500/20 bg-indigo-950/10">
        <div className="border-b border-indigo-500/20 px-4 py-3">
          <h2 className="font-semibold text-indigo-100">Catégorie: Joueur assigné</h2>
          <p className="text-xs text-indigo-200/70">Sélectionnez un compte existant dans la liste.</p>
        </div>
        <form
          action={async (fd) => {
            "use server";
            const userId = String(fd.get("user_id") ?? "");
            const selectedUser = users.find((u) => u.id === userId);
            await assignRealmPlayer({
              realm_id: realm.id,
              user_id: userId || null,
              email: selectedUser?.email || null,
              display_name: selectedUser?.name || null,
            });
          }}
          className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
        >
          <div>
            <label className="text-xs text-indigo-100">Compte utilisateur</label>
            <select
              name="user_id"
              defaultValue={selectedUserId}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value="">Aucun joueur assigné</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}{u.name ? ` - ${u.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="self-end rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600">
            Mettre à jour l’assignation
          </button>
        </form>
      </section>
    </div>
  );
}

