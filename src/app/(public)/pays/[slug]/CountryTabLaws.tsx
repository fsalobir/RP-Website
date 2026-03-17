"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LAW_DEFINITIONS, getLawLevelKeyFromScore, getLawEffectsForLevel, type CountryLawRow, type LawConfig, type LawDefinition } from "@/lib/laws";
import {
  EFFECT_KIND_LABELS,
  formatEffectValue,
  MILITARY_BRANCH_EFFECT_LABELS,
  STAT_LABELS,
  formatSubTypeTargetLabel,
  parseSubTypeTarget,
  type StatKey,
} from "@/lib/countryEffects";
import { BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import { formatNumber } from "@/lib/format";
import { setLawTarget } from "./actions";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

function resolveTargetLabel(
  effectKind: string,
  target: string | null,
  rosterNameById: Map<string, string>
): string {
  if (!target) return "";
  if (effectKind === "military_unit_extra" || effectKind === "military_unit_tech_rate" || effectKind === "military_unit_limit_modifier_roster") {
    return rosterNameById.get(target) ?? target;
  }
  if (effectKind === "military_unit_limit_modifier_sub_type" && target) {
    const p = parseSubTypeTarget(target);
    return formatSubTypeTargetLabel(p.branch, p.subType);
  }
  if (effectKind === "military_unit_limit_modifier") {
    return MILITARY_BRANCH_EFFECT_LABELS[target] ?? target;
  }
  if (effectKind === "budget_ministry_min_pct" || effectKind === "budget_ministry_effect_multiplier") {
    return BUDGET_MINISTRY_LABELS[target] ?? target;
  }
  return STAT_LABELS[target as StatKey] ?? target;
}

function EffectLine({
  effectKind,
  effectTarget,
  value,
  rosterNameById,
}: {
  effectKind: string;
  effectTarget: string | null;
  value: number;
  rosterNameById: Map<string, string>;
}) {
  const label = EFFECT_KIND_LABELS[effectKind] ?? effectKind;
  const targetStr = resolveTargetLabel(effectKind, effectTarget, rosterNameById);
  const valStr = formatEffectValue(effectKind, value);
  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <li className="flex items-baseline gap-1.5 text-xs leading-relaxed">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]"
        style={{ background: isPositive ? "var(--accent)" : isNegative ? "var(--danger)" : "var(--foreground-muted)" }}
      />
      <span className="text-[var(--foreground-muted)]">
        {label}{targetStr ? ` — ${targetStr}` : ""}
      </span>
      <span
        className="font-semibold ml-auto shrink-0"
        style={{ color: isPositive ? "var(--accent)" : isNegative ? "var(--danger)" : "var(--foreground)" }}
      >
        {valStr}
      </span>
    </li>
  );
}

function LawCard({
  def,
  lawRow,
  config,
  countryId,
  canEditCountry,
  ruleParametersByKey,
  rosterNameById,
}: {
  def: LawDefinition;
  lawRow: CountryLawRow | undefined;
  config: LawConfig | undefined;
  countryId: string;
  canEditCountry: boolean;
  ruleParametersByKey: Record<string, { value: unknown }>;
  rosterNameById: Map<string, string>;
}) {
  const router = useRouter();
  const [settingLevel, setSettingLevel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const pendingTarget = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  const score = lawRow?.score ?? 0;
  const targetScore = lawRow?.target_score ?? 0;
  const thresholds = config?.level_thresholds;
  const dailyStep = config?.daily_step ?? 20;

  const currentLevelKey = useMemo(
    () => getLawLevelKeyFromScore(score, thresholds, def.levels),
    [score, thresholds, def.levels]
  );
  const targetLevelKey = useMemo(
    () => getLawLevelKeyFromScore(targetScore, thresholds, def.levels),
    [targetScore, thresholds, def.levels]
  );

  useEffect(() => {
    if (!settingLevel || pendingTarget.current === null) return;
    if (targetScore !== pendingTarget.current) return;
    // Quand la cible est confirmée côté props, on garde un petit délai UI (transition),
    // sans dépendre de Date.now() (règle de pureté).
    const id = window.setTimeout(() => {
      pendingTarget.current = null;
      startedAt.current = null;
      setSettingLevel(null);
    }, 400);
    return () => window.clearTimeout(id);
  }, [targetScore, settingLevel]);

  useEffect(() => {
    if (!settingLevel) return;
    const id = window.setTimeout(() => {
      pendingTarget.current = null;
      startedAt.current = null;
      setSettingLevel(null);
    }, 10000);
    return () => window.clearTimeout(id);
  }, [settingLevel]);

  const scoreDistance = Math.abs(targetScore - score);
  const daysToTarget = dailyStep > 0 && scoreDistance > 0 ? Math.ceil(scoreDistance / dailyStep) : null;
  const isLoading = !!settingLevel;

  const handleClick = async (levelKey: string) => {
    if (!canEditCountry || isLoading) return;
    const threshold = thresholds?.[levelKey] ?? 0;
    pendingTarget.current = threshold;
    setSettingLevel(levelKey);
    setError(null);
    try {
      const result = await setLawTarget(countryId, def.lawKey, threshold);
      if (result.error) {
        setError(result.error);
        pendingTarget.current = null;
        startedAt.current = null;
        setSettingLevel(null);
      } else {
        router.refresh();
      }
    } catch {
      pendingTarget.current = null;
      setSettingLevel(null);
      setError("Une erreur est survenue lors de la mise à jour.");
    }
  };

  const lawTooltip = "Fixez un objectif de politique ; le score du pays évoluera progressivement vers la cible.";
  const currentLabel = def.levels.find((l) => l.key === currentLevelKey)?.label ?? currentLevelKey ?? "—";
  const targetLabel = def.levels.find((l) => l.key === targetLevelKey)?.label ?? targetLevelKey ?? "—";
  const targetDiffersFromCurrent = currentLevelKey !== targetLevelKey;
  const inTransition = targetDiffersFromCurrent && daysToTarget !== null && scoreDistance > 0;
  const barSummary =
    inTransition
      ? `${currentLabel} → ${targetLabel} // ${formatNumber(daysToTarget)} jour(s) restants`
      : currentLabel;

  return (
    <div
      className={`rounded-lg border ${expanded ? "p-5" : "flex items-center px-3 h-8"}`}
      style={{
        background: "var(--background-panel)",
        borderColor: "var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex w-full items-center gap-3 text-left ${expanded ? "border-b pb-3" : "h-full leading-none"}`}
        style={expanded ? { borderColor: "var(--border)" } : undefined}
        aria-expanded={expanded}
      >
        {/* Gauche : titre + chevron + infobulle */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 leading-tight">
          <span className={`truncate font-bold text-[var(--foreground)] ${expanded ? "text-lg" : "text-sm"}`}>
            {def.title_fr}
          </span>
          <span
            className="shrink-0 text-[var(--foreground-muted)] text-xs transition-transform duration-200 ease-out"
            style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
            aria-hidden
          >
            ▾
          </span>
          <span className="shrink-0">
            <InfoTooltip content={lawTooltip} side="top" />
          </span>
        </span>
        {/* Droite : libellé (état actuel ou transition) */}
        <span className={`shrink-0 font-bold text-[var(--foreground)] text-right leading-tight whitespace-nowrap ${expanded ? "text-sm" : "text-xs"}`}>
          {barSummary}
        </span>
      </button>

      <div
        className="relative min-h-0 overflow-hidden"
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease-out",
        }}
      >
        <div className="relative min-h-0 min-w-0 overflow-hidden pt-3">
        <div
          className={`space-y-1 pt-1 transition-[filter] duration-200 ${isLoading ? "pointer-events-none select-none blur-[3px]" : ""}`}
          aria-busy={isLoading}
          aria-live="polite"
        >
          {def.levels.map((level) => {
            const isCurrent = currentLevelKey === level.key;
            const isTarget = targetLevelKey === level.key;
            const levelEffects = getLawEffectsForLevel(def.lawKey, level.key, ruleParametersByKey);

            const borderClr = isCurrent
              ? "var(--accent)"
              : isTarget
                ? "var(--accent-muted)"
                : "var(--border)";
            const bottomClr = levelEffects.length > 0 ? "transparent" : borderClr;
            return (
              <div key={level.key}>
                <button
                  type="button"
                  disabled={!canEditCountry || isLoading}
                  onClick={() => handleClick(level.key)}
                  className="flex w-full items-center gap-3 rounded-t border border-solid px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    borderTopColor: borderClr,
                    borderRightColor: borderClr,
                    borderBottomColor: bottomClr,
                    borderLeftColor: borderClr,
                    background: isCurrent
                      ? "var(--accent-muted)"
                      : isTarget
                        ? "var(--background-elevated)"
                        : "transparent",
                    color: "var(--foreground)",
                    borderRadius: levelEffects.length > 0 ? "0.375rem 0.375rem 0 0" : "0.375rem",
                  }}
                >
                  <span className="flex-1 text-[var(--foreground)] font-normal">{level.label}</span>
                  <InfoTooltip
                    content={
                      levelEffects.length > 0 ? (
                        <ul className="space-y-0.5 text-left text-xs max-h-48 overflow-y-auto">
                          {levelEffects.map((e, i) => (
                            <li key={i} className="flex items-baseline gap-1.5">
                              <span className="text-[var(--foreground-muted)]">
                                {EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind}
                                {resolveTargetLabel(e.effect_kind, e.effect_target, rosterNameById)
                                  ? ` — ${resolveTargetLabel(e.effect_kind, e.effect_target, rosterNameById)}`
                                  : ""}
                              </span>
                              <span className="font-medium shrink-0">{formatEffectValue(e.effect_kind, e.value)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "Aucun effet configuré pour ce palier."
                      )
                    }
                    side="bottom"
                  />
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--accent)", color: "#0f1419" }}>
                      Actuel
                    </span>
                  )}
                  {isTarget && !isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--background-elevated)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
                      Cible
                    </span>
                  )}
                </button>
                {levelEffects.length > 0 && (
                  <div
                    className="rounded-b border border-t-0 px-3 py-2 mb-0.5"
                    style={{
                      borderColor: isCurrent
                        ? "var(--accent)"
                        : isTarget
                          ? "var(--accent-muted)"
                          : "var(--border)",
                      background: "var(--background)",
                    }}
                  >
                    <ul className="space-y-0.5">
                      {levelEffects.map((e, i) => (
                        <EffectLine
                          key={i}
                          effectKind={e.effect_kind}
                          effectTarget={e.effect_target}
                          value={e.value}
                          rosterNameById={rosterNameById}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-[var(--background-panel)]/70"
            aria-hidden
          >
            <span
              className="text-4xl animate-spin"
              style={{ filter: "drop-shadow(0 0 4px var(--background))" }}
              title="Mise à jour en cours…"
            >
              ⏳
            </span>
          </div>
        )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function CountryTabLaws({
  countryId,
  countrySlug: _countrySlug,
  panelClass,
  panelStyle,
  canEditCountry,
  countryLawRows,
  ruleParametersByKey,
  rosterUnitsFlat,
}: {
  countryId: string;
  countrySlug: string;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
  countryLawRows: CountryLawRow[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  rosterUnitsFlat: Array<{ id: string; name_fr: string }>;
}) {
  const rosterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of rosterUnitsFlat) m.set(u.id, u.name_fr);
    return m;
  }, [rosterUnitsFlat]);

  return (
    <section className={panelClass} style={panelStyle}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
        Lois nationales
      </h2>
      <p className="mb-6 text-sm text-[var(--foreground-muted)]">
        Orientez les politiques nationales en fixant un objectif pour chaque loi. Le score évoluera chaque jour vers la cible choisie.
      </p>
      <div className="space-y-4">
        {LAW_DEFINITIONS.map((def) => {
          const lawRow = countryLawRows.find((r) => r.law_key === def.lawKey);
          const config = ruleParametersByKey[def.configRuleKey]?.value as LawConfig | undefined;
          return (
            <LawCard
              key={def.lawKey}
              def={def}
              lawRow={lawRow}
              config={config}
              countryId={countryId}
              canEditCountry={canEditCountry}
              ruleParametersByKey={ruleParametersByKey}
              rosterNameById={rosterNameById}
            />
          );
        })}
      </div>
    </section>
  );
}
