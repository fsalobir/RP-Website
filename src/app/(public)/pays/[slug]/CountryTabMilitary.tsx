"use client";

import type { MilitaryBranch } from "@/types/database";
import { formatNumber } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import { getUnitExtraEffectSum, MOBILISATION_LEVELS, type ResolvedEffect } from "@/lib/countryEffects";
import type { RosterRowByBranch } from "./countryTabsTypes";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

function getMobilisationLevelKey(score: number, thresholds: Record<string, number> | undefined): string {
  if (!thresholds) return "demobilisation";
  let best = "demobilisation";
  let bestVal = -1;
  for (const { key } of MOBILISATION_LEVELS) {
    const t = thresholds[key] ?? 0;
    if (t <= score && t >= bestVal) {
      best = key;
      bestVal = t;
    }
  }
  return best;
}

type CountryTabMilitaryProps = {
  countryId: string;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
  mobilisationConfig?: { level_thresholds?: Record<string, number>; daily_step?: number };
  mobilisationState?: { score: number; target_score: number } | null;
  mobilisationSetting: string | null;
  mobilisationError: string | null;
  onMobilisationClick: (threshold: number) => Promise<void>;
  setMobilisationSetting: (v: string | null) => void;
  militaryError: string | null;
  militarySubtypeOpen: Record<string, boolean>;
  setMilitarySubtypeOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>;
  effectiveLimitByBranch: Record<MilitaryBranch, number>;
  militaryEdit: Record<string, { current_level: number; extra_count: number }>;
  setMilitaryEdit: React.Dispatch<React.SetStateAction<Record<string, { current_level: number; extra_count: number }>>>;
  militarySavingId: string | null;
  isAdmin: boolean;
  effects: ResolvedEffect[];
  onSaveMilitaryUnit: (rosterUnitId: string, currentLevel: number, extraCount: number) => Promise<void>;
};

export function CountryTabMilitary({
  countryId,
  panelClass,
  panelStyle,
  canEditCountry,
  mobilisationConfig,
  mobilisationState,
  mobilisationSetting,
  mobilisationError,
  onMobilisationClick,
  setMobilisationSetting,
  militaryError,
  militarySubtypeOpen,
  setMilitarySubtypeOpen,
  rosterByBranch,
  effectiveLimitByBranch,
  militaryEdit,
  setMilitaryEdit,
  militarySavingId,
  isAdmin,
  effects,
  onSaveMilitaryUnit,
}: CountryTabMilitaryProps) {
  return (
    <div className="space-y-6">
      {mobilisationConfig && (
        <section className={panelClass} style={panelStyle}>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            Mobilisation
          </h2>
          <div className="flex flex-wrap gap-3">
            {MOBILISATION_LEVELS.map((level) => {
              const thresholds = mobilisationConfig?.level_thresholds;
              const threshold = thresholds?.[level.key] ?? 0;
              const score = mobilisationState?.score ?? 0;
              const targetScore = mobilisationState?.target_score ?? 0;
              const currentLevelKey = getMobilisationLevelKey(score, thresholds);
              const targetLevelKey = getMobilisationLevelKey(targetScore, thresholds);
              const isCurrent = currentLevelKey === level.key;
              const isTarget = targetLevelKey === level.key;
              const isClickable = canEditCountry && mobilisationSetting === null;
              const isSetting = mobilisationSetting === level.key;
              return (
                <button
                  key={level.key}
                  type="button"
                  disabled={!canEditCountry || !!mobilisationSetting}
                  onClick={async () => {
                    if (!canEditCountry) return;
                    setMobilisationSetting(level.key);
                    await onMobilisationClick(threshold);
                    setMobilisationSetting(null);
                  }}
                  className="flex h-16 w-36 shrink-0 items-center justify-center rounded border px-2 py-1 text-center text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    borderColor: isCurrent
                      ? "var(--accent)"
                      : isTarget
                        ? "var(--accent-muted)"
                        : "var(--border)",
                    background: isCurrent
                      ? "var(--accent-muted)"
                      : isTarget
                        ? "var(--background-elevated)"
                        : "var(--background-panel)",
                    color: "var(--foreground)",
                  }}
                >
                  {isSetting ? "…" : level.label}
                </button>
              );
            })}
          </div>
          {mobilisationError && (
            <p className="mt-2 text-sm text-[var(--danger)]">{mobilisationError}</p>
          )}
        </section>
      )}
      {militaryError && (
        <p className="text-sm text-[var(--danger)]">{militaryError}</p>
      )}
      {(["terre", "air", "mer", "strategique"] as const).map((branch) => {
        const rows = rosterByBranch[branch];
        const groups = (() => {
          const m = new Map<string | null, RosterRowByBranch[]>();
          for (const row of rows) {
            const k = row.unit.sub_type ?? null;
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(row);
          }
          return Array.from(m.entries())
            .sort((a, b) => {
              if (a[0] == null) return 1;
              if (b[0] == null) return -1;
              return (a[0] as string).localeCompare(b[0] as string);
            })
            .map(([subType, subRows]) => ({
              subType,
              label: subType ?? "Sans catégorie",
              rows: subRows,
            }));
        })();

        return (
          <section key={branch} className={panelClass} style={panelStyle}>
            <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">
              {BRANCH_LABELS[branch]}
              {effectiveLimitByBranch[branch] > 0 && (
                <span className="ml-2 text-sm font-normal text-[var(--foreground-muted)]">
                  (limite effective : {formatNumber(effectiveLimitByBranch[branch])})
                </span>
              )}
            </h2>
            {rows.length === 0 ? (
              <p className="text-[var(--foreground-muted)]">Aucune unité dans le roster.</p>
            ) : (
              <div className="space-y-1">
                {groups.map(({ subType, label, rows: subRows }) => {
                  const subKey = `${branch}_${subType ?? "__none__"}`;
                  const isOpen = militarySubtypeOpen[subKey] !== false;
                  return (
                    <div key={subKey} className="rounded border" style={{ borderColor: "var(--border-muted)" }}>
                      <button
                        type="button"
                        onClick={() => setMilitarySubtypeOpen((prev) => ({ ...prev, [subKey]: !prev[subKey] }))}
                        className="flex w-full items-center gap-2 py-1.5 px-3 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
                        style={{ background: "var(--background-panel)" }}
                      >
                        <span
                          className="inline-block transition-transform duration-200 ease-out"
                          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                        >
                          ▶
                        </span>
                        <span>{label}</span>
                        <span className="text-[var(--foreground-muted)]">({subRows.length})</span>
                      </button>
                      <div
                        className="grid transition-[grid-template-rows] duration-200 ease-out"
                        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                      >
                        <div className="overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm table-fixed">
                              <thead>
                                <tr className="border-b border-[var(--border)]">
                                  <th className="w-12 pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Icône</th>
                                  <th className="w-[20%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Nom</th>
                                  <th className="w-[14%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Nombre</th>
                                  <th className="w-[12%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Personnel</th>
                                  <th className="pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Niveaux</th>
                                  {isAdmin && <th className="w-20 pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs" />}
                                </tr>
                              </thead>
                              <tbody>
                                {subRows.map((row) => {
                                  const edit = militaryEdit[row.unit.id] ?? {
                                    current_level: Math.max(0, row.countryState?.current_level ?? 0),
                                    extra_count: Math.max(0, row.countryState?.extra_count ?? 0),
                                  };
                                  const storedExtra = isAdmin ? edit.extra_count : (row.countryState?.extra_count ?? 0);
                                  const effectExtraSum = getUnitExtraEffectSum(effects, row.unit.id);
                                  const effectiveExtra = storedExtra + effectExtraSum;
                                  const totalCount = row.unit.base_count + effectiveExtra;
                                  const points = isAdmin
                                    ? Math.max(0, edit.current_level)
                                    : Math.max(0, row.countryState?.current_level ?? 0);
                                  const unlockedLevel = Math.max(
                                    0,
                                    Math.min(row.unit.level_count, Math.floor(points / 100))
                                  );
                                  const manpowerLevel =
                                    unlockedLevel > 0
                                      ? row.levels.find((l) => l.level === unlockedLevel)?.manpower ?? 0
                                      : 0;
                                  const personnel = totalCount * manpowerLevel;
                                  const isLocked = points < 100;
                                  const isSaving = militarySavingId === row.unit.id;

                                  return (
                                    <tr key={row.unit.id} className="border-b border-[var(--border-muted)]">
                                      <td className="w-12 py-0.5 px-2 align-middle text-center">
                                        <div className="inline-block h-9 w-9 overflow-hidden rounded border bg-[var(--background-elevated)]" style={{ borderColor: "var(--border)" }}>
                                          {row.unit.icon_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={row.unit.icon_url} alt="" className="h-full w-full object-contain" />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[8px] text-[var(--foreground-muted)]">—</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="w-[20%] py-0.5 px-2 align-middle text-center">
                                        <span className="inline-block max-w-full truncate text-xs font-medium text-[var(--foreground)]" title={row.unit.name_fr}>
                                          {row.unit.name_fr}
                                        </span>
                                      </td>
                                      <td className="w-[14%] py-0.5 px-2 align-middle text-center">
                                        {isAdmin ? (
                                          <div className="flex flex-wrap items-center justify-center gap-0.5">
                                            <span className="text-[10px] text-[var(--foreground-muted)]">{row.unit.base_count}+</span>
                                            <input
                                              type="number"
                                              min={0}
                                              className="w-9 rounded border bg-[var(--background)] px-0.5 py-0.5 text-[10px] font-mono text-[var(--foreground)]"
                                              style={{ borderColor: "var(--border)" }}
                                              value={edit.extra_count}
                                              onChange={(e) => {
                                                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                setMilitaryEdit((prev) => ({ ...prev, [row.unit.id]: { ...prev[row.unit.id] ?? edit, extra_count: n } }));
                                              }}
                                              disabled={isSaving}
                                            />
                                            <span className="text-[10px] text-[var(--foreground-muted)]">= {totalCount}</span>
                                          </div>
                                        ) : (
                                          <span
                                            className="inline-block rounded border px-1.5 py-0.5 font-mono text-xs font-medium text-[var(--foreground)]"
                                            style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
                                          >
                                            {formatNumber(totalCount)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="w-[12%] py-0.5 px-2 font-mono text-xs text-[var(--foreground)] align-middle text-center">
                                        {formatNumber(personnel)}
                                      </td>
                                      <td className="py-0.5 px-2 align-middle">
                                        <div className="flex justify-center">
                                          {isAdmin ? (
                                            <div className="flex items-center gap-1 flex-wrap justify-center">
                                              <input
                                                type="number"
                                                min={0}
                                                max={row.unit.level_count * 100}
                                                className="w-12 rounded border bg-[var(--background)] px-1 py-0.5 text-[10px] font-mono text-[var(--foreground)]"
                                                style={{ borderColor: "var(--border)" }}
                                                value={edit.current_level}
                                                onChange={(e) => {
                                                  const n = Math.max(
                                                    0,
                                                    Math.min(row.unit.level_count * 100, Math.floor(Number(e.target.value) || 0))
                                                  );
                                                  setMilitaryEdit((prev) => ({ ...prev, [row.unit.id]: { ...prev[row.unit.id] ?? edit, current_level: n } }));
                                                }}
                                                disabled={isSaving}
                                              />
                                              <span className="text-[10px] text-[var(--foreground-muted)]">pts</span>
                                            </div>
                                          ) : (
                                            <Tooltip
                                              content={
                                                unlockedLevel > 0
                                                  ? `Niveau actuel : ${(points / 100).toFixed(1).replace(".", ",")} / ${row.unit.level_count}`
                                                  : `Unité non débloquée (${(points / 100).toFixed(1).replace(".", ",")} / 1)`
                                              }
                                              side="top"
                                            >
                                              <div className="relative inline-flex w-full min-w-0 max-w-2xl mx-auto">
                                                <div className={isLocked ? "blur-[1px] opacity-60" : ""}>
                                                  <div className="flex gap-0.5 flex-1">
                                                    {Array.from({ length: row.unit.level_count }, (_, i) => {
                                                      const start = i * 100;
                                                      const end = (i + 1) * 100;
                                                      const filled =
                                                        points <= start
                                                          ? 0
                                                          : points >= end
                                                            ? 1
                                                            : (points - start) / 100;
                                                      return (
                                                        <div
                                                          key={i}
                                                          className="relative h-[2.25rem] min-w-[2.25rem] flex-1 overflow-hidden rounded border transition-colors"
                                                          style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
                                                          aria-hidden
                                                        >
                                                          <div
                                                            className="absolute inset-y-0 left-0"
                                                            style={{
                                                              width: `${filled * 100}%`,
                                                              background: "var(--accent)",
                                                            }}
                                                          />
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                                {isLocked && (
                                                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                    <span className="rounded bg-[var(--background-panel)]/90 px-1.5 py-0.5 text-xs text-[var(--danger)]">
                                                      🔒
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </td>
                                      {isAdmin && (
                                        <td className="w-20 py-0.5 px-2 align-middle text-center">
                                          <button
                                            type="button"
                                            disabled={isSaving}
                                            onClick={() => onSaveMilitaryUnit(row.unit.id, edit.current_level, edit.extra_count)}
                                            className="rounded border py-0.5 px-1.5 text-[10px] font-medium disabled:opacity-50"
                                            style={{ borderColor: "var(--border)", background: "var(--accent)", color: "#0f1419" }}
                                          >
                                            {isSaving ? "…" : "Enregistrer"}
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
