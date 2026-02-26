"use client";

import { useState } from "react";
import type { Country } from "@/types/database";
import type { MilitaryBranch } from "@/types/database";
import { formatNumber, formatGdp } from "@/lib/format";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
};

export function CountryTabs({
  country,
  macros,
  limits,
  perksDef,
  unlockedPerkIds,
}: {
  country: Country;
  macros: { key: string; value: number }[];
  limits: { limit_value: number; military_unit_types: { name_fr: string; branch: MilitaryBranch } | null }[];
  perksDef: { id: string; name_fr: string; description_fr: string | null; modifier: string | null; min_militarism: number | null; min_industry: number | null; min_science: number | null; min_stability: number | null }[];
  unlockedPerkIds: Set<string>;
}) {
  const [tab, setTab] = useState<"general" | "military" | "perks">("general");

  const limitsByBranch = limits.reduce<Record<MilitaryBranch, { name_fr: string; limit_value: number }[]>>(
    (acc, row) => {
      const branch = row.military_unit_types?.branch ?? "terre";
      if (!acc[branch]) acc[branch] = [];
      acc[branch].push({
        name_fr: row.military_unit_types?.name_fr ?? "—",
        limit_value: row.limit_value,
      });
      return acc;
    },
    { terre: [], air: [], mer: [] }
  );

  const panelClass =
    "rounded-lg border p-6";
  const panelStyle = {
    background: "var(--background-panel)",
    borderColor: "var(--border)",
  };

  return (
    <div>
      <div className="tab-list mb-6" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className={`tab ${tab === "general" ? "tab-active" : ""}`}
          data-state={tab === "general" ? "active" : "inactive"}
          onClick={() => setTab("general")}
          style={
            tab === "general"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Généralités · Société · Macros
        </button>
        <button
          type="button"
          className={`tab ${tab === "military" ? "tab-active" : ""}`}
          data-state={tab === "military" ? "active" : "inactive"}
          onClick={() => setTab("military")}
          style={
            tab === "military"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Militaire
        </button>
        <button
          type="button"
          className={`tab ${tab === "perks" ? "tab-active" : ""}`}
          data-state={tab === "perks" ? "active" : "inactive"}
          onClick={() => setTab("perks")}
          style={
            tab === "perks"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Avantages
        </button>
      </div>

      {tab === "general" && (
        <div className="space-y-6">
          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Généralités
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Nom</dt>
                <dd className="font-medium">{country.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Régime</dt>
                <dd className="font-medium">{country.regime ?? "—"}</dd>
              </div>
              {country.flag_url && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-[var(--foreground-muted)]">Drapeau</dt>
                  <dd>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={country.flag_url}
                      alt=""
                      width={120}
                      height={80}
                      className="h-20 w-[120px] rounded border border-[var(--border)] object-cover"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Société
            </h2>
            <dl className="grid gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Militarisme</dt>
                <dd className="stat-value text-xl font-semibold">{country.militarism}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Industrie</dt>
                <dd className="stat-value text-xl font-semibold">{country.industry}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Science</dt>
                <dd className="stat-value text-xl font-semibold">{country.science}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Stabilité</dt>
                <dd className="stat-value text-xl font-semibold">{country.stability} (-3 à 3)</dd>
              </div>
            </dl>
          </section>

          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Macros
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Population</dt>
                <dd className="stat-value font-semibold">
                  {formatNumber(country.population)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">PIB</dt>
                <dd className="stat-value font-semibold">
                  {formatGdp(country.gdp)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Croissance</dt>
                <dd className="stat-value font-semibold">{formatNumber(country.growth)} %</dd>
              </div>
              {macros.map((m) => (
                <div key={m.key}>
                  <dt className="text-sm text-[var(--foreground-muted)]">{m.key}</dt>
                  <dd className="stat-value font-semibold">{formatNumber(m.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}

      {tab === "military" && (
        <div className="space-y-6">
          {(["terre", "air", "mer"] as const).map((branch) => (
            <section key={branch} className={panelClass} style={panelStyle}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
                {BRANCH_LABELS[branch]}
              </h2>
              {limitsByBranch[branch].length === 0 ? (
                <p className="text-[var(--foreground-muted)]">Aucune limite définie.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 pr-4 font-medium text-[var(--foreground-muted)]">
                        Type
                      </th>
                      <th className="pb-2 font-medium text-[var(--foreground-muted)]">
                        Limite
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {limitsByBranch[branch].map((row, i) => (
                      <tr key={i} className="border-b border-[var(--border-muted)]">
                        <td className="py-2 pr-4">{row.name_fr}</td>
                        <td className="stat-value py-2">{formatNumber(row.limit_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === "perks" && (
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
      )}
    </div>
  );
}
