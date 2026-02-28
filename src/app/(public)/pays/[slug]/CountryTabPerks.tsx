"use client";

type PerkDef = {
  id: string;
  name_fr: string;
  description_fr: string | null;
  modifier: string | null;
  min_militarism: number | null;
  min_industry: number | null;
  min_science: number | null;
  min_stability: number | null;
};

type CountryTabPerksProps = {
  perksDef: PerkDef[];
  unlockedPerkIds: Set<string>;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

export function CountryTabPerks({
  perksDef,
  unlockedPerkIds,
  panelClass,
  panelStyle,
}: CountryTabPerksProps) {
  return (
    <div className="space-y-4">
      {perksDef.length === 0 ? (
        <div className={panelClass} style={panelStyle}>
          <p className="text-[var(--foreground-muted)]">Aucun avantage défini.</p>
        </div>
      ) : (
        perksDef.map((p) => {
          const unlocked = unlockedPerkIds.has(p.id);
          return (
            <div
              key={p.id}
              className={panelClass}
              style={{
                ...panelStyle,
                opacity: unlocked ? 1 : 0.65,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {p.name_fr}
                    {unlocked && (
                      <span className="ml-2 text-xs text-[var(--accent)]">(débloqué)</span>
                    )}
                  </h3>
                  {p.description_fr && (
                    <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                      {p.description_fr}
                    </p>
                  )}
                  {p.modifier && (
                    <p className="mt-1 text-sm text-[var(--accent)]">{p.modifier}</p>
                  )}
                </div>
                {!unlocked && (
                  <div className="shrink-0 text-right text-xs text-[var(--foreground-muted)]">
                    Conditions : Militarisme {p.min_militarism ?? "—"} / Industrie{" "}
                    {p.min_industry ?? "—"} / Science {p.min_science ?? "—"} / Stabilité{" "}
                    {p.min_stability ?? "—"}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
