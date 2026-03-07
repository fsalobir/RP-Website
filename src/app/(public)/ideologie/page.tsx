import { createServiceRoleClient } from "@/lib/supabase/server";
import { IdeologyTriangle } from "@/components/ideology/IdeologyTriangle";
import { fetchWorldIdeologyState } from "@/lib/ideologyServer";

export const dynamic = "force-dynamic";

export default async function IdeologiePage() {
  const supabase = createServiceRoleClient();
  const { countries, ideologyByCountry, playerCountryIds, influenceByCountry } = await fetchWorldIdeologyState(supabase);

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
        baseDrivers: ideology.breakdown.baseDrivers,
        neighborContributors: ideology.breakdown.neighborContributors,
        topFactors: ideology.breakdown.topFactors,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Idéologie</h1>
        <p className="mt-1 text-[var(--foreground-muted)]">
          Panorama immersif du monde selon les trois grands pôles idéologiques : Monarchisme, Républicanisme et Cultisme.
        </p>
      </div>

      <IdeologyTriangle entries={entries} />
    </div>
  );
}
