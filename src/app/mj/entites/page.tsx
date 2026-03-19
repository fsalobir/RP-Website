import { createServiceRoleClient } from "@/lib/supabase/server";
import { MjPanel } from "../_components/MjPanel";
import { updateCharacterAttrs, updateItemAttrs } from "../_actions/entities";

export const revalidate = 0;

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export default async function MjEntitesPage() {
  const admin = createServiceRoleClient();

  const [charactersRes, itemsRes, realmsRes, provincesRes] = await Promise.all([
    admin.from("characters").select("id, realm_id, province_id, name, status, attrs").order("name"),
    admin.from("items").select("id, realm_id, equipped_by_character_id, name, attrs").order("name"),
    admin.from("realms").select("id, name, slug").order("name"),
    admin.from("provinces").select("id, name, realm_id").order("name"),
  ]);

  const characters = (charactersRes.data ?? []) as Array<{
    id: string;
    realm_id: string;
    province_id: string | null;
    name: string;
    status: string;
    attrs: unknown;
  }>;

  const items = (itemsRes.data ?? []) as Array<{
    id: string;
    realm_id: string;
    equipped_by_character_id: string | null;
    name: string;
    attrs: unknown;
  }>;

  const realms = (realmsRes.data ?? []) as Array<{ id: string; name: string; slug: string }>;
  const provinces = (provincesRes.data ?? []) as Array<{ id: string; name: string; realm_id: string }>;

  const realmNameById = new Map(realms.map((r) => [r.id, `${r.name} (${r.slug})`]));
  const provinceNameById = new Map(provinces.map((p) => [p.id, p.name]));
  const characterNameById = new Map(characters.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Entités (Personnages & Trésor)</h1>
        <p className="mt-1 text-sm text-white/60">
          Liste et édition manuelle des attributs (<code className="text-white/80">attrs</code> JSONB).
        </p>
      </div>

      <MjPanel
        title="Personnages"
        subtitle="Table `characters` — modifier les attrs en JSON (objet)."
      >
        <div className="space-y-4">
          {characters.length === 0 ? (
            <p className="text-sm text-white/60">Aucun personnage en base.</p>
          ) : (
            characters.map((c) => (
              <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {c.name} <span className="text-xs font-normal text-white/50">({c.status})</span>
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Royaume: {realmNameById.get(c.realm_id) ?? c.realm_id}
                      {c.province_id ? ` • Province: ${provinceNameById.get(c.province_id) ?? c.province_id}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-white/50 font-mono">character_id: {c.id}</p>
                  </div>
                </div>

                <form
                  action={async (formData) => {
                    "use server";
                    const attrsJson = String(formData.get("attrs") ?? "");
                    const res = await updateCharacterAttrs(c.id, attrsJson);
                    if (res.error) throw new Error(res.error);
                  }}
                  className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                >
                  <textarea
                    name="attrs"
                    defaultValue={prettyJson(c.attrs)}
                    className="min-h-32 w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/90"
                  />
                  <button
                    type="submit"
                    className="h-fit rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300"
                  >
                    Enregistrer
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </MjPanel>

      <MjPanel
        title="Objets (Trésor)"
        subtitle="Table `items` — modifier les attrs en JSON (objet)."
      >
        <div className="space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-white/60">Aucun objet en base.</p>
          ) : (
            items.map((i) => (
              <div key={i.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{i.name}</p>
                    <p className="mt-1 text-xs text-white/60">
                      Royaume: {realmNameById.get(i.realm_id) ?? i.realm_id}
                      {i.equipped_by_character_id
                        ? ` • Équipé par: ${characterNameById.get(i.equipped_by_character_id) ?? i.equipped_by_character_id}`
                        : " • Non équipé"}
                    </p>
                    <p className="mt-1 text-xs text-white/50 font-mono">item_id: {i.id}</p>
                  </div>
                </div>

                <form
                  action={async (formData) => {
                    "use server";
                    const attrsJson = String(formData.get("attrs") ?? "");
                    const res = await updateItemAttrs(i.id, attrsJson);
                    if (res.error) throw new Error(res.error);
                  }}
                  className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                >
                  <textarea
                    name="attrs"
                    defaultValue={prettyJson(i.attrs)}
                    className="min-h-32 w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/90"
                  />
                  <button
                    type="submit"
                    className="h-fit rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300"
                  >
                    Enregistrer
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </MjPanel>
    </div>
  );
}

