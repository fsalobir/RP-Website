import { createAnonClientForCache } from "@/lib/supabase/server";
import { IdeologyHexagon } from "@/components/ideology/IdeologyHexagon";
import { fetchWorldIdeologyState } from "@/lib/ideologyServer";
import { PublicPageHeader } from "@/components/ui/PublicPageHeader";

export const metadata = { title: "Idéologie" };
// Page publique : rendue sans cookies (compatible ISR / cache / export).
export const revalidate = 60;

type IdeologyEffectEntry = { ideology_id: string; effect_kind: string; effect_target: string | null; value: number };

function parseIdeologyEffectsConfig(raw: unknown): IdeologyEffectEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is IdeologyEffectEntry =>
      e != null &&
      typeof e === "object" &&
      typeof (e as IdeologyEffectEntry).ideology_id === "string" &&
      typeof (e as IdeologyEffectEntry).effect_kind === "string" &&
      typeof (e as IdeologyEffectEntry).value === "number"
  );
}

export default async function IdeologiePage() {
  const supabase = createAnonClientForCache();
  const { countries, ideologyByCountry, playerCountryIds, influenceByCountry } = await fetchWorldIdeologyState(supabase);

  const { data: ruleRows } = await supabase.from("rule_parameters").select("key, value").eq("key", "ideology_effects");
  const ideologyEffectsConfig = ruleRows?.[0]?.value != null ? parseIdeologyEffectsConfig(ruleRows[0].value) : [];

  const entries = countries
    .map((country) => {
      const ideology = ideologyByCountry.get(country.id);
      if (!ideology) return null;
      return {
        id: country.id,
        name: country.name,
        slug: country.slug,
        flag_url: country.flag_url,
        regime: country.regime,
        ai_status: country.ai_status ?? null,
        isPlayer: playerCountryIds.has(country.id),
        influence: influenceByCountry.get(country.id) ?? 0,
        dominant: ideology.dominant,
        centerDistance: ideology.centerDistance,
        point: ideology.point,
        scores: ideology.scores,
        drift: ideology.drift,
        neighbors: ideology.breakdown.neighbors,
        effects: ideology.breakdown.effects,
        neighborContributors: ideology.breakdown.neighborContributors,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return (
    <div className="relative min-h-screen">
      {/* Fond fixe */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-cover bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/ideologie-bg.png)",
            backgroundPosition: "top center",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,211,122,0.13),transparent_38%),linear-gradient(180deg,rgba(3,8,11,0.38)_0%,rgba(3,8,11,0.76)_48%,rgba(3,8,11,0.95)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10" style={{ isolation: "isolate" }}>
        <PublicPageHeader title="Échiquier idéologique" icon="ideology" />
        <IdeologyHexagon entries={entries} ideologyEffectsConfig={ideologyEffectsConfig} />
      </div>
    </div>
  );
}
