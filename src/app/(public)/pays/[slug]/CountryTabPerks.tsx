"use client";

import { useState } from "react";
import { getEffectDescription } from "@/lib/countryEffects";
import type { ResolvedEffect } from "@/lib/countryEffects";
import { formatRequirementLabel } from "@/lib/perkRequirements";
import type { Country } from "@/types/database";

type FilterChoice = "all" | "active" | "inactive";

type PerkEffectRow = {
  effect_kind: string;
  effect_target: string | null;
  effect_subtype?: string | null;
  value: number;
};

type PerkRequirementRow = {
  requirement_kind: string;
  requirement_target: string | null;
  value: number;
};

type PerkDef = {
  id: string;
  name_fr: string;
  description_fr: string | null;
  modifier: string | null;
  category_id?: string | null;
  icon_url?: string | null;
  /** Taille d'affichage de l'icône en pixels (carré). Défaut 48. */
  icon_size?: number | null;
  perk_categories?: { id: string; name_fr: string; sort_order: number } | null;
  perk_effects?: PerkEffectRow[];
  perk_requirements?: PerkRequirementRow[];
};

type PerkCategory = {
  id: string;
  name_fr: string;
  sort_order: number;
};

type CountryTabPerksProps = {
  perksDef: PerkDef[];
  perkCategories: PerkCategory[];
  activePerkIds: Set<string>;
  rosterUnitsFlat: { id: string; name_fr: string }[];
  country: Country;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

function toResolvedEffect(e: PerkEffectRow): ResolvedEffect {
  return {
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
  };
}

export function CountryTabPerks({
  perksDef,
  perkCategories,
  activePerkIds,
  rosterUnitsFlat,
  country,
  panelClass,
  panelStyle,
}: CountryTabPerksProps) {
  const [filter, setFilter] = useState<FilterChoice>("all");

  const categoryById = new Map(perkCategories.map((c) => [c.id, c]));
  const sortedCategories = [...perkCategories].sort((a, b) => a.sort_order - b.sort_order);

  function matchesFilter(p: PerkDef): boolean {
    const active = activePerkIds.has(p.id);
    if (filter === "active") return active;
    if (filter === "inactive") return !active;
    return true;
  }

  const perksWithoutCategory = perksDef.filter((p) => !p.category_id && matchesFilter(p));
  const perksByCategoryId = new Map<string, PerkDef[]>();
  for (const p of perksDef) {
    if (!matchesFilter(p)) continue;
    if (p.category_id) {
      const list = perksByCategoryId.get(p.category_id) ?? [];
      list.push(p);
      perksByCategoryId.set(p.category_id, list);
    }
  }

  if (perksDef.length === 0) {
    return (
      <div className={panelClass} style={panelStyle}>
        <p className="text-[var(--foreground-muted)]">Aucun avantage défini.</p>
      </div>
    );
  }

  function isRequirementMet(req: PerkRequirementRow): boolean {
    const kind = req.requirement_kind;
    const target = req.requirement_target ?? undefined;
    const threshold = Number(req.value);

    if (kind === "stat" && target) {
      const statVal =
        target === "militarism"
          ? Number(country.militarism ?? 0)
          : target === "industry"
          ? Number(country.industry ?? 0)
          : target === "science"
          ? Number(country.science ?? 0)
          : target === "stability"
          ? Number(country.stability ?? 0)
          : 0;
      return statVal >= threshold;
    }
    if (kind === "gdp") {
      return Number(country.gdp ?? 0) >= threshold;
    }
    if (kind === "population") {
      return Number(country.population ?? 0) >= threshold;
    }
    // Pour influence et niveau de loi, on ne dispose pas ici du contexte complet,
    // on se base donc sur l'activation globale de l'avantage (activePerkIds).
    return false;
  }

  const renderPerk = (p: PerkDef) => {
    const active = activePerkIds.has(p.id);
    const effects = p.perk_effects ?? [];
    const requis = (p.perk_requirements ?? []).map((r) => ({
      row: r,
      label: formatRequirementLabel(r),
    }));

    return (
      <div
        key={p.id}
        className={panelClass}
        style={{
          ...panelStyle,
          opacity: active ? 1 : 0.85,
          borderWidth: active ? 2 : undefined,
          borderColor: active ? "var(--accent)" : undefined,
          borderStyle: "solid",
        }}
      >
        <div className="overflow-hidden">
          {/* Icône en haut à gauche, texte à droite et en dessous (sans espace vide) */}
          {p.icon_url && (
            <img
              src={p.icon_url}
              alt=""
              width={p.icon_size ?? 48}
              height={p.icon_size ?? 48}
              className="float-left mr-3 shrink-0 rounded object-cover"
              style={{
                border: "1px solid var(--border-muted)",
                width: p.icon_size ?? 48,
                height: p.icon_size ?? 48,
              }}
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[var(--foreground)]">{p.name_fr}</h3>
              {active && (
                <span className="shrink-0 text-sm font-medium text-[var(--accent)]">Avantage actif</span>
              )}
            </div>
            {p.description_fr && (
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">{p.description_fr}</p>
            )}
            {p.modifier && (
              <p className="mt-0.5 text-sm text-[var(--accent)]">{p.modifier}</p>
            )}
          </div>
          {requis.length > 0 && (
            <div className="mt-2 border-t border-[var(--border-muted)] pt-2">
              <ul className="list-disc list-inside space-y-0.5 text-sm font-semibold">
                {requis.map(({ row, label }, i) => {
                  const met = isRequirementMet(row);
                  return (
                  <li
                    key={i}
                    className={met ? "text-[var(--accent)]" : "text-[var(--danger)]"}
                  >
                    {label}
                  </li>
                  );
                })}
              </ul>
            </div>
          )}
          {effects.length > 0 && (
            <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--border-muted)" }}>
              <p className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">Effets si actif</p>
              <ul
                className={`list-inside list-disc space-y-0.5 text-sm ${active ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}
              >
                {effects.map((e, i) => (
                  <li key={i}>
                    {getEffectDescription(toResolvedEffect(e), {
                      rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                      countryName: () => null,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--foreground-muted)]">Afficher :</span>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${filter === "all" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-muted)] hover:text-[var(--foreground)]"}`}
        >
          Tous
        </button>
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${filter === "active" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-muted)] hover:text-[var(--foreground)]"}`}
        >
          Activés
        </button>
        <button
          type="button"
          onClick={() => setFilter("inactive")}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${filter === "inactive" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-muted)] hover:text-[var(--foreground)]"}`}
        >
          Désactivés
        </button>
      </div>

      {sortedCategories.map((cat) => {
        const perks = perksByCategoryId.get(cat.id) ?? [];
        if (perks.length === 0) return null;
        const sortedPerks = [...perks].sort((a, b) => a.name_fr.localeCompare(b.name_fr));
        return (
          <div key={cat.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
              {cat.name_fr}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sortedPerks.map((p) => renderPerk(p))}
            </div>
          </div>
        );
      })}
      {perksWithoutCategory.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
            Autres
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {perksWithoutCategory.map((p) => renderPerk(p))}
          </div>
        </div>
      )}
    </div>
  );
}
