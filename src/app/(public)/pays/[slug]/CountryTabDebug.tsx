"use client";

import { formatNumber, formatGdp } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import type { TickBreakdown, TickBreakdownContribution, TickBreakdownRateCategory, TickBreakdownStatCategory } from "@/lib/tickBreakdown";
import type { ExpectedNextTickResult } from "@/lib/expectedNextTick";
import type { Country } from "@/types/database";

type CountryTabDebugProps = {
  breakdown: TickBreakdown;
  expected: ExpectedNextTickResult;
  country: Country;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

function formatRate(value: number): string {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)} %`;
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function ContributionLine({ c, asPoints = false }: { c: TickBreakdownContribution; asPoints?: boolean }) {
  const isRate = !asPoints && Math.abs(c.value) < 2 && Math.abs(c.value) !== 0;
  const str = isRate ? formatRate(c.value) : formatDelta(c.value);
  const content = (
    <span className="text-[var(--foreground)]">
      {str} <span className="text-[var(--foreground-muted)]">({c.label})</span>
    </span>
  );
  if (c.tooltip) {
    return (
      <li className="flex items-baseline gap-1">
        <Tooltip content={<span className="font-mono text-xs">{c.tooltip}</span>} side="top">
          <span className="cursor-help underline decoration-dotted">{content}</span>
        </Tooltip>
      </li>
    );
  }
  return <li className="flex items-baseline gap-1">{content}</li>;
}

/** Pour les stats : chaque contribution est une variation en points (pas un %). Affiche un tooltip gravité si présent. */
function StatContributionLine({ c }: { c: TickBreakdownContribution }) {
  const content = (
    <>
      <span className="text-[var(--foreground)]">{formatDelta(c.value)}</span>
      <span className="text-[var(--foreground-muted)]"> point(s) — {c.label}</span>
    </>
  );
  if (c.tooltip) {
    return (
      <li className="flex items-baseline gap-1 text-sm">
        <Tooltip content={<span className="block min-w-[20rem] max-w-md text-xs whitespace-pre-line leading-relaxed">{c.tooltip}</span>} side="top">
          <span className="cursor-help underline decoration-dotted">{content}</span>
        </Tooltip>
      </li>
    );
  }
  return <li className="flex items-baseline gap-1 text-sm">{content}</li>;
}

function RateSection({
  title,
  cat,
  currentValue,
  formatValue,
}: {
  title: string;
  cat: TickBreakdownRateCategory;
  currentValue: number;
  formatValue: (v: number) => string;
}) {
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
      <h3 className="mb-2 text-sm font-semibold uppercase text-[var(--foreground-muted)]">{title}</h3>
      <div className="mb-2 text-base font-bold text-[var(--foreground)]">{formatValue(currentValue)}</div>
      <ul className="mb-2 list-none space-y-0.5 text-sm">
        {cat.contributions.length === 0 ? (
          <li className="text-[var(--foreground-muted)]">Aucune contribution</li>
        ) : (
          cat.contributions.map((c, i) => (
            <ContributionLine key={`${c.label}-${i}`} c={c} />
          ))
        )}
      </ul>
      <div className="border-t pt-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="text-[var(--foreground-muted)]">Taux total = </span>
        <span className="font-medium text-[var(--accent)]">{formatRate(cat.totalRate)}</span>
      </div>
      <div className="mt-1 text-sm">
        <span className="text-[var(--foreground-muted)]">
          {formatValue(currentValue)} × (1 + {formatRate(cat.totalRate).replace(/^\+/, "")}) = {formatValue(cat.expectedValue)}
        </span>
        <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">(valeur attendue)</span>
      </div>
    </section>
  );
}

function StatSection({
  title,
  cat,
  currentValue,
}: {
  title: string;
  cat: TickBreakdownStatCategory;
  currentValue: number;
}) {
  const delta = cat.totalDelta;
  const deltaPositive = delta >= 0;
  const deltaColor = deltaPositive ? "var(--accent)" : "var(--danger)";
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
      <h3 className="mb-2 text-sm font-semibold uppercase text-[var(--foreground-muted)]">{title}</h3>
      <div className="mb-2 text-base font-bold text-[var(--foreground)]">{currentValue.toFixed(2)}</div>
      <ul className="mb-2 list-none space-y-0.5">
        {cat.contributions.length === 0 ? (
          <li className="text-sm text-[var(--foreground-muted)]">Aucune contribution</li>
        ) : (
          cat.contributions.map((c, i) => (
            <StatContributionLine key={`${c.label}-${i}`} c={c} />
          ))
        )}
      </ul>
      <div className="border-t pt-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="text-[var(--foreground-muted)]">Somme des variations (Δ) = </span>
        <span className="font-medium" style={{ color: deltaColor }}>
          {formatDelta(delta)} point(s)
        </span>
      </div>
      <div className="mt-1 text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="text-[var(--foreground-muted)]">{currentValue.toFixed(2)}</span>
        <span className="mx-1 text-[var(--foreground-muted)]">+</span>
        <span style={{ color: deltaColor }}>{formatDelta(delta)}</span>
        <span className="mx-1 text-[var(--foreground-muted)]">=</span>
        <span className="font-medium text-[var(--foreground)]">{cat.expectedValue.toFixed(2)}</span>
        <span className="ml-1.5 text-xs text-[var(--foreground-muted)]">(valeur attendue au passage de jour)</span>
      </div>
    </section>
  );
}

export function CountryTabDebug({
  breakdown,
  expected,
  country,
  panelClass,
  panelStyle,
}: CountryTabDebugProps) {
  const c = country;
  return (
    <div className="space-y-6">
      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-2 text-lg font-semibold text-[var(--foreground-muted)]">
          Debug — Vue d’ensemble des effets au prochain passage de jour
        </h2>
        <p className="mb-4 text-sm text-[var(--foreground-muted)]">
          Tous les facteurs (croissance globale, effets actifs, mobilisation, budget) qui s’appliquent à ce pays. Les totaux et valeurs attendues correspondent au calcul du cron.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RateSection
            title="Population"
            cat={breakdown.population}
            currentValue={Number(c.population ?? 0)}
            formatValue={formatNumber}
          />
          <RateSection
            title="PIB"
            cat={breakdown.gdp}
            currentValue={Number(c.gdp ?? 0)}
            formatValue={formatGdp}
          />
          <StatSection
            title="Militarisme"
            cat={breakdown.militarism}
            currentValue={Number(c.militarism ?? 0)}
          />
          <StatSection
            title="Industrie"
            cat={breakdown.industry}
            currentValue={Number(c.industry ?? 0)}
          />
          <StatSection
            title="Science"
            cat={breakdown.science}
            currentValue={Number(c.science ?? 0)}
          />
          <StatSection
            title="Stabilité"
            cat={breakdown.stability}
            currentValue={Number(c.stability ?? 0)}
          />
        </div>

        {(breakdown.globalEffectsExhaustive.length > 0 ||
          breakdown.activeEffectsExhaustive.length > 0 ||
          breakdown.mobilisationEffectsExhaustive.length > 0 ||
          breakdown.constraints.forcedMinPcts.length > 0 ||
          breakdown.constraints.allocationCapPercent !== 100 ||
          breakdown.constraints.limitModifierByBranch.length > 0) && (
          <section className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
            <h3 className="mb-2 text-sm font-semibold uppercase text-[var(--foreground-muted)]">Autres effets</h3>
            <div className="space-y-3 text-sm">
              {breakdown.globalEffectsExhaustive.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-[var(--foreground-muted)]">
                  {breakdown.globalEffectsExhaustive.map((line, i) => (
                    <li key={i}>{line.description}</li>
                  ))}
                </ul>
              )}
              {breakdown.activeEffectsExhaustive.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-[var(--foreground-muted)]">
                  {breakdown.activeEffectsExhaustive.map((line, i) => (
                    <li key={i}>{line.description}</li>
                  ))}
                </ul>
              )}
              {breakdown.mobilisationEffectsExhaustive.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-[var(--foreground-muted)]">
                  {breakdown.mobilisationEffectsExhaustive.map((line, i) => (
                    <li key={i}>{line.description}</li>
                  ))}
                </ul>
              )}
              {breakdown.constraints.forcedMinPcts.length > 0 && (
                <div>
                  <span className="font-medium text-[var(--foreground)]">Minimums forcés (budget) : </span>
                  {breakdown.constraints.forcedMinPcts.map(({ label, value }) => (
                    <span key={label} className="mr-2 text-[var(--foreground-muted)]">
                      {label} {value} %
                    </span>
                  ))}
                </div>
              )}
              {breakdown.constraints.allocationCapPercent !== 100 && (
                <div>
                  <span className="font-medium text-[var(--foreground)]">Plafond d’allocation : </span>
                  <span className="text-[var(--foreground-muted)]">{breakdown.constraints.allocationCapPercent} %</span>
                </div>
              )}
              {breakdown.constraints.limitModifierByBranch.length > 0 && (
                <div>
                  <span className="font-medium text-[var(--foreground)]">Modificateur de limites (militaire) : </span>
                  {breakdown.constraints.limitModifierByBranch.map(({ label, percent }) => (
                    <span key={label} className="mr-2 text-[var(--foreground-muted)]">
                      {label} {percent >= 0 ? "+" : ""}{percent} %
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
