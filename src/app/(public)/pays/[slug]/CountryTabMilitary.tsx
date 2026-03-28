"use client";

import { Fragment, useState } from "react";
import type { MilitaryBranch } from "@/types/database";
import { formatNumber } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatEffectValue,
  getEffectiveMilitaryUnitCount,
  getLimitModifierPercent,
  getRosterUnitLimitModifierPercent,
  getSubTypeLimitModifierPercent,
  getUnitExtraContributingEffects,
  getUnitExtraEffectSum,
  type ResolvedEffect,
} from "@/lib/countryEffects";
import type { RosterRowByBranch } from "./countryTabsTypes";
import type { FoggedRoster, FoggedBranchEstimate, FoggedUnitEstimate } from "@/lib/intelFog";
import { adjustTargetCountryIntelForTesting } from "./actions";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

/** Effectifs (nombre d’unités × manpower du palier débloqué), identique à la colonne « Personnel » du tableau. */
function rosterRowPersonnel(
  row: RosterRowByBranch,
  edit: { current_level: number; extra_count: number },
  effects: ResolvedEffect[],
): number {
  const effectExtraSum = getUnitExtraEffectSum(effects, row.unit.id);
  const effectiveExtra = edit.extra_count + effectExtraSum;
  const rawCount = row.unit.base_count + effectiveExtra;
  const totalCount = getEffectiveMilitaryUnitCount(
    effects,
    row.unit.id,
    row.unit.branch,
    row.unit.sub_type ?? null,
    rawCount
  );
  const points = Math.max(0, edit.current_level);
  const unlockedLevel = Math.max(0, Math.min(row.unit.level_count, Math.floor(points / 100)));
  const manpowerLevel =
    unlockedLevel > 0 ? row.levels.find((l) => l.level === unlockedLevel)?.manpower ?? 0 : 0;
  return totalCount * manpowerLevel;
}

function defaultMilitaryEdit(row: RosterRowByBranch): { current_level: number; extra_count: number } {
  return {
    current_level: Math.max(0, row.countryState?.current_level ?? 0),
    extra_count: Math.max(0, row.countryState?.extra_count ?? 0),
  };
}

/** Panneau inline (pas de tooltip : tableaux + overflow). */
function AdminRosterExtraBreakdown({
  baseCount,
  storedExtra,
  effects,
  rosterUnitId,
  branch,
  subType,
  rawCount,
  totalCount,
  mutedClass,
  textClass,
}: {
  baseCount: number;
  storedExtra: number;
  effects: ResolvedEffect[];
  rosterUnitId: string;
  branch: string;
  subType: string | null;
  rawCount: number;
  totalCount: number;
  mutedClass: string;
  textClass: string;
}) {
  const contributing = getUnitExtraContributingEffects(effects, rosterUnitId);
  const effectSum = getUnitExtraEffectSum(effects, rosterUnitId);
  const branchPct = getLimitModifierPercent(effects, branch);
  const subPct = getSubTypeLimitModifierPercent(effects, branch, subType);
  const rosterPct = getRosterUnitLimitModifierPercent(effects, rosterUnitId);
  return (
    <div className={`space-y-2 rounded border border-white/20 bg-black/45 px-2 py-2 text-left text-[10px] backdrop-blur-sm ${textClass}`}>
      <div className="font-semibold text-[var(--accent)]">Décomposition du total (debug admin)</div>
      <ul className={`list-none space-y-0.5 ${textClass}`}>
        <li>Base roster : {formatNumber(baseCount)}</li>
        <li>Extra enregistré (sauvegarde) : {formatNumber(storedExtra)}</li>
      </ul>
      <div className="border-t border-white/15 pt-2">
        <p className={`mb-1 font-medium ${mutedClass}`}>Effets agrégés (lois, avantages, effets pays, global, IA, idéologie)</p>
        {contributing.length === 0 ? (
          <p className={mutedClass}>Aucun effet « extra unité » actif pour cette unité.</p>
        ) : (
          <ul className="max-h-40 list-none space-y-1 overflow-y-auto pr-1 font-mono text-[10px]">
            {contributing.map((e, i) => (
              <li key={`${e.source ?? "x"}-${e.sourceLabel ?? ""}-${i}`}>
                <span className={mutedClass}>{e.sourceLabel ?? "Effet"}</span>
                {" : "}
                {formatEffectValue("military_unit_extra", Number(e.value))}
              </li>
            ))}
          </ul>
        )}
        <p className={`mt-1.5 ${mutedClass}`}>
          Somme des effets sur l&apos;extra : {formatEffectValue("military_unit_extra", effectSum)}
        </p>
        <p className={`mt-1.5 ${mutedClass}`}>
          Sous-total brut (base + extra + extra effets) : {formatNumber(rawCount)}
        </p>
        <p className={`mt-0.5 ${mutedClass}`}>
          Modificateurs % (limite branche / sous-type / unité) :{" "}
          {formatEffectValue("military_unit_limit_modifier", branchPct)} /{" "}
          {formatEffectValue("military_unit_limit_modifier_sub_type", subPct)} /{" "}
          {formatEffectValue("military_unit_limit_modifier_roster", rosterPct)}
        </p>
        <p className={`mt-0.5 ${mutedClass}`}>
          Effectif après % (arrondi) : {formatNumber(totalCount)}
        </p>
      </div>
      <p className="border-t border-white/15 pt-2 font-semibold">{formatNumber(totalCount)}</p>
      <p className={`leading-snug ${mutedClass}`}>
        Brut × (1 + % branche) × (1 + % sous-type) × (1 + % unité), avec le brut = base + extra enregistré + somme des « extra unité ».
      </p>
    </div>
  );
}

type CountryTabMilitaryProps = {
  countryId: string;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
  militaryError: string | null;
  militarySubtypeOpen: Record<string, boolean>;
  setMilitarySubtypeOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>;
  effectiveLimitByBranch: Record<MilitaryBranch, number>;
  militaryEdit: Record<string, { current_level: number; extra_count: number }>;
  setMilitaryEdit: React.Dispatch<React.SetStateAction<Record<string, { current_level: number; extra_count: number }>>>;
  militarySavingAll: boolean;
  isAdmin: boolean;
  effects: ResolvedEffect[];
  onSaveAllMilitaryUnits: () => Promise<void>;
  intelLevel?: number | null;
  foggedRoster?: FoggedRoster | null;
  canAdjustIntelForTesting?: boolean;
  countrySlug: string;
};

export function CountryTabMilitary({
  countryId,
  panelClass,
  panelStyle,
  canEditCountry,
  militaryError,
  militarySubtypeOpen,
  setMilitarySubtypeOpen,
  rosterByBranch,
  effectiveLimitByBranch,
  militaryEdit,
  setMilitaryEdit,
  militarySavingAll,
  isAdmin,
  effects,
  onSaveAllMilitaryUnits,
  intelLevel = null,
  foggedRoster = null,
  canAdjustIntelForTesting = false,
  countrySlug,
}: CountryTabMilitaryProps) {
  const glassPanelClass = "rounded-2xl border border-white/25 p-6";
  const glassPanelStyle: React.CSSProperties = { background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" };
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
  const glassMutedClass = "text-white/90";
  const [intelDeltaInput, setIntelDeltaInput] = useState("0");
  const [intelUpdating, setIntelUpdating] = useState(false);
  const [intelAdjustError, setIntelAdjustError] = useState<string | null>(null);
  /** Debug admin : détail « nombre » sans tooltip (clic sur le total). */
  const [adminRosterExtraBreakdownOpen, setAdminRosterExtraBreakdownOpen] = useState<Record<string, boolean>>({});

  const handleAdjustIntelForTesting = async () => {
    const parsed = Number(intelDeltaInput);
    if (!Number.isFinite(parsed)) {
      setIntelAdjustError("Delta invalide.");
      return;
    }
    const bounded = Math.max(-100, Math.min(100, Math.trunc(parsed)));
    if (bounded === 0) {
      setIntelAdjustError("Le delta doit être différent de 0.");
      return;
    }
    setIntelUpdating(true);
    setIntelAdjustError(null);
    const result = await adjustTargetCountryIntelForTesting(countryId, countrySlug, bounded);
    setIntelUpdating(false);
    if (result?.error) {
      setIntelAdjustError(result.error);
      return;
    }
    setIntelDeltaInput("0");
    window.location.reload();
  };

  if (foggedRoster != null && intelLevel != null) {
    return (
      <div className="space-y-6">
        <IntelGauge level={intelLevel} panelClass={glassPanelClass} panelStyle={glassPanelStyle} textClass={glassTextClass} mutedClass={glassMutedClass} />
        {canAdjustIntelForTesting && (
          <section className={glassPanelClass} style={glassPanelStyle}>
            <h3 className={`mb-2 text-sm font-semibold ${glassTextClass}`}>Test - Ajuster le renseignement</h3>
            <p className={`mb-3 text-xs ${glassMutedClass}`}>
              Outil temporaire de test. Delta exact appliqué sur le niveau de renseignement de ce pays.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={-100}
                max={100}
                value={intelDeltaInput}
                onChange={(e) => setIntelDeltaInput(e.target.value)}
                className="w-28 rounded border border-white/25 bg-white/10 px-2 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAdjustIntelForTesting}
                disabled={intelUpdating}
                className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] disabled:opacity-50"
              >
                {intelUpdating ? "Application..." : "Ajouter niveau de renseignement"}
              </button>
            </div>
            {intelAdjustError && <p className="mt-2 text-sm text-[var(--danger)]">{intelAdjustError}</p>}
          </section>
        )}
        {foggedRoster.type === "none" && (
          <section className="relative overflow-hidden rounded-2xl border border-white/25" style={{ background: "transparent" }}>
            <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
              <div
                className="absolute inset-0 bg-cover bg-no-repeat scale-105"
                style={{
                  backgroundImage: "url(/images/site/renseignement-insuffisant-bg.png)",
                  backgroundPosition: "top center",
                  filter: "blur(0.5px)",
                }}
              />
              <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
            </div>
            <div className="relative z-10 flex flex-col items-center justify-center gap-4 py-12 px-6">
              <span className="text-4xl opacity-40">🔍</span>
              <p className={`text-center text-sm max-w-md ${glassMutedClass}`}>
                Renseignement insuffisant. Les services de renseignement ne disposent d'aucune information
                fiable sur les capacités militaires de ce pays.
              </p>
              <p className={`text-center text-xs opacity-90 ${glassMutedClass}`}>
                Lancez une opération d'espionnage pour en savoir plus.
              </p>
            </div>
          </section>
        )}
        {foggedRoster.type === "branch" && (
          <FoggedBranchView branches={foggedRoster.branches} panelClass={glassPanelClass} panelStyle={glassPanelStyle} textClass={glassTextClass} mutedClass={glassMutedClass} backgroundImage={RENSEIGNEMENT_BG} />
        )}
        {foggedRoster.type === "unit" && (
          <FoggedUnitView units={foggedRoster.units} panelClass={glassPanelClass} panelStyle={glassPanelStyle} textClass={glassTextClass} mutedClass={glassMutedClass} backgroundImage={RENSEIGNEMENT_BG} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

        const branchPersonnel = rows.reduce(
          (sum, row) => sum + rosterRowPersonnel(row, militaryEdit[row.unit.id] ?? defaultMilitaryEdit(row), effects),
          0,
        );

        const sectionContent = (
          <>
            <h2 className={`mb-3 text-lg font-semibold ${glassTextClass}`}>
              {BRANCH_LABELS[branch]}
              <span className={`ml-2 text-sm font-normal ${glassMutedClass}`}>
                {" - Personnel : "}
                {formatNumber(branchPersonnel)}
              </span>
              {effectiveLimitByBranch[branch] > 0 && (
                <span className={`ml-2 text-sm font-normal ${glassMutedClass}`}>
                  (limite effective : {formatNumber(effectiveLimitByBranch[branch])})
                </span>
              )}
            </h2>
            {rows.length === 0 ? (
              <p className={glassMutedClass}>Aucune unité dans le roster.</p>
            ) : (
              <div className="space-y-1">
                {groups.map(({ subType, label, rows: subRows }) => {
                  const subKey = `${branch}_${subType ?? "__none__"}`;
                  const isOpen = militarySubtypeOpen[subKey] !== false;
                  const subPersonnel = subRows.reduce(
                    (sum, row) => sum + rosterRowPersonnel(row, militaryEdit[row.unit.id] ?? defaultMilitaryEdit(row), effects),
                    0,
                  );
                  return (
                    <div key={subKey} className="rounded-xl border border-white/25 overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                      <button
                        type="button"
                        onClick={() => setMilitarySubtypeOpen((prev) => ({ ...prev, [subKey]: prev[subKey] === false }))}
                        className={`flex w-full items-center gap-2 py-1.5 px-3 text-left text-sm font-medium ${glassTextClass} hover:bg-white/10 transition-colors`}
                        style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
                      >
                        <span
                          className="inline-block transition-transform duration-200 ease-out"
                          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                        >
                          ▶
                        </span>
                        <span>{label}</span>
                        <span className={glassMutedClass}>Personnel : {formatNumber(subPersonnel)}</span>
                      </button>
                      <div
                        className="grid transition-[grid-template-rows] duration-200 ease-out"
                        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                      >
                        <div className="overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm table-fixed">
                              <thead>
                                <tr className="border-b border-white/25">
                                  <th className={`w-12 pb-1.5 pt-1 px-2 text-center font-medium text-xs ${glassMutedClass}`}>Icône</th>
                                  <th className={`w-[20%] pb-1.5 pt-1 px-2 text-center font-medium text-xs ${glassMutedClass}`}>Nom</th>
                                  <th className={`w-[14%] pb-1.5 pt-1 px-2 text-center font-medium text-xs ${glassMutedClass}`}>Nombre</th>
                                  <th className={`w-[12%] pb-1.5 pt-1 px-2 text-center font-medium text-xs ${glassMutedClass}`}>Personnel</th>
                                  <th className={`pb-1.5 pt-1 px-2 text-center font-medium text-xs ${glassMutedClass}`}>Niveaux</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subRows.map((row) => {
                                  const edit = militaryEdit[row.unit.id] ?? defaultMilitaryEdit(row);
                                  const storedExtra = edit.extra_count;
                                  const effectExtraSum = getUnitExtraEffectSum(effects, row.unit.id);
                                  const effectiveExtra = storedExtra + effectExtraSum;
                                  const rawCount = row.unit.base_count + effectiveExtra;
                                  const totalCount = getEffectiveMilitaryUnitCount(
                                    effects,
                                    row.unit.id,
                                    row.unit.branch,
                                    row.unit.sub_type ?? null,
                                    rawCount
                                  );
                                  const points = Math.max(0, edit.current_level);
                                  const unlockedLevel = Math.max(
                                    0,
                                    Math.min(row.unit.level_count, Math.floor(points / 100))
                                  );
                                  const personnel = rosterRowPersonnel(row, edit, effects);
                                  const isLocked = points < 100;
                                  const isSaving = militarySavingAll;

                                  return (
                                    <Fragment key={row.unit.id}>
                                    <tr className="border-b border-white/25">
                                      <td className="w-12 py-0.5 px-2 align-middle text-center">
                                        <div className="inline-block h-9 w-9 overflow-hidden rounded border border-white/25 bg-white/10">
                                          {row.unit.icon_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={row.unit.icon_url} alt="" className="h-full w-full object-contain" />
                                          ) : (
                                            <div className={`flex h-full w-full items-center justify-center text-[8px] ${glassMutedClass}`}>—</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="w-[20%] py-0.5 px-2 align-middle text-center">
                                        <span className={`inline-block max-w-full truncate text-xs font-medium ${glassTextClass}`} title={row.unit.name_fr}>
                                          {row.unit.name_fr}
                                        </span>
                                      </td>
                                      <td className="w-[14%] py-0.5 px-2 align-middle text-center">
                                        {isAdmin ? (
                                          <div className="flex flex-wrap items-center justify-center gap-0.5">
                                            <span className={`text-[10px] ${glassMutedClass}`}>{row.unit.base_count}+</span>
                                            <input
                                              type="number"
                                              min={0}
                                              className="w-9 rounded border border-white/25 bg-white/10 px-0.5 py-0.5 text-[10px] font-mono text-white"
                                              value={edit.extra_count}
                                              onChange={(e) => {
                                                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                setMilitaryEdit((prev) => ({ ...prev, [row.unit.id]: { ...prev[row.unit.id] ?? edit, extra_count: n } }));
                                              }}
                                              disabled={isSaving}
                                            />
                                            <span className={`text-[10px] ${glassMutedClass}`}>= </span>
                                            <button
                                              type="button"
                                              className={`text-[10px] font-mono underline decoration-dotted decoration-white/50 hover:text-[var(--accent)] ${glassTextClass}`}
                                              aria-expanded={adminRosterExtraBreakdownOpen[row.unit.id] === true}
                                              title="Afficher ou masquer le détail des effets (debug admin)"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setAdminRosterExtraBreakdownOpen((prev) => ({
                                                  ...prev,
                                                  [row.unit.id]: !prev[row.unit.id],
                                                }));
                                              }}
                                            >
                                              {formatNumber(totalCount)}
                                            </button>
                                          </div>
                                        ) : (
                                          <span
                                            className="inline-block rounded border border-white/25 px-1.5 py-0.5 font-mono text-xs font-medium bg-white/10 text-white"
                                          >
                                            {formatNumber(totalCount)}
                                          </span>
                                        )}
                                      </td>
                                      <td className={`w-[12%] py-0.5 px-2 font-mono text-xs align-middle text-center ${glassTextClass}`}>
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
                                                className="w-12 rounded border border-white/25 bg-white/10 px-1 py-0.5 text-[10px] font-mono text-white"
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
                                              <span className={`text-[10px] ${glassMutedClass}`}>pts</span>
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
                                                          className="relative h-[2.25rem] min-w-[2.25rem] flex-1 overflow-hidden rounded border border-white/25 transition-colors bg-white/10"
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
                                                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-xs text-[var(--danger)]">
                                                      🔒
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {isAdmin && adminRosterExtraBreakdownOpen[row.unit.id] ? (
                                      <tr className="border-b border-white/25 bg-black/35">
                                        <td colSpan={5} className="px-3 py-2 align-top text-left">
                                          <AdminRosterExtraBreakdown
                                            baseCount={row.unit.base_count}
                                            storedExtra={storedExtra}
                                            effects={effects}
                                            rosterUnitId={row.unit.id}
                                            branch={row.unit.branch}
                                            subType={row.unit.sub_type ?? null}
                                            rawCount={rawCount}
                                            totalCount={totalCount}
                                            mutedClass={glassMutedClass}
                                            textClass={glassTextClass}
                                          />
                                        </td>
                                      </tr>
                                    ) : null}
                                    </Fragment>
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
            {isAdmin && canEditCountry && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={militarySavingAll}
                  onClick={onSaveAllMilitaryUnits}
                  className="rounded-lg border border-[var(--accent)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#0f1419" }}
                >
                  {militarySavingAll ? "Enregistrement…" : "Enregistrer toutes les modifications"}
                </button>
              </div>
            )}
          </>
        );
        const branchBg = branch === "mer" ? MER_BG : branch === "strategique" ? STRATEGIQUE_BG : null;
        return (
          <section key={branch} className="relative overflow-hidden rounded-2xl border border-white/25" style={{ background: "transparent" }}>
            <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
              {branchBg && (
                <div
                  className="absolute inset-0 bg-cover bg-no-repeat scale-105"
                  style={{
                    backgroundImage: `url(${branchBg})`,
                    backgroundPosition: "top center",
                    filter: "blur(0.5px)",
                  }}
                />
              )}
              <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
            </div>
            <div className="relative z-10 p-6">{sectionContent}</div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Fog sub-components ──────────────────────────────────────────────

const INTEL_MESSAGES: [number, string][] = [
  [0, "Aucune information disponible."],
  [10, "Bribes fragmentaires, fiabilité douteuse."],
  [25, "Sources partielles, estimations grossières."],
  [50, "Renseignement partiel, estimations par unité."],
  [75, "Renseignement fiable, fourchettes serrées."],
  [90, "Intelligence quasi-complète."],
];

function getIntelMessage(level: number): string {
  let msg = INTEL_MESSAGES[0][1];
  for (const [threshold, text] of INTEL_MESSAGES) {
    if (level >= threshold) msg = text;
  }
  return msg;
}

const RENSEIGNEMENT_BG = "/images/site/renseignement-insuffisant-bg.png";
const MER_BG = "/images/site/mer-bg.png";
const STRATEGIQUE_BG = "/images/site/strategique-bg.png";

function IntelGauge({
  level,
  panelClass,
  panelStyle,
  textClass = "text-[var(--foreground)]",
  mutedClass = "text-[var(--foreground-muted)]",
  backgroundImage,
}: {
  level: number;
  panelClass: string;
  panelStyle: React.CSSProperties;
  textClass?: string;
  mutedClass?: string;
  backgroundImage?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(level)));
  const color =
    pct < 25 ? "var(--danger)" : pct < 50 ? "#e6a817" : pct < 75 ? "#d4a017" : "var(--accent)";
  const content = (
    <div className="flex items-center gap-4">
      <span className="text-lg">🔍</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className={`text-sm font-semibold ${textClass}`}>
            Niveau de renseignement
          </span>
          <span className="text-xs font-mono" style={{ color }}>
            {pct} %
          </span>
        </div>
        <div
          className="h-2 w-full rounded-full overflow-hidden bg-white/20"
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <p className={`mt-1.5 text-xs ${mutedClass}`}>
          {getIntelMessage(pct)}
        </p>
      </div>
    </div>
  );
  if (backgroundImage) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/25" style={{ background: "transparent" }}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat scale-105"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundPosition: "top center",
              filter: "blur(0.5px)",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
        </div>
        <div className="relative z-10 p-6">{content}</div>
      </section>
    );
  }
  return (
    <section className={panelClass} style={panelStyle}>
      {content}
    </section>
  );
}

function formatFogRange(range: { min: number; max: number }): string {
  if (range.min === range.max) return formatNumber(range.min);
  return `${formatNumber(range.min)} – ${formatNumber(range.max)}`;
}

function FoggedBranchView({
  branches,
  panelClass,
  panelStyle,
  textClass = "text-[var(--foreground)]",
  mutedClass = "text-[var(--foreground-muted)]",
  backgroundImage,
}: {
  branches: FoggedBranchEstimate[];
  panelClass: string;
  panelStyle: React.CSSProperties;
  textClass?: string;
  mutedClass?: string;
  backgroundImage?: string;
}) {
  const content = (
    <>
      <h2 className={`mb-3 text-xl font-semibold ${textClass}`}>
        Estimations par branche
      </h2>
      <p className={`mb-4 text-sm ${mutedClass}`}>
        Données fragmentaires — les fourchettes ci-dessous sont des estimations.
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/25" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/25">
              <th className={`pb-2 px-3 text-left font-medium text-sm ${mutedClass}`}>Branche</th>
              <th className={`pb-2 px-3 text-center font-medium text-sm ${mutedClass}`}>Unités (est.)</th>
              <th className={`pb-2 px-3 text-center font-medium text-sm ${mutedClass}`}>Personnel (est.)</th>
              <th className={`pb-2 px-3 text-center font-medium text-sm ${mutedClass}`}>Niveau tech.</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.branch} className="border-b border-white/25">
                <td className={`py-2 px-3 font-medium text-sm ${textClass}`}>
                  {BRANCH_LABELS[b.branch]}
                </td>
                <td className={`py-2 px-3 text-center font-mono text-sm font-semibold ${textClass}`}>
                  {formatFogRange(b.unitCountRange)}
                </td>
                <td className={`py-2 px-3 text-center font-mono text-sm font-semibold ${textClass}`}>
                  {formatFogRange(b.personnelRange)}
                </td>
                <td className={`py-2 px-3 text-center text-sm ${mutedClass}`}>
                  {b.techLevel ?? "—"}
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={4} className={`py-4 text-center text-sm ${mutedClass}`}>
                  Aucune donnée disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
  if (backgroundImage) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/25" style={{ background: "transparent" }}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat scale-105"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundPosition: "top center",
              filter: "blur(0.5px)",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
        </div>
        <div className="relative z-10 p-6">{content}</div>
      </section>
    );
  }
  return (
    <section className={panelClass} style={panelStyle}>
      {content}
    </section>
  );
}

function FoggedUnitView({
  units,
  panelClass,
  panelStyle,
  textClass = "text-[var(--foreground)]",
  mutedClass = "text-[var(--foreground-muted)]",
  backgroundImage,
}: {
  units: FoggedUnitEstimate[];
  panelClass: string;
  panelStyle: React.CSSProperties;
  textClass?: string;
  mutedClass?: string;
  backgroundImage?: string;
}) {
  const byBranch = new Map<MilitaryBranch, FoggedUnitEstimate[]>();
  for (const u of units) {
    if (!byBranch.has(u.branch)) byBranch.set(u.branch, []);
    byBranch.get(u.branch)!.push(u);
  }

  const renderSection = (branch: MilitaryBranch, branchUnits: FoggedUnitEstimate[]) => (
    <>
      <h2 className={`mb-3 text-xl font-semibold ${textClass}`}>
        {BRANCH_LABELS[branch]}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-white/25" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-white/25">
              <th className={`w-12 pb-1.5 pt-1 px-2 text-center font-medium text-sm ${mutedClass}`}>Icône</th>
              <th className={`w-[22%] pb-1.5 pt-1 px-2 text-center font-medium text-sm ${mutedClass}`}>Nom</th>
              <th className={`w-[20%] pb-1.5 pt-1 px-2 text-center font-medium text-sm ${mutedClass}`}>Nombre (est.)</th>
              <th className={`w-[20%] pb-1.5 pt-1 px-2 text-center font-medium text-sm ${mutedClass}`}>Personnel (est.)</th>
              <th className={`pb-1.5 pt-1 px-2 text-center font-medium text-sm ${mutedClass}`}>Niv. tech.</th>
            </tr>
          </thead>
          <tbody>
            {branchUnits.map((u) => (
              <tr key={u.unitId} className="border-b border-white/25">
                <td className="w-12 py-0.5 px-2 align-middle text-center">
                  <div className="inline-block h-9 w-9 overflow-hidden rounded border border-white/25 bg-white/10">
                    {u.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.iconUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className={`flex h-full w-full items-center justify-center text-[8px] ${mutedClass}`}>—</div>
                    )}
                  </div>
                </td>
                <td className="py-0.5 px-2 align-middle text-center">
                  <span className={`inline-block max-w-full truncate text-sm font-medium ${textClass}`} title={u.unitName}>
                    {u.unitName}
                  </span>
                </td>
                <td className={`py-0.5 px-2 align-middle text-center font-mono text-sm font-semibold ${textClass}`}>
                  {formatFogRange(u.countRange)}
                </td>
                <td className={`py-0.5 px-2 align-middle text-center font-mono text-sm font-semibold ${textClass}`}>
                  {formatFogRange(u.personnelRange)}
                </td>
                <td className={`py-0.5 px-2 align-middle text-center text-sm ${mutedClass}`}>
                  {u.techLevel ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const sectionWrapper = (key: string, children: React.ReactNode) => {
    if (backgroundImage) {
      return (
        <section key={key} className="relative overflow-hidden rounded-2xl border border-white/25" style={{ background: "transparent" }}>
          <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
            <div
              className="absolute inset-0 bg-cover bg-no-repeat scale-105"
              style={{
                backgroundImage: `url(${backgroundImage})`,
                backgroundPosition: "top center",
                filter: "blur(0.5px)",
              }}
            />
            <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
          </div>
          <div className="relative z-10 p-6">{children}</div>
        </section>
      );
    }
    return (
      <section key={key} className={panelClass} style={panelStyle}>
        {children}
      </section>
    );
  };

  return (
    <>
      {(["terre", "air", "mer", "strategique"] as const).map((branch) => {
        const branchUnits = byBranch.get(branch) ?? [];
        if (branchUnits.length === 0) return null;
        return sectionWrapper(branch, renderSection(branch, branchUnits));
      })}
    </>
  );
}
