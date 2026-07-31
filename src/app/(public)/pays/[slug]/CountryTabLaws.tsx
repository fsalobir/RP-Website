"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LAW_DEFINITIONS, getLawLevelKeyFromScore, getLawEffectsForLevel, type CountryLawRow, type LawConfig, type LawDefinition } from "@/lib/laws";
import {
  EFFECT_KIND_LABELS,
  formatEffectValue,
  isEffectDisplayPositive,
  MILITARY_BRANCH_EFFECT_LABELS,
  STAT_LABELS,
  formatSubTypeTargetLabel,
  parseSubTypeTarget,
  type StatKey,
} from "@/lib/countryEffects";
import { BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import { formatNumber } from "@/lib/format";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";
import { setLawScoreImmediate, setLawTarget } from "./actions";

const LAW_ICONS: Record<string, string> = {
  mobilisation: "🛡️",
  auto_industry: "🚙",
  air_industry: "✈️",
  naval_industry: "⚓",
  research: "🔬",
};

function resolveTargetLabel(
  effectKind: string,
  target: string | null,
  rosterNameById: Map<string, string>
): string {
  if (!target) return "";
  if (effectKind === "military_unit_extra" || effectKind === "military_unit_tech_rate" || effectKind === "military_unit_limit_modifier_roster") {
    return rosterNameById.get(target) ?? "Unité non visible";
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
  const glassMutedClass = "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]";
  const label = EFFECT_KIND_LABELS[effectKind] ?? effectKind;
  const targetStr = resolveTargetLabel(effectKind, effectTarget, rosterNameById);
  const valStr = formatEffectValue(effectKind, value);
  const isNeutral = effectKind.startsWith("influence_modifier_") ? value === 1 : value === 0;
  const isPositive = !isNeutral && isEffectDisplayPositive({ effect_kind: effectKind, value });
  const isNegative = !isNeutral && !isPositive;

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 text-xs leading-relaxed">
      <span
        className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: isPositive ? "var(--accent)" : isNegative ? "var(--danger)" : "var(--foreground-muted)" }}
      />
      <span className={`min-w-0 break-words ${glassMutedClass}`}>
        {label}{targetStr ? ` — ${targetStr}` : ""}
      </span>
      <span
        className="shrink-0 text-right font-semibold"
        style={{ color: isPositive ? "var(--accent)" : isNegative ? "var(--danger)" : "#ffffff" }}
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
  isAdmin,
  ruleParametersByKey,
  rosterNameById,
}: {
  def: LawDefinition;
  lawRow: CountryLawRow | undefined;
  config: LawConfig | undefined;
  countryId: string;
  canEditCountry: boolean;
  /** Admin : clic = application immédiate du niveau (score = cible), outil debug. */
  isAdmin: boolean;
  ruleParametersByKey: Record<string, { value: unknown }>;
  rosterNameById: Map<string, string>;
}) {
  const glassBorderClass = "border-white/25";
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";
  const glassMutedClass = "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
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
    () => getLawLevelKeyFromScore(score, thresholds, def.levels, def.lawKey),
    [score, thresholds, def.levels, def.lawKey]
  );
  const targetLevelKey = useMemo(
    () => getLawLevelKeyFromScore(targetScore, thresholds, def.levels, def.lawKey),
    [targetScore, thresholds, def.levels, def.lawKey]
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
      const result = isAdmin
        ? await setLawScoreImmediate(countryId, def.lawKey, threshold, lawRow?.updated_at ?? null)
        : await setLawTarget(countryId, def.lawKey, threshold, lawRow?.updated_at ?? null);
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

  const currentLabel = def.levels.find((l) => l.key === currentLevelKey)?.label ?? currentLevelKey ?? "—";
  const targetLabel = def.levels.find((l) => l.key === targetLevelKey)?.label ?? targetLevelKey ?? "—";
  const targetDiffersFromCurrent = currentLevelKey !== targetLevelKey;
  const inTransition = targetDiffersFromCurrent && daysToTarget !== null && scoreDistance > 0;
  const rightSummary = inTransition
    ? `${targetLabel} // ${formatNumber(daysToTarget)} jour(s) restants`
    : currentLabel;
  const icon = LAW_ICONS[def.lawKey] ?? "⚖️";

  return (
    <div
      className={`rounded-xl border ${glassBorderClass}`}
      style={{
        background: "rgba(255,255,255,0.06)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`group relative min-h-11 w-full px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4 ${expanded ? "border-b" : ""}`}
        style={expanded ? { borderColor: "rgba(255,255,255,0.22)" } : undefined}
        aria-expanded={expanded}
      >
        <span className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.5rem] items-center gap-x-3">
          <span
            aria-hidden
            className="row-span-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-lg"
          >
            {icon}
          </span>
          <span className={`min-w-0 text-sm font-bold leading-snug sm:text-base ${glassTextClass}`}>
            {def.title_fr}
          </span>
          <span className="col-start-3 row-span-2 row-start-1 flex h-10 w-10 items-center justify-center self-center rounded-lg text-white/80 transition-colors group-hover:bg-white/5 group-active:bg-white/10">
            <DisclosureChevron open={expanded} />
          </span>
          <span className={`col-start-2 col-end-3 mt-0.5 min-w-0 break-words text-xs leading-snug ${glassMutedClass}`}>
            {rightSummary}
          </span>
        </span>
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${expanded ? "opacity-100" : "opacity-0"}`}
        style={{ maxHeight: expanded ? "2000px" : "0px" }}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="relative px-3 pb-5 pt-3 sm:px-5">
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
                : "rgba(255,255,255,0.28)";
            const bottomClr = levelEffects.length > 0 ? "transparent" : borderClr;
            return (
              <div key={level.key}>
                <button
                  type="button"
                  disabled={!canEditCountry || isLoading}
                  onClick={() => handleClick(level.key)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-t border border-solid px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderTopColor: borderClr,
                    borderRightColor: borderClr,
                    borderBottomColor: bottomClr,
                    borderLeftColor: borderClr,
                    background: isCurrent
                      ? "rgba(16,185,129,0.22)"
                      : isTarget
                        ? "rgba(255,255,255,0.24)"
                        : "rgba(255,255,255,0.14)",
                    color: "#ffffff",
                    borderRadius: levelEffects.length > 0 ? "0.375rem 0.375rem 0 0" : "0.375rem",
                  }}
                >
                  <span className="min-w-0 flex-1 break-words font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{level.label}</span>
                  {isCurrent && (
                    <span className="shrink-0 self-start rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--accent)", color: "#0f1419" }}>
                      Actuel
                    </span>
                  )}
                  {isTarget && !isCurrent && !isAdmin && (
                    <span
                      className="shrink-0 self-start rounded px-1.5 py-0.5 text-xs text-white/95"
                      style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)" }}
                    >
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
                          : "rgba(255,255,255,0.22)",
                      background: "rgba(15,23,42,0.55)",
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
                className="animate-spin text-4xl motion-reduce:animate-none"
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
  isAdmin = false,
  countryLawRows,
  ruleParametersByKey,
  rosterUnitsFlat,
}: {
  countryId: string;
  countrySlug: string;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
  isAdmin?: boolean;
  countryLawRows: CountryLawRow[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  rosterUnitsFlat: Array<{ id: string; name_fr: string }>;
}) {
  const glassBorderClass = "border-white/25";
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";
  const glassMutedClass = "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
  const rosterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of rosterUnitsFlat) m.set(u.id, u.name_fr);
    return m;
  }, [rosterUnitsFlat]);

  return (
    <section
      className={`${panelClass} rounded-xl border p-4 ${glassBorderClass}`}
      style={{ ...panelStyle, background: "rgba(12,20,32,0.92)", borderColor: "rgba(255,255,255,0.2)" }}
    >
      <h2 className={`mb-4 text-lg font-semibold ${glassTextClass}`}>
        Lois nationales
      </h2>
      <p className={`mb-6 text-sm ${glassMutedClass}`}>
        {isAdmin && canEditCountry
          ? "Mode administrateur : un clic sur un niveau applique immédiatement la loi à ce palier (score et cible identiques). Les joueurs voient encore une transition quotidienne vers une cible."
          : "Orientez les politiques nationales en fixant un objectif pour chaque loi. Le score évoluera chaque jour vers la cible choisie."}
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
              isAdmin={isAdmin}
              ruleParametersByKey={ruleParametersByKey}
              rosterNameById={rosterNameById}
            />
          );
        })}
      </div>
    </section>
  );
}
