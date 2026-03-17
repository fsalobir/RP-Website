"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { revalidateCountryPageGlobals, computeMapRegionNeighbors, getVoisinagesByCountry, type VoisinageEntry } from "@/app/admin/regles/actions";
import type { RuleParameter } from "@/types/database";
import {
  getRuleLabel,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  BUDGET_EFFECT_TYPES,
  BUDGET_EFFECT_TYPE_LABELS,
  getEffectsListForMinistry,
  type BudgetMinistryValue,
  type BudgetMinistryEffectDef,
} from "@/lib/ruleParameters";
import { DEFAULT_IDEOLOGY_CONFIG, getIdeologyConfig as parseIdeologyConfig, IDEOLOGY_IDS, IDEOLOGY_LABELS, type IdeologyConfig } from "@/lib/ideology";
import { MOIS_LABELS } from "@/lib/worldDate";
import {
  getEffectKindOptionGroups,
  ALL_EFFECT_KIND_IDS,
  EFFECT_KINDS_WITH_COUNTRY_TARGET,
  EFFECT_KIND_LABELS,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_NO_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
  EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
  EFFECT_KINDS_WITH_SUB_TYPE_TARGET,
  STAT_KEYS,
  STAT_LABELS,
  MILITARY_BRANCH_EFFECT_IDS,
  MILITARY_BRANCH_EFFECT_LABELS,
  SUB_TYPE_TARGET_SEP,
  formatSubTypeTargetLabel,
  getBudgetMinistryOptions,
  getEffectKindValueHelper,
  formatEffectValue,
} from "@/lib/countryEffects";
import { LAW_DEFINITIONS, type LawDefinition } from "@/lib/laws";
import { MatriceDiplomatiqueForm } from "@/app/admin/matrice-diplomatique/MatriceDiplomatiqueForm";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

function RecalculerVoisinagesButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [voisinagesOpen, setVoisinagesOpen] = useState(false);
  const [voisinagesData, setVoisinagesData] = useState<VoisinageEntry[] | null>(null);
  const [voisinagesLoading, setVoisinagesLoading] = useState(false);
  const [voisinagesError, setVoisinagesError] = useState<string | null>(null);

  async function handleRecalcul() {
    setLoading(true);
    setMessage(null);
    const result = await computeMapRegionNeighbors();
    setLoading(false);
    if (result.error) setMessage(result.error);
    else setMessage("Voisinages recalculés.");
  }

  async function handleVoirVoisinages() {
    setVoisinagesOpen(true);
    setVoisinagesData(null);
    setVoisinagesError(null);
    setVoisinagesLoading(true);
    const result = await getVoisinagesByCountry();
    setVoisinagesLoading(false);
    if (result.error) setVoisinagesError(result.error);
    else setVoisinagesData(result.data ?? []);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleRecalcul}
        disabled={loading}
        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        {loading ? "Calcul…" : "Recalculer les voisinages"}
      </button>
      <button
        type="button"
        onClick={handleVoirVoisinages}
        disabled={voisinagesLoading}
        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        {voisinagesLoading ? "Chargement…" : "Voir les voisinages"}
      </button>
      {message && (
        <span className={`text-xs ${message.startsWith("Voisinages") ? "text-[var(--accent)]" : "text-red-500"}`}>
          {message}
        </span>
      )}
      {voisinagesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setVoisinagesOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="voisinages-title"
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg border shadow-lg"
            style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <h3 id="voisinages-title" className="text-sm font-semibold text-[var(--foreground)]">
                Voisinages par pays (debug)
              </h3>
              <button
                type="button"
                onClick={() => setVoisinagesOpen(false)}
                className="rounded p-1 text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {voisinagesError && (
                <p className="text-sm text-red-500">{voisinagesError}</p>
              )}
              {voisinagesData && voisinagesData.length === 0 && (
                <p className="text-sm text-[var(--foreground-muted)]">
                  Aucun pays avec région assignée, ou table map_region_neighbors vide. Recalculez les voisinages après avoir assigné des régions aux pays.
                </p>
              )}
              {voisinagesData && voisinagesData.length > 0 && (
                <ul className="space-y-3">
                  {voisinagesData.map((entry) => (
                    <li
                      key={entry.country_id}
                      className="rounded border py-2 px-3"
                      style={{ borderColor: "var(--border-muted)" }}
                    >
                      <span className="text-sm font-medium text-[var(--foreground)]">{entry.country_name}</span>
                      <span className="ml-1 text-xs text-[var(--foreground-muted)]">
                        ({entry.neighbors.length} voisin{entry.neighbors.length !== 1 ? "s" : ""})
                      </span>
                      {entry.neighbors.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          {entry.neighbors.map((n) => n.name).join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-[var(--foreground-muted)]">Aucun voisin (région sans limite commune)</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipBody({
  text,
  points,
  warning,
}: {
  text: React.ReactNode;
  points?: React.ReactNode[];
  warning?: string;
}) {
  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <div>{text}</div>
      {points && points.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4">
          {points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      ) : null}
      {warning ? <div className="font-medium text-[var(--danger)]">⚠️ {warning}</div> : null}
    </div>
  );
}

function TitleWithInfo({
  title,
  tooltip,
  warning,
  side = "top",
  className,
}: {
  title: React.ReactNode;
  tooltip?: React.ReactNode;
  warning?: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={className ?? "inline-flex items-center gap-2"}>
      <span>{title}</span>
      {tooltip ? <InfoTooltip side={side} warning={Boolean(warning)} content={<TooltipBody text={tooltip} warning={warning} />} /> : null}
    </span>
  );
}

function FormLabel({
  label,
  tooltip,
  warning,
  className = "text-xs text-[var(--foreground-muted)]",
  side = "top",
}: {
  label: React.ReactNode;
  tooltip?: React.ReactNode;
  warning?: string;
  className?: string;
  side?: "top" | "bottom";
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      {tooltip ? <InfoTooltip side={side} warning={Boolean(warning)} content={<TooltipBody text={tooltip} warning={warning} />} /> : null}
    </span>
  );
}

function CollapsibleBlock({
  title,
  infoContent,
  infoWarning,
  open,
  onToggle,
  children,
  variant = "default",
}: {
  title: string;
  infoContent?: React.ReactNode;
  infoWarning?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "default" | "section";
}) {
  const isSection = variant === "section";
  return (
    <div
      className={isSection ? "rounded-lg border-2" : "border-b"}
      style={{
        borderColor: isSection ? "var(--border)" : "var(--border-muted)",
        background: isSection ? "var(--background-panel)" : undefined,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 text-left transition-colors hover:opacity-90 ${isSection ? "px-5 py-4" : "px-4 py-2.5"}`}
        style={{ background: isSection ? "var(--background-elevated)" : "var(--background-elevated)" }}
      >
        <span
          className={`${isSection ? "text-base font-semibold" : "text-sm font-medium"} text-[var(--foreground)] inline-flex items-center gap-2`}
        >
          {title}
          {infoContent ? <InfoTooltip side="bottom" warning={infoWarning} content={infoContent} /> : null}
        </span>
        <span
          className="block shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          <svg width={isSection ? 20 : 16} height={isSection ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={isSection ? "border-t py-1" : "divide-y"}
            style={{ borderColor: "var(--border-muted)" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

type GlobalGrowthEffectEntry = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
};

type CountryForMatrice = { id: string; name: string; slug: string };

type AiEventsConfigValue = {
  interval_hours?: number;
  count_major_per_run?: number;
  count_minor_per_run?: number;
  allowed_action_type_keys_major?: string[];
  allowed_action_type_keys_minor?: string[];
  target_major_ai?: boolean;
  target_minor_ai?: boolean;
  target_players?: boolean;
  distance_modes?: string[];
  auto_accept_by_action_type?: Record<string, boolean>;
  trigger_amplitude_minutes?: number;
};

export function ReglesForm({
  rules,
  rosterUnits = [],
  countries: countriesForMatrice,
  relationMap: relationMapForMatrice,
  stateActionTypesForAi = [],
}: {
  rules: RuleParameter[];
  rosterUnits?: { id: string; name_fr: string; branch?: string; sub_type?: string | null }[];
  countries?: CountryForMatrice[];
  relationMap?: Record<string, number>;
  stateActionTypesForAi?: { id: string; key: string; label_fr: string }[];
}) {
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleValueError, setRuleValueError] = useState<string | null>(null);
  const [globalGrowthOpen, setGlobalGrowthOpen] = useState(false);
  const [globalEffectFormOpen, setGlobalEffectFormOpen] = useState(false);
  const [globalEffectEditIndex, setGlobalEffectEditIndex] = useState<number | null>(null);
  const [globalEffectKind, setGlobalEffectKind] = useState<string>("gdp_growth_base");
  const [globalEffectTarget, setGlobalEffectTarget] = useState<string | null>(null);
  const [globalEffectValue, setGlobalEffectValue] = useState<string>("");
  const [ideologyEffectFormOpen, setIdeologyEffectFormOpen] = useState(false);
  const [ideologyEffectFormIdeologyId, setIdeologyEffectFormIdeologyId] = useState<string>(IDEOLOGY_IDS[0]);
  const [ideologyEffectKind, setIdeologyEffectKind] = useState<string>("gdp_growth_base");
  const [ideologyEffectTarget, setIdeologyEffectTarget] = useState<string | null>(null);
  const [ideologyEffectValue, setIdeologyEffectValue] = useState<string>("");
  const [ideologyEffectEditLocalIndex, setIdeologyEffectEditLocalIndex] = useState<number | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetMinistryOpen, setBudgetMinistryOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BUDGET_MINISTRY_KEYS.map((k) => [k, false]))
  );
  const [simulatorMinistry, setSimulatorMinistry] = useState<string>(BUDGET_MINISTRY_KEYS[0]);
  const [simulatorBase, setSimulatorBase] = useState<string>("5");
  const [simulatorWorldAvg, setSimulatorWorldAvg] = useState<string>("5");
  const [simulatorAllocationPct, setSimulatorAllocationPct] = useState<number>(10);
  const [lawSectionsOpen, setLawSectionsOpen] = useState<Record<string, boolean>>({});
  const [worldDateOpen, setWorldDateOpen] = useState(false);
  const [influenceOpen, setInfluenceOpen] = useState(false);
  const [sphereOpen, setSphereOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [matriceOpen, setMatriceOpen] = useState(false);
  const [diplomatieOpen, setDiplomatieOpen] = useState(false);
  const [effetsGlobauxOpen, setEffetsGlobauxOpen] = useState(false);
  const [loisOpen, setLoisOpen] = useState(false);
  const [ideologyOpen, setIdeologyOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMajorFormOpen, setAiMajorFormOpen] = useState(false);
  const [aiMajorEditIndex, setAiMajorEditIndex] = useState<number | null>(null);
  const [aiMajorEffectKind, setAiMajorEffectKind] = useState<string>("gdp_growth_base");
  const [aiMajorEffectTarget, setAiMajorEffectTarget] = useState<string | null>(null);
  const [aiMajorEffectValue, setAiMajorEffectValue] = useState<string>("");
  const [aiMinorFormOpen, setAiMinorFormOpen] = useState(false);
  const [aiMinorEditIndex, setAiMinorEditIndex] = useState<number | null>(null);
  const [aiMinorEffectKind, setAiMinorEffectKind] = useState<string>("gdp_growth_base");
  const [aiMinorEffectTarget, setAiMinorEffectTarget] = useState<string | null>(null);
  const [aiMinorEffectValue, setAiMinorEffectValue] = useState<string>("");
  const [intelOpen, setIntelOpen] = useState(false);
  const [etatMajorOpen, setEtatMajorOpen] = useState(false);

  const supabase = createClient();

  const updateValue = (id: string, value: unknown) => {
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, value } : r))
    );
  };

  async function saveAll() {
    if (items.length === 0) return;
    setError(null);
    if (ruleValueError) {
      setError("Impossible d'enregistrer : une ou plusieurs valeurs sont invalides (JSON). Corrigez-les puis réessayez.");
      return;
    }
    setSaving(true);
    try {
      let hadError = false;
      for (const row of items) {
        const { error: err } = await supabase
          .from("rule_parameters")
          .update({ value: row.value })
          .eq("id", row.id);
        if (err) {
          setError(err.message);
          hadError = true;
          break;
        }
      }
      if (!hadError) {
        try {
          await revalidateCountryPageGlobals();
        } catch (revalidateErr) {
          console.warn("Revalidation du cache échouée (données tout de même enregistrées):", revalidateErr);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isNetworkError = /failed to fetch|network|load failed/i.test(message);
      setError(
        isNetworkError
          ? "Erreur réseau ou serveur injoignable. Vérifiez votre connexion, que le serveur tourne et que Supabase est accessible."
          : message || "Erreur lors de l'enregistrement."
      );
    } finally {
      setSaving(false);
    }
  }

  const rulesByKey = useMemo(() => new Map(items.map((r) => [r.key, r])), [items]);

  /** Options (branch:sub_type) pour les effets « modificateur par sous-branche/type », triées par branche puis sous-type. */
  const subTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    const units = rosterUnits ?? [];
    for (const u of units) {
      const branch = u.branch ?? "terre";
      const subType = u.sub_type ?? null;
      const value = `${branch}${SUB_TYPE_TARGET_SEP}${subType ?? ""}`;
      if (seen.has(value)) continue;
      seen.add(value);
      list.push({ value, label: formatSubTypeTargetLabel(branch, subType) });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [rosterUnits]);

  const mobilisationConfigKey = "mobilisation_config";
  const mobilisationEffectsKey = "mobilisation_level_effects";
  const globalGrowthEffectsKey = "global_growth_effects";
  const aiMajorEffectsKey = "ai_major_effects";
  const aiMinorEffectsKey = "ai_minor_effects";
  const worldDateKey = "world_date";
  const worldDateAdvanceKey = "world_date_advance_months";
  const influenceConfigKey = "influence_config";
  const sphereInfluencePctKey = "sphere_influence_pct";
  const statsDiceModifierRangesKey = "stats_dice_modifier_ranges";
  const ideologyConfigKey = "ideology_config";
  const ideologyEffectsKey = "ideology_effects";
  const intelConfigKey = "intel_config";

  const globalGrowthEffectsRule = useMemo(() => items.find((r) => r.key === globalGrowthEffectsKey), [items]);
  const worldDateRule = useMemo(() => items.find((r) => r.key === worldDateKey), [items]);
  const worldDateAdvanceRule = useMemo(() => items.find((r) => r.key === worldDateAdvanceKey), [items]);
  const cronPausedRule = useMemo(() => items.find((r) => r.key === "cron_paused"), [items]);
  const influenceConfigRule = useMemo(() => items.find((r) => r.key === influenceConfigKey), [items]);
  const sphereInfluencePctRule = useMemo(() => items.find((r) => r.key === sphereInfluencePctKey), [items]);
  const ideologyConfigRule = useMemo(() => items.find((r) => r.key === ideologyConfigKey), [items]);
  const ideologyEffectsRule = useMemo(() => items.find((r) => r.key === ideologyEffectsKey), [items]);

  type SphereInfluencePctValue = { contested?: number; occupied?: number; annexed?: number };
  function getSphereInfluencePct(): SphereInfluencePctValue {
    if (sphereInfluencePctRule?.value && typeof sphereInfluencePctRule.value === "object" && sphereInfluencePctRule.value !== null) {
      return sphereInfluencePctRule.value as SphereInfluencePctValue;
    }
    return { contested: 50, occupied: 80, annexed: 100 };
  }
  function updateSphereInfluencePct(patch: Partial<SphereInfluencePctValue>) {
    if (!sphereInfluencePctRule) return;
    updateValue(sphereInfluencePctRule.id, { ...getSphereInfluencePct(), ...patch });
  }

  function getIdeologyConfigValue(): IdeologyConfig {
    return parseIdeologyConfig(ideologyConfigRule?.value);
  }
  function updateIdeologyConfig(patch: Partial<IdeologyConfig>) {
    if (!ideologyConfigRule) return;
    const current = getIdeologyConfigValue();
    updateValue(ideologyConfigRule.id, { ...current, ...patch });
  }

  type IdeologyEffectEntry = { ideology_id: string; effect_kind: string; effect_target: string | null; value: number };
  function getIdeologyEffects(): IdeologyEffectEntry[] {
    if (!ideologyEffectsRule?.value || !Array.isArray(ideologyEffectsRule.value)) return [];
    return (ideologyEffectsRule.value as IdeologyEffectEntry[]).filter(
      (e) =>
        e &&
        typeof e.ideology_id === "string" &&
        typeof e.effect_kind === "string" &&
        typeof e.value === "number"
    );
  }
  function setIdeologyEffects(arr: IdeologyEffectEntry[]) {
    if (!ideologyEffectsRule) return;
    updateValue(ideologyEffectsRule.id, arr);
  }
  function getIdeologyEffectsForIdeology(ideologyId: string): IdeologyEffectEntry[] {
    return getIdeologyEffects().filter((e) => e.ideology_id === ideologyId);
  }
  function addIdeologyEffect(ideologyId: string, entry: IdeologyEffectEntry) {
    setIdeologyEffects([...getIdeologyEffects(), { ...entry, ideology_id: ideologyId }]);
  }
  function updateIdeologyEffectAtIndex(ideologyId: string, localIndex: number, entry: IdeologyEffectEntry) {
    const full = getIdeologyEffects();
    const forId = full.filter((e) => e.ideology_id === ideologyId);
    forId[localIndex] = { ...entry, ideology_id: ideologyId };
    setIdeologyEffects(full.filter((e) => e.ideology_id !== ideologyId).concat(forId));
  }
  function removeIdeologyEffect(ideologyId: string, localIndex: number) {
    const full = getIdeologyEffects();
    const forId = full.filter((e) => e.ideology_id === ideologyId).filter((_, i) => i !== localIndex);
    setIdeologyEffects(full.filter((e) => e.ideology_id !== ideologyId).concat(forId));
  }
  const EFFECT_KINDS_FOR_IDEOLOGY_RULE = useMemo(
    () =>
      ALL_EFFECT_KIND_IDS.filter(
        (k) => !k.startsWith("ideology_drift_") && !k.startsWith("ideology_snap_")
      ),
    []
  );
  const ideologyEffectOptionGroups = useMemo(
    () => getEffectKindOptionGroups(EFFECT_KINDS_FOR_IDEOLOGY_RULE),
    [EFFECT_KINDS_FOR_IDEOLOGY_RULE]
  );
  function getDefaultTargetForKindIdeology(effectKind: string): string | null {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
    if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
    if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
    if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnits[0]?.id ?? null;
    if (EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectKind)) return subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP;
    if (EFFECT_KINDS_WITH_COUNTRY_TARGET.has(effectKind)) return null;
    return null;
  }
  function openAddIdeologyEffect(ideologyId: string) {
    const firstGroup = ideologyEffectOptionGroups[0];
    const firstKind = firstGroup?.options[0]?.id ?? EFFECT_KINDS_FOR_IDEOLOGY_RULE[0];
    setIdeologyEffectFormIdeologyId(ideologyId);
    setIdeologyEffectKind(firstKind);
    setIdeologyEffectTarget(getDefaultTargetForKindIdeology(firstKind));
    setIdeologyEffectValue("");
    setIdeologyEffectEditLocalIndex(null);
    setIdeologyEffectFormOpen(true);
  }
  function openEditIdeologyEffect(ideologyId: string, localIndex: number) {
    const list = getIdeologyEffectsForIdeology(ideologyId);
    const e = list[localIndex];
    if (!e) return;
    const helper = getEffectKindValueHelper(e.effect_kind);
    setIdeologyEffectFormIdeologyId(ideologyId);
    setIdeologyEffectKind(e.effect_kind);
    setIdeologyEffectTarget(e.effect_target);
    setIdeologyEffectValue(String(helper.storedToDisplay(Number(e.value))));
    setIdeologyEffectEditLocalIndex(localIndex);
    setIdeologyEffectFormOpen(true);
  }
  function saveIdeologyEffectForm() {
    const valueNum = Number(ideologyEffectValue);
    if (Number.isNaN(valueNum)) return;
    const helper = getEffectKindValueHelper(ideologyEffectKind);
    const valueStored = helper.displayToStored(valueNum);
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(ideologyEffectKind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(ideologyEffectKind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(ideologyEffectKind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(ideologyEffectKind);
    const entry: IdeologyEffectEntry = {
      ideology_id: ideologyEffectFormIdeologyId,
      effect_kind: ideologyEffectKind,
      effect_target: needsTarget ? ideologyEffectTarget : null,
      value: valueStored,
    };
    if (ideologyEffectEditLocalIndex !== null) {
      updateIdeologyEffectAtIndex(ideologyEffectFormIdeologyId, ideologyEffectEditLocalIndex, entry);
    } else {
      addIdeologyEffect(ideologyEffectFormIdeologyId, entry);
    }
    setIdeologyEffectFormOpen(false);
  }
  function labelForIdeologyEffect(e: IdeologyEffectEntry): string {
    const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
    let targetLabel: string | null = null;
    if (e.effect_target) {
      if (EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind))
        targetLabel = STAT_LABELS[e.effect_target as keyof typeof STAT_LABELS] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind))
        targetLabel = BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind))
        targetLabel = MILITARY_BRANCH_EFFECT_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(e.effect_kind))
        targetLabel = rosterUnits.find((u) => u.id === e.effect_target)?.name_fr ?? e.effect_target;
      else targetLabel = e.effect_target;
    }
    const valueStr = formatEffectValue(e.effect_kind, e.value);
    return targetLabel ? `${kindLabel} — ${targetLabel} : ${valueStr}` : `${kindLabel} : ${valueStr}`;
  }

  const intelConfigRule = useMemo(() => items.find((r) => r.key === intelConfigKey), [items]);
  type IntelConfigValue = {
    decay_flat_per_day?: number;
    decay_pct_per_day?: number;
    decay_mode?: "flat" | "pct" | "both";
    espionage_intel_gain_base?: number;
  };
  function getIntelConfig(): IntelConfigValue {
    if (!intelConfigRule?.value || typeof intelConfigRule.value !== "object") {
      return { decay_flat_per_day: 2, decay_pct_per_day: 5, decay_mode: "flat", espionage_intel_gain_base: 50 };
    }
    return intelConfigRule.value as IntelConfigValue;
  }
  function updateIntelConfig(patch: Partial<IntelConfigValue>) {
    if (!intelConfigRule) return;
    updateValue(intelConfigRule.id, { ...getIntelConfig(), ...patch });
  }

  type InfluenceConfigValue = {
    mult_gdp?: number;
    mult_population?: number;
    mult_military?: number;
    stability_modifier_min?: number;
    stability_modifier_max?: number;
    gravity_pct_gdp?: number;
    gravity_pct_population?: number;
    gravity_pct_military?: number;
  };
  function getInfluenceConfig(): InfluenceConfigValue {
    if (!influenceConfigRule?.value || typeof influenceConfigRule.value !== "object") {
      return { mult_gdp: 1e-9, mult_population: 1e-7, mult_military: 0.01, stability_modifier_min: 0, stability_modifier_max: 1, gravity_pct_gdp: 50, gravity_pct_population: 50, gravity_pct_military: 50 };
    }
    return influenceConfigRule.value as InfluenceConfigValue;
  }
  function updateInfluenceConfig(patch: Partial<InfluenceConfigValue>) {
    if (!influenceConfigRule) return;
    updateValue(influenceConfigRule.id, { ...getInfluenceConfig(), ...patch });
  }

  function getGlobalGrowthEffects(): GlobalGrowthEffectEntry[] {
    if (!globalGrowthEffectsRule?.value || !Array.isArray(globalGrowthEffectsRule.value)) return [];
    return (globalGrowthEffectsRule.value as GlobalGrowthEffectEntry[]).filter(
      (e) => e && typeof e.effect_kind === "string" && typeof e.value === "number"
    );
  }
  function setGlobalGrowthEffects(arr: GlobalGrowthEffectEntry[]) {
    if (!globalGrowthEffectsRule) return;
    updateValue(globalGrowthEffectsRule.id, arr);
  }
  function addGlobalEffect(entry: GlobalGrowthEffectEntry) {
    setGlobalGrowthEffects([...getGlobalGrowthEffects(), entry]);
  }
  function updateGlobalEffectAtIndex(index: number, entry: GlobalGrowthEffectEntry) {
    const arr = getGlobalGrowthEffects();
    const next = arr.map((e, i) => (i === index ? entry : e));
    setGlobalGrowthEffects(next);
  }
  function removeGlobalEffect(index: number) {
    setGlobalGrowthEffects(getGlobalGrowthEffects().filter((_, i) => i !== index));
  }
  function getDefaultTargetForKindGlobal(effectKind: string): string | null {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
    if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
    if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
    if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnits[0]?.id ?? null;
    if (EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectKind)) return subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP;
    if (EFFECT_KINDS_WITH_COUNTRY_TARGET.has(effectKind)) return null;
    return null;
  }
  function openAddGlobalEffect() {
    const firstGroup = getEffectKindOptionGroups()[0];
    const firstKind = firstGroup?.options[0]?.id ?? ALL_EFFECT_KIND_IDS[0];
    setGlobalEffectKind(firstKind);
    setGlobalEffectTarget(getDefaultTargetForKindGlobal(firstKind));
    setGlobalEffectValue("");
    setGlobalEffectEditIndex(null);
    setGlobalEffectFormOpen(true);
  }
  function openEditGlobalEffect(index: number) {
    const arr = getGlobalGrowthEffects();
    const e = arr[index];
    if (!e) return;
    const helper = getEffectKindValueHelper(e.effect_kind);
    setGlobalEffectKind(e.effect_kind);
    setGlobalEffectTarget(e.effect_target);
    setGlobalEffectValue(String(helper.storedToDisplay(Number(e.value))));
    setGlobalEffectEditIndex(index);
    setGlobalEffectFormOpen(true);
  }
  function saveGlobalEffectForm() {
    const valueNum = Number(globalEffectValue);
    if (Number.isNaN(valueNum)) return;
    const helper = getEffectKindValueHelper(globalEffectKind);
    const valueStored = helper.displayToStored(valueNum);
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(globalEffectKind);
    const entry: GlobalGrowthEffectEntry = {
      effect_kind: globalEffectKind,
      effect_target: needsTarget ? globalEffectTarget : null,
      value: valueStored,
    };
    if (globalEffectEditIndex !== null) {
      updateGlobalEffectAtIndex(globalEffectEditIndex, entry);
    } else {
      addGlobalEffect(entry);
    }
    setGlobalEffectFormOpen(false);
  }
  function labelForGlobalEffect(e: GlobalGrowthEffectEntry): string {
    const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
    let targetLabel: string | null = null;
    if (e.effect_target) {
      if (EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind))
        targetLabel = STAT_LABELS[e.effect_target as keyof typeof STAT_LABELS] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind))
        targetLabel = BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind))
        targetLabel = MILITARY_BRANCH_EFFECT_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(e.effect_kind))
        targetLabel = rosterUnits.find((u) => u.id === e.effect_target)?.name_fr ?? e.effect_target;
      else targetLabel = e.effect_target;
    }
    const valueStr = formatEffectValue(e.effect_kind, e.value);
    return targetLabel ? `${kindLabel} — ${targetLabel} : ${valueStr}` : `${kindLabel} : ${valueStr}`;
  }

  const aiMajorEffectsRule = useMemo(() => items.find((r) => r.key === aiMajorEffectsKey), [items]);
  const aiMinorEffectsRule = useMemo(() => items.find((r) => r.key === aiMinorEffectsKey), [items]);
  const aiEventsConfigKey = "ai_events_config";
  const aiEventsConfigRule = useMemo(() => items.find((r) => r.key === aiEventsConfigKey), [items]);
  function getAiEventsConfig(): AiEventsConfigValue {
    if (!aiEventsConfigRule?.value || typeof aiEventsConfigRule.value !== "object") {
      return {
        interval_hours: 1,
        count_major_per_run: 0,
        count_minor_per_run: 0,
        allowed_action_type_keys_major: [],
        allowed_action_type_keys_minor: [],
        target_major_ai: false,
        target_minor_ai: false,
        target_players: false,
        distance_modes: ["world"],
        auto_accept_by_action_type: {},
        trigger_amplitude_minutes: 0,
      };
    }
    return aiEventsConfigRule.value as AiEventsConfigValue;
  }
  function updateAiEventsConfig(patch: Partial<AiEventsConfigValue>) {
    if (!aiEventsConfigRule) return;
    updateValue(aiEventsConfigRule.id, { ...getAiEventsConfig(), ...patch });
  }
  function toggleAllowedActionKey(which: "major" | "minor", key: string) {
    const cfg = getAiEventsConfig();
    const arr = which === "major" ? [...(cfg.allowed_action_type_keys_major ?? [])] : [...(cfg.allowed_action_type_keys_minor ?? [])];
    const idx = arr.indexOf(key);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(key);
    if (which === "major") updateAiEventsConfig({ allowed_action_type_keys_major: arr });
    else updateAiEventsConfig({ allowed_action_type_keys_minor: arr });
  }
  function toggleDistanceMode(mode: string) {
    const cfg = getAiEventsConfig();
    const modes = [...(cfg.distance_modes ?? [])];
    const idx = modes.indexOf(mode);
    if (idx >= 0) modes.splice(idx, 1);
    else modes.push(mode);
    if (modes.length === 0) modes.push("world");
    updateAiEventsConfig({ distance_modes: modes });
  }
  function toggleAutoAccept(key: string) {
    const cfg = getAiEventsConfig();
    const auto = { ...(cfg.auto_accept_by_action_type ?? {}) };
    auto[key] = !auto[key];
    updateAiEventsConfig({ auto_accept_by_action_type: auto });
  }
  function getAiEffects(rule: RuleParameter | undefined): GlobalGrowthEffectEntry[] {
    if (!rule?.value || !Array.isArray(rule.value)) return [];
    return (rule.value as GlobalGrowthEffectEntry[]).filter(
      (e) => e && typeof e.effect_kind === "string" && typeof e.value === "number"
    );
  }
  function setAiEffects(rule: RuleParameter | undefined, arr: GlobalGrowthEffectEntry[]) {
    if (!rule) return;
    updateValue(rule.id, arr);
  }
  function openAddAiEffect(which: "major" | "minor") {
    const firstGroup = getEffectKindOptionGroups()[0];
    const firstKind = firstGroup?.options[0]?.id ?? ALL_EFFECT_KIND_IDS[0];
    const defTarget = getDefaultTargetForKindGlobal(firstKind);
    if (which === "major") {
      setAiMajorEffectKind(firstKind);
      setAiMajorEffectTarget(defTarget);
      setAiMajorEffectValue("");
      setAiMajorEditIndex(null);
      setAiMajorFormOpen(true);
    } else {
      setAiMinorEffectKind(firstKind);
      setAiMinorEffectTarget(defTarget);
      setAiMinorEffectValue("");
      setAiMinorEditIndex(null);
      setAiMinorFormOpen(true);
    }
  }
  function openEditAiEffect(which: "major" | "minor", index: number) {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    const arr = getAiEffects(rule);
    const e = arr[index];
    if (!e) return;
    const helper = getEffectKindValueHelper(e.effect_kind);
    if (which === "major") {
      setAiMajorEffectKind(e.effect_kind);
      setAiMajorEffectTarget(e.effect_target);
      setAiMajorEffectValue(String(helper.storedToDisplay(Number(e.value))));
      setAiMajorEditIndex(index);
      setAiMajorFormOpen(true);
    } else {
      setAiMinorEffectKind(e.effect_kind);
      setAiMinorEffectTarget(e.effect_target);
      setAiMinorEffectValue(String(helper.storedToDisplay(Number(e.value))));
      setAiMinorEditIndex(index);
      setAiMinorFormOpen(true);
    }
  }
  function saveAiEffectForm(which: "major" | "minor") {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    if (!rule) return;
    const kind = which === "major" ? aiMajorEffectKind : aiMinorEffectKind;
    const target = which === "major" ? aiMajorEffectTarget : aiMinorEffectTarget;
    const valueStr = which === "major" ? aiMajorEffectValue : aiMinorEffectValue;
    const valueNum = Number(valueStr);
    if (Number.isNaN(valueNum)) return;
    const helper = getEffectKindValueHelper(kind);
    const valueStored = helper.displayToStored(valueNum);
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(kind);
    const entry: GlobalGrowthEffectEntry = {
      effect_kind: kind,
      effect_target: needsTarget ? target : null,
      value: valueStored,
    };
    const arr = getAiEffects(rule);
    const editIndex = which === "major" ? aiMajorEditIndex : aiMinorEditIndex;
    if (editIndex !== null) {
      const next = arr.map((elem, i) => (i === editIndex ? entry : elem));
      setAiEffects(rule, next);
    } else {
      setAiEffects(rule, [...arr, entry]);
    }
    if (which === "major") {
      setAiMajorFormOpen(false);
    } else {
      setAiMinorFormOpen(false);
    }
  }
  function removeAiEffect(which: "major" | "minor", index: number) {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    if (!rule) return;
    setAiEffects(rule, getAiEffects(rule).filter((_, i) => i !== index));
  }

  const mobilisationConfigRule = useMemo(() => items.find((r) => r.key === "mobilisation_config"), [items]);
  const mobilisationEffectsRule = useMemo(() => items.find((r) => r.key === "mobilisation_level_effects"), [items]);
  const statsDiceModifierRangesRule = useMemo(() => items.find((r) => r.key === statsDiceModifierRangesKey), [items]);

  type StatsDiceModifierRangesValue = Record<string, { min: number; max: number }>;
  function getStatsDiceModifierRanges(): StatsDiceModifierRangesValue {
    if (!statsDiceModifierRangesRule?.value || typeof statsDiceModifierRangesRule.value !== "object") {
      return {
        militarism: { min: -10, max: 20 },
        industry: { min: -10, max: 20 },
        science: { min: -10, max: 20 },
        stability: { min: -10, max: 20 },
      };
    }
    return statsDiceModifierRangesRule.value as StatsDiceModifierRangesValue;
  }
  function updateStatsDiceModifierRanges(statKey: string, field: "min" | "max", value: number) {
    if (!statsDiceModifierRangesRule) return;
    const current = getStatsDiceModifierRanges();
    const stat = current[statKey] ?? { min: -10, max: 20 };
    updateValue(statsDiceModifierRangesRule.id, {
      ...current,
      [statKey]: { ...stat, [field]: value },
    });
  }

  type LawConfigValue = { level_thresholds?: Record<string, number>; daily_step?: number };
  type LawLevelEffect = { level: string; effect_kind: string; effect_target: string | null; value: number };

  function getLawConfigRule(def: LawDefinition) { return items.find((r) => r.key === def.configRuleKey); }
  function getLawEffectsRule(def: LawDefinition) { return items.find((r) => r.key === def.effectsRuleKey); }
  function getLawConfig(def: LawDefinition): LawConfigValue {
    const rule = getLawConfigRule(def);
    if (rule?.value && typeof rule.value === "object" && rule.value !== null) {
      return rule.value as LawConfigValue;
    }
    const defaultThresholds: Record<string, number> = {};
    def.levels.forEach((l, i) => { defaultThresholds[l.key] = i * 100; });
    return { level_thresholds: defaultThresholds, daily_step: 20 };
  }
  function updateLawConfig(def: LawDefinition, updates: Partial<LawConfigValue>) {
    const rule = getLawConfigRule(def);
    if (!rule) return;
    const current = getLawConfig(def);
    updateValue(rule.id, { ...current, ...updates });
  }
  function updateLawThreshold(def: LawDefinition, levelKey: string, value: number) {
    const current = getLawConfig(def);
    const level_thresholds = { ...(current.level_thresholds ?? {}), [levelKey]: value };
    updateLawConfig(def, { level_thresholds });
  }
  function getLawLevelEffects(def: LawDefinition): LawLevelEffect[] {
    const rule = getLawEffectsRule(def);
    if (rule?.value && Array.isArray(rule.value)) return rule.value as LawLevelEffect[];
    return [];
  }
  function setLawLevelEffects(def: LawDefinition, arr: LawLevelEffect[]) {
    const rule = getLawEffectsRule(def);
    if (!rule) return;
    updateValue(rule.id, arr);
  }
  function getLawEffectsForLevel(def: LawDefinition, levelKey: string) {
    const all = getLawLevelEffects(def);
    return all.map((e, i) => ({ effect: e, globalIndex: i })).filter(({ effect }) => effect.level === levelKey);
  }
  function getDefaultTargetForKind(effectKind: string): string | null {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
    if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
    if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
    if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnits[0]?.id ?? null;
    if (EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectKind)) return subTypeOptions[0]?.value ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP;
    return null;
  }
  function addLawEffect(def: LawDefinition, level: string) {
    setLawLevelEffects(def, [...getLawLevelEffects(def), { level, effect_kind: "stat_delta", effect_target: "militarism", value: 0 }]);
  }
  function removeLawEffect(def: LawDefinition, index: number) {
    setLawLevelEffects(def, getLawLevelEffects(def).filter((_, i) => i !== index));
  }
  function updateLawEffect(def: LawDefinition, index: number, patch: Partial<LawLevelEffect>) {
    const arr = getLawLevelEffects(def);
    const next = arr.map((e, i) => {
      if (i !== index) return e;
      const merged = { ...e, ...patch };
      if (patch.effect_kind != null && patch.effect_kind !== e.effect_kind) {
        merged.effect_target = getDefaultTargetForKind(patch.effect_kind);
      }
      return merged;
    });
    setLawLevelEffects(def, next);
  }

  function getBudgetValue(r: RuleParameter): BudgetMinistryValue {
    if (typeof r.value === "object" && r.value !== null && !Array.isArray(r.value)) {
      return r.value as BudgetMinistryValue;
    }
    return { min_pct: 5, gravity_pct: 50, bonuses: {}, maluses: {} };
  }

  function updateBudgetField(
    r: RuleParameter,
    field: keyof BudgetMinistryValue,
    subKey: string | null,
    val: number
  ) {
    const current = getBudgetValue(r);
    if (field === "bonuses" && subKey) {
      const bonuses = { ...(current.bonuses ?? {}), [subKey]: val };
      updateValue(r.id, { ...current, bonuses });
    } else if (field === "maluses" && subKey) {
      const maluses = { ...(current.maluses ?? {}), [subKey]: val };
      updateValue(r.id, { ...current, maluses });
    } else {
      updateValue(r.id, { ...current, [field]: val });
    }
  }

  function updateBudgetEffects(r: RuleParameter, effects: BudgetMinistryEffectDef[]) {
    const current = getBudgetValue(r);
    updateValue(r.id, { ...current, effects });
  }

  function addBudgetEffect(r: RuleParameter) {
    const current = getBudgetValue(r);
    const next: BudgetMinistryEffectDef = {
      effect_type: "population",
      bonus: 0,
      malus: -0.05,
      gravity_applies: BUDGET_EFFECT_TYPES.find((t) => t.id === "population")?.defaultGravityApplies ?? false,
    };
    const effects = [...(current.effects ?? []), next];
    updateValue(r.id, { ...current, effects });
  }

  function removeBudgetEffect(r: RuleParameter, index: number) {
    const current = getBudgetValue(r);
    const effects = (current.effects ?? []).filter((_, i) => i !== index);
    updateValue(r.id, { ...current, effects });
  }

  function updateBudgetEffectAt(
    r: RuleParameter,
    index: number,
    patch: Partial<BudgetMinistryEffectDef>
  ) {
    const current = getBudgetValue(r);
    const effects = [...(current.effects ?? [])];
    if (!effects[index]) return;
    effects[index] = { ...effects[index], ...patch };
    updateValue(r.id, { ...current, effects });
  }

  function parseRuleValueAndUpdate(id: string, v: string) {
    let parsed: unknown = v;
    if (new RegExp("^-?\\d+(\\.\\d+)?$").test(v)) parsed = Number(v);
    else if (v.startsWith("{") || v.startsWith("[")) {
      try {
        parsed = JSON.parse(v);
        setRuleValueError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setRuleValueError(
          `JSON invalide. Corrigez la syntaxe (erreur: ${msg}). ` +
            `Si vous souhaitez enregistrer une chaîne, entourez-la de guillemets (ex: "texte").`
        );
        return;
      }
    }
    setRuleValueError(null);
    updateValue(id, parsed);
  }

  const inputClass =
    "w-full rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputClassNarrow =
    "w-full max-w-20 rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };
  const genericEffectTypeTooltip = "Type de mécanique appliquée (croissance, stat, budget, unité, influence, relation ou idéologie).";
  const genericStatTooltip = "Statistique du pays concernée (militarisme, industrie, science, stabilité).";
  const genericBudgetTooltip = "Ministère concerné par l'effet.";
  const genericBranchTooltip = "Branche militaire ciblée (terre, air, mer, stratégique).";
  const genericUnitTooltip = "Unité militaire précise touchée par l'effet.";
  const genericEffectValueTooltip = "Intensité de l'effet. Plus la valeur est élevée, plus l'impact est fort à chaque application.";

  const ruleForMinistry = rulesByKey.get(simulatorMinistry);
  const simulatorParams = ruleForMinistry ? getBudgetValue(ruleForMinistry) : null;
  const baseNum = Number(simulatorBase);
  const worldAvgNum = Number(simulatorWorldAvg);
  const validNums = !Number.isNaN(baseNum) && !Number.isNaN(worldAvgNum) && simulatorParams;
  const catchUpFactor = validNums && worldAvgNum > 0
    ? 1 + ((simulatorParams.gravity_pct ?? 50) / 100) * (worldAvgNum - baseNum) / Math.max(worldAvgNum, 0.01)
    : 1;
  const minPct = simulatorParams?.min_pct ?? 5;
  const effectsResolved = (simulatorParams && getEffectsListForMinistry(simulatorMinistry, simulatorParams)) ?? [];
  const allocationBelowMin = simulatorAllocationPct < minPct;
  const malusScale = allocationBelowMin && minPct > 0
    ? (minPct - simulatorAllocationPct) / minPct
    : 0;
  const bonusScale = !allocationBelowMin && minPct < 100
    ? (simulatorAllocationPct - minPct) / (100 - minPct)
    : 0;
  const bonusesPerDay = effectsResolved.map((eff) => {
    const label = BUDGET_EFFECT_TYPE_LABELS[eff.effect_type] ?? eff.effect_type;
    const malus = malusScale * eff.malus;
    const bonus = !allocationBelowMin ? eff.bonus * bonusScale * catchUpFactor : 0;
    return { label, perDay: bonus, malusPerDay: malus };
  });

  return (
    <div className="space-y-4">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
            Règles de simulation
          </h1>
          <p className="text-[var(--foreground-muted)]">
            Ces paramètres sont utilisés par le cron pour faire évoluer population, PIB, etc.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="shrink-0 rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </div>
      {error && <p className="text-[var(--danger)]">{error}</p>}
      {ruleValueError && <p className="text-[var(--danger)]">{ruleValueError}</p>}
      {!(items.length > 0 || (countriesForMatrice && relationMapForMatrice)) ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre. Ajoutez-en via SQL (table rule_parameters).</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden p-4 flex flex-col gap-4"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          {items.length > 0 && (
            <CollapsibleBlock
              title="Effets Globaux"
              infoContent={<TooltipBody text="Réglages appliqués à tous les pays. Ils définissent le climat général de la simulation." />}
              open={effetsGlobauxOpen}
              onToggle={() => setEffetsGlobauxOpen((o) => !o)}
              variant="section"
            >
              {globalGrowthEffectsRule && (
            <CollapsibleBlock
              title="Global [Appliqué à tous les pays]"
              infoContent={<TooltipBody text="Effets appliqués à tous les pays à chaque passage du monde (croissance, stats, budget, etc.)." />}
              open={globalGrowthOpen}
              onToggle={() => setGlobalGrowthOpen((o) => !o)}
            >
              <div className="p-3 space-y-3">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Effets de croissance PIB et population appliqués à tous les pays à chaque passage du cron.
                </p>
                <ul className="space-y-2">
                  {getGlobalGrowthEffects().map((e, idx) => (
                    <li
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                      style={{ borderColor: "var(--border-muted)" }}
                    >
                      <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditGlobalEffect(idx)}
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGlobalEffect(idx)}
                          className="text-xs text-[var(--danger)] hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {!globalEffectFormOpen ? (
                  <button
                    type="button"
                    onClick={openAddGlobalEffect}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Ajouter un effet
                  </button>
                ) : (
                  <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                        <FormLabel label="Type d'effet" tooltip={genericEffectTypeTooltip} />
                      </label>
                      <select
                        value={globalEffectKind}
                        onChange={(ev) => {
                          const k = ev.target.value;
                          setGlobalEffectKind(k);
                          setGlobalEffectTarget(getDefaultTargetForKindGlobal(k));
                        }}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {getEffectKindOptionGroups().map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    {EFFECT_KINDS_WITH_STAT_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Stat" tooltip={genericStatTooltip} />
                        </label>
                        <select
                          value={globalEffectTarget ?? STAT_KEYS[0]}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {STAT_KEYS.map((k) => (
                            <option key={k} value={k}>{STAT_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_BUDGET_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Ministère" tooltip={genericBudgetTooltip} />
                        </label>
                        <select
                          value={globalEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {getBudgetMinistryOptions().map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_BRANCH_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Branche" tooltip={genericBranchTooltip} />
                        </label>
                        <select
                          value={globalEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                            <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Unité" tooltip={genericUnitTooltip} />
                        </label>
                        <select
                          value={globalEffectTarget ?? rosterUnits[0]?.id ?? ""}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {rosterUnits.map((u) => (
                            <option key={u.id} value={u.id}>{u.name_fr}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Sous-branche/type" tooltip="Branche et sous-type militaire ciblé." />
                        </label>
                        <select
                          value={globalEffectTarget ?? subTypeOptions[0]?.value ?? ""}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {subTypeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                        <FormLabel label={getEffectKindValueHelper(globalEffectKind).valueLabel} tooltip={genericEffectValueTooltip} />
                      </label>
                      <input
                        type="number"
                        step={getEffectKindValueHelper(globalEffectKind).valueStep}
                        value={globalEffectValue}
                        onChange={(e) => setGlobalEffectValue(e.target.value)}
                        className={inputClassNarrow}
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveGlobalEffectForm}
                        className="rounded py-1.5 px-3 text-sm font-medium"
                        style={{ background: "var(--accent)", color: "#0f1419" }}
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalEffectFormOpen(false)}
                        className="rounded border py-1.5 px-3 text-sm"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleBlock>
          )}
              {statsDiceModifierRangesRule && (
                <CollapsibleBlock
                  title="Statistiques"
                  infoContent={<TooltipBody text="Bonus ou malus aux jets (dés) selon les stats du pays, pour les demandes joueurs et les events IA." />}
                  open={statsOpen}
                  onToggle={() => setStatsOpen((o) => !o)}
                >
                  <div className="p-3 space-y-4">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Modificateur min/max pour les jets de dés (ex. -10 à +20). Ces bornes sont utilisées pour calculer le bonus ou malus proportionnel à la valeur de chaque stat du pays.
                    </p>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      {STAT_KEYS.map((statKey) => {
                        const ranges = getStatsDiceModifierRanges()[statKey] ?? { min: -10, max: 20 };
                        return (
                          <div key={statKey} className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                            <div className="text-sm font-medium text-[var(--foreground)] mb-2">{STAT_LABELS[statKey]}</div>
                            <div className="flex flex-wrap gap-2">
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Min" tooltip="Valeur la plus défavorable que cette stat peut donner à un jet quand le pays est très faible sur ce domaine." />
                                </label>
                                <input type="number" value={ranges.min} onChange={(e) => updateStatsDiceModifierRanges(statKey, "min", Number(e.target.value) ?? -10)} className={inputClassNarrow} style={inputStyle} />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Max" tooltip="Valeur la plus favorable que cette stat peut donner à un jet quand le pays excelle sur ce domaine." />
                                </label>
                                <input type="number" value={ranges.max} onChange={(e) => updateStatsDiceModifierRanges(statKey, "max", Number(e.target.value) ?? 20)} className={inputClassNarrow} style={inputStyle} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
              {worldDateRule && worldDateAdvanceRule && (
                <CollapsibleBlock
                  title="Date"
                  infoContent={<TooltipBody text="Date officielle de l'univers et nombre de mois avançant à chaque passage du monde." />}
                  open={worldDateOpen}
                  onToggle={() => setWorldDateOpen((o) => !o)}
                >
                  <div className="p-3 space-y-3">
                    {cronPausedRule && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="cron-paused"
                          checked={cronPausedRule.value === true || String(cronPausedRule.value) === "true"}
                          onChange={(e) => updateValue(cronPausedRule.id, e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor="cron-paused" className="text-sm text-[var(--foreground)]">
                          Jeu en pause (le cron ne s&apos;exécute plus automatiquement ; les jours restent passables manuellement)
                        </label>
                      </div>
                    )}
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Date du monde affichée aux joueurs (ex. Rapport du Cabinet). À chaque passage du cron, la date avance du nombre de mois indiqué dans la temporalité (0 = date figée).
                    </p>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Mois" tooltip="Choisit le mois affiché comme date actuelle de l'univers." />
                        </label>
                        <select
                          value={typeof worldDateRule.value === "object" && worldDateRule.value !== null && "month" in worldDateRule.value ? Number((worldDateRule.value as { month?: number }).month) : 1}
                          onChange={(e) => {
                            const month = Number(e.target.value);
                            const current = typeof worldDateRule.value === "object" && worldDateRule.value !== null && "year" in worldDateRule.value ? (worldDateRule.value as { year?: number }).year : 2025;
                            updateValue(worldDateRule.id, { month, year: current });
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-36"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        >
                          {MOIS_LABELS.map((label, i) => (
                            <option key={i} value={i + 1}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Année" tooltip="Choisit l'année affichée comme date actuelle de l'univers." />
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={typeof worldDateRule.value === "object" && worldDateRule.value !== null && "year" in worldDateRule.value ? Number((worldDateRule.value as { year?: number }).year) : 2025}
                          onChange={(e) => {
                            const year = Math.max(1, Math.min(9999, Number(e.target.value) || 2025));
                            const current = typeof worldDateRule.value === "object" && worldDateRule.value !== null && "month" in worldDateRule.value ? (worldDateRule.value as { month?: number }).month : 1;
                            updateValue(worldDateRule.id, { month: current, year });
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-20"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Temporalité (mois par mise à jour cron)" tooltip="Détermine de combien de mois la date du monde avance à chaque mise à jour quotidienne. À 0, la date reste figée." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={12}
                          value={typeof worldDateAdvanceRule.value === "number" ? worldDateAdvanceRule.value : (worldDateAdvanceRule.value as unknown as number) ?? 1}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(12, Math.round(Number(e.target.value)) ?? 0));
                            updateValue(worldDateAdvanceRule.id, v);
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-16"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          {items.length > 0 && (
          <CollapsibleBlock
            title="Lois"
            infoContent={<TooltipBody text="Réglages des ministères, du budget et de la mobilisation. Ils influencent directement l'évolution des pays." />}
            open={loisOpen}
            onToggle={() => setLoisOpen((o) => !o)}
            variant="section"
          >
          <CollapsibleBlock
            title="Paramètres Budget"
            infoContent={<TooltipBody text="Pour chaque ministère : seuil minimal, bonus si assez financé, malus si sous-financé." />}
            open={budgetOpen}
            onToggle={() => setBudgetOpen((o) => !o)}
          >
            <div className="pl-4 ml-2 border-l-2" style={{ borderColor: "var(--border-muted)" }}>
            {BUDGET_MINISTRY_KEYS.map((key) => {
              const r = rulesByKey.get(key);
              if (!r) return null;
              const val = getBudgetValue(r);
              const effectsList = val.effects ?? [];
              const isOpen = budgetMinistryOpen[key] ?? false;
              return (
                <CollapsibleBlock
                  key={r.id}
                  title={BUDGET_MINISTRY_LABELS[key] ?? key}
                  open={isOpen}
                  onToggle={() =>
                    setBudgetMinistryOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }))
                  }
                >
                  <div className="p-3 space-y-3" style={{ borderColor: "var(--border-muted)" }}>
                    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="% min" tooltip="Seuil minimal de financement à atteindre pour que ce ministère commence à produire correctement ses effets positifs." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={val.min_pct ?? 5}
                          onChange={(e) => updateBudgetField(r, "min_pct", null, Number(e.target.value))}
                          className={`${inputClassNarrow} w-14`}
                          style={inputStyle}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Gravité %" tooltip="Accentue les effets de ce ministère pour les pays en retard sur la moyenne mondiale. Plus la valeur est haute, plus le rattrapage est marqué." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={val.gravity_pct ?? 50}
                          onChange={(e) => updateBudgetField(r, "gravity_pct", null, Number(e.target.value))}
                          className={`${inputClassNarrow} w-14`}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-[var(--foreground-muted)]">
                          <TitleWithInfo title="Effets (type, bonus, malus, gravité)" tooltip="Liste des effets concrets portés par ce ministère. Chaque ligne décrit ce qu'il aide, ce qu'il pénalise en sous-financement, et si le rattrapage mondial s'applique." className="inline-flex items-center gap-1.5" />
                        </span>
                        <button
                          type="button"
                          onClick={() => addBudgetEffect(r)}
                          className="rounded px-2 py-1 text-xs font-medium"
                          style={{ background: "var(--accent)", color: "#0f1419" }}
                        >
                          Ajouter un effet
                        </button>
                      </div>
                      {effectsList.length === 0 ? (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Aucun effet configuré (valeurs par défaut utilisées).
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {effectsList.map((effect, idx) => (
                            <li
                              key={idx}
                              className="flex flex-wrap items-end gap-x-2 gap-y-1 rounded border py-2 px-2"
                              style={{ borderColor: "var(--border-muted)" }}
                            >
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Type" tooltip="Choisit quel domaine ce ministère influence : population, PIB ou l'une des stats du pays." />
                                </label>
                                <select
                                  value={effect.effect_type}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { effect_type: e.target.value as BudgetMinistryEffectDef["effect_type"] })}
                                  className={`${inputClassNarrow} min-w-28`}
                                  style={inputStyle}
                                >
                                  {BUDGET_EFFECT_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Bonus" tooltip="Effet positif maximal produit à chaque passage du monde quand le ministère est correctement financé." />
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.001}
                                  value={effect.bonus}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { bonus: Number(e.target.value) })}
                                  className={`${inputClassNarrow} w-14`}
                                  style={inputStyle}
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Malus" tooltip="Effet négatif appliqué quand le ministère tombe sous son seuil minimal de financement." />
                                </label>
                                <input
                                  type="number"
                                  max={0}
                                  step={0.001}
                                  value={effect.malus}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { malus: Number(e.target.value) })}
                                  className={`${inputClassNarrow} w-14`}
                                  style={inputStyle}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  id={`gravity-${r.id}-${idx}`}
                                  checked={effect.gravity_applies ?? (BUDGET_EFFECT_TYPES.find((t) => t.id === effect.effect_type)?.defaultGravityApplies ?? false)}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { gravity_applies: e.target.checked })}
                                  className="rounded"
                                />
                                <label htmlFor={`gravity-${r.id}-${idx}`} className="text-xs text-[var(--foreground-muted)]">
                                  <FormLabel label="Gravité" tooltip="Si activé, l'effet tient compte de l'écart entre le pays et la moyenne mondiale pour renforcer le rattrapage." />
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeBudgetEffect(r, idx)}
                                className="rounded px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
                              >
                                Supprimer
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </CollapsibleBlock>
              );
            })}
            </div>
            <div
              className="border-t p-3"
              style={{ borderColor: "var(--border-muted)", background: "var(--background)" }}
            >
              <div className="mb-2 text-sm font-medium text-[var(--foreground)]">
                <TitleWithInfo title="Simulateur (test des paramètres)" tooltip="Outil de test rapide pour voir ce que produirait un ministère selon le budget alloué et la situation du pays par rapport au monde." className="inline-flex items-center gap-2" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                    <FormLabel label="Ministère" tooltip="Choisit quel ministère vous souhaitez tester dans le simulateur." />
                  </label>
                  <select
                    value={simulatorMinistry}
                    onChange={(e) => setSimulatorMinistry(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    {BUDGET_MINISTRY_KEYS.map((k) => (
                      <option key={k} value={k}>{BUDGET_MINISTRY_LABELS[k] ?? k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                    <FormLabel label="Valeur de base du pays" tooltip="Valeur actuelle estimée du pays sur le domaine testé, avant application du ministère." />
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    value={simulatorBase}
                    onChange={(e) => setSimulatorBase(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                    <FormLabel label="Moyenne mondiale" tooltip="Référence utilisée pour mesurer si le pays est en avance ou en retard, notamment pour les effets de gravité." />
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    value={simulatorWorldAvg}
                    onChange={(e) => setSimulatorWorldAvg(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                  <FormLabel label="Allocation % (slider)" tooltip="Part du budget total donnée à ce ministère dans le test. Cela permet de simuler un sous-financement ou un effort volontaire." />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={simulatorAllocationPct}
                    onChange={(e) => setSimulatorAllocationPct(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-sm text-[var(--foreground)]">{simulatorAllocationPct} %</span>
                </div>
              </div>
              <div className="mt-3 rounded border p-2" style={{ borderColor: "var(--border-muted)" }}>
                <div className="text-xs font-medium text-[var(--foreground-muted)]">Résultat / jour (× 30 ≈ / mois)</div>
                <ul className="mt-1 list-none space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                  {bonusesPerDay.map(({ label, perDay, malusPerDay }) => (
                    <li key={label}>
                      {allocationBelowMin
                        ? `${label} : malus ${malusPerDay.toFixed(4)} / jour`
                        : `${label} : +${perDay.toFixed(4)} / jour`}
                    </li>
                  ))}
                  {bonusesPerDay.length === 0 && <li className="text-[var(--foreground-muted)]">Aucun effet</li>}
                </ul>
              </div>
            </div>
          </CollapsibleBlock>

          {(() => {
            const etatMajorRule = items.find((r) => r.key === "etat_major_config");
            if (!etatMajorRule) return null;
            const raw = typeof etatMajorRule.value === "object" && etatMajorRule.value !== null && !Array.isArray(etatMajorRule.value)
              ? (etatMajorRule.value as Record<string, unknown>)
              : {};
            const design = (raw.design as Record<string, number>) ?? { min_points_per_tick: 1, max_points_per_tick: 10 };
            const recrutement = (raw.recrutement as Record<string, number>) ?? { min_points_per_tick: 1, max_points_per_tick: 10 };
            const stock = (raw.stock as Record<string, number>) ?? { min_points_per_tick: 1, max_points_per_tick: 10 };
            const procuration = (raw.procuration as Record<string, number>) ?? { base_points_per_tick: 0, points_per_pct_budget: 0.5 };
            const updateEtatMajor = (path: string, field: string, val: number) => {
              const next = { ...raw };
              const seg = path === "design" ? design : path === "recrutement" ? recrutement : path === "stock" ? stock : procuration;
              (next[path] as Record<string, number>) = { ...seg, [field]: val };
              updateValue(etatMajorRule.id, next);
            };
            return (
              <CollapsibleBlock
                key="etat_major"
                title="État Major"
                infoContent={<TooltipBody text="Points par tick : Design (industrie), Recrutement (militarisme), Stock (science), Procuration (budget)." />}
                open={etatMajorOpen}
                onToggle={() => setEtatMajorOpen((o) => !o)}
              >
                <div className="pl-4 ml-2 border-l-2 space-y-4 p-3" style={{ borderColor: "var(--border-muted)" }}>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">Bureau de Design (industrie)</div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Min pts/tick</span>
                        <input type="number" min={0} step={0.5} value={design.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("design", "min_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Max pts/tick</span>
                        <input type="number" min={0} step={0.5} value={design.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("design", "max_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">Recrutement (militarisme)</div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Min pts/tick</span>
                        <input type="number" min={0} step={0.5} value={recrutement.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("recrutement", "min_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Max pts/tick</span>
                        <input type="number" min={0} step={0.5} value={recrutement.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("recrutement", "max_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">Stock stratégique (science)</div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Min pts/tick</span>
                        <input type="number" min={0} step={0.5} value={stock.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("stock", "min_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Max pts/tick</span>
                        <input type="number" min={0} step={0.5} value={stock.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("stock", "max_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">Procuration (budget %)</div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Base pts/tick</span>
                        <input type="number" min={0} step={0.5} value={procuration.base_points_per_tick ?? 0} onChange={(e) => updateEtatMajor("procuration", "base_points_per_tick", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-[var(--foreground-muted)]">Pts par % budget</span>
                        <input type="number" min={0} step={0.1} value={procuration.points_per_pct_budget ?? 0.5} onChange={(e) => updateEtatMajor("procuration", "points_per_pct_budget", Number(e.target.value) || 0)} className={`${inputClassNarrow} w-20`} style={inputStyle} />
                      </label>
                    </div>
                  </div>
                </div>
              </CollapsibleBlock>
            );
          })()}

          {LAW_DEFINITIONS.map((def) => {
            const configRule = getLawConfigRule(def);
            const effectsRule = getLawEffectsRule(def);
            if (!configRule || !effectsRule) return null;
            const isOpen = lawSectionsOpen[def.lawKey] ?? false;
            return (
              <CollapsibleBlock
                key={def.lawKey}
                title={def.title_fr}
                infoContent={<TooltipBody text={`Seuils, pas quotidien et effets par palier pour la loi « ${def.title_fr} ».`} />}
                open={isOpen}
                onToggle={() => setLawSectionsOpen((o) => ({ ...o, [def.lawKey]: !o[def.lawKey] }))}
              >
                <div className="p-3 space-y-4">
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Les paramètres et effets sont lus par le cron à chaque exécution. Toute modification enregistrée ici sera prise en compte à la prochaine mise à jour quotidienne.
                  </p>
                  <div>
                    <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">
                      <TitleWithInfo title="Seuils par palier (score 0–500)" tooltip="Chaque valeur indique à partir de quel score le pays entre dans ce palier." className="inline-flex items-center gap-1.5" />
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      {def.levels.map((level) => {
                        const config = getLawConfig(def);
                        const thresholds = config.level_thresholds ?? {};
                        const val = thresholds[level.key] ?? 0;
                        return (
                          <div key={level.key} className="flex flex-col gap-0.5">
                            <label className="text-xs text-[var(--foreground-muted)]">
                              <FormLabel label={level.label} tooltip={`Score minimal pour le palier « ${level.label} ».`} />
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={val}
                              onChange={(e) => updateLawThreshold(def, level.key, Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                              className="rounded border py-1.5 px-2 text-sm w-20 font-mono"
                              style={{ borderColor: "var(--border)", background: "var(--background)" }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {def.levels.map((level) => {
                      const effectsWithIndex = getLawEffectsForLevel(def, level.key);
                      return (
                        <div key={level.key} className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                          <div className="text-sm font-medium text-[var(--foreground)] mb-2">
                            <TitleWithInfo title={level.label} tooltip={`Effets actifs lorsque le pays est dans le palier « ${level.label} ».`} className="inline-flex items-center gap-2" />
                          </div>
                          <ul className="space-y-2">
                            {effectsWithIndex.map(({ effect: e, globalIndex: idx }) => {
                              const valueHelper = getEffectKindValueHelper(e.effect_kind);
                              const inputValue = valueHelper.storedToDisplay(Number(e.value));
                              const needsStatTarget = EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind);
                              const needsBudgetTarget = EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind);
                              const needsBranchTarget = EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind);
                              const needsRosterTarget = EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(e.effect_kind);
                              const needsSubTypeTarget = EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(e.effect_kind);
                              const onValueChange = (val: number) => updateLawEffect(def, idx, { value: valueHelper.displayToStored(val) });
                              return (
                                <li key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                                  <select
                                    value={e.effect_kind}
                                    onChange={(ev) => updateLawEffect(def, idx, { effect_kind: ev.target.value })}
                                    className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)] text-xs"
                                    style={{ borderColor: "var(--border)", maxWidth: "240px" }}
                                  >
                                    {getEffectKindOptionGroups().map((group) => (
                                      <optgroup key={group.label} label={group.label}>
                                        {group.options.map((opt) => (
                                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                  {needsStatTarget && (
                                    <select
                                      value={e.effect_target ?? STAT_KEYS[0]}
                                      onChange={(ev) => updateLawEffect(def, idx, { effect_target: ev.target.value || null })}
                                      className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)" }}
                                    >
                                      {STAT_KEYS.map((k) => (
                                        <option key={k} value={k}>{STAT_LABELS[k]}</option>
                                      ))}
                                    </select>
                                  )}
                                  {needsBudgetTarget && (
                                    <select
                                      value={e.effect_target ?? getBudgetMinistryOptions()[0]?.key ?? ""}
                                      onChange={(ev) => updateLawEffect(def, idx, { effect_target: ev.target.value || null })}
                                      className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)" }}
                                    >
                                      {getBudgetMinistryOptions().map(({ key, label }) => (
                                        <option key={key} value={key}>{label}</option>
                                      ))}
                                    </select>
                                  )}
                                  {needsBranchTarget && (
                                    <select
                                      value={e.effect_target ?? MILITARY_BRANCH_EFFECT_IDS[0]}
                                      onChange={(ev) => updateLawEffect(def, idx, { effect_target: ev.target.value || null })}
                                      className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)" }}
                                    >
                                      {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                                        <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                                      ))}
                                    </select>
                                  )}
                                  {needsRosterTarget && (
                                    <select
                                      value={e.effect_target ?? rosterUnits[0]?.id ?? ""}
                                      onChange={(ev) => updateLawEffect(def, idx, { effect_target: ev.target.value || null })}
                                      className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)", minWidth: "140px" }}
                                    >
                                      {rosterUnits.map((u) => (
                                        <option key={u.id} value={u.id}>{u.name_fr}</option>
                                      ))}
                                    </select>
                                  )}
                                  {needsSubTypeTarget && (
                                    <select
                                      value={e.effect_target ?? subTypeOptions[0]?.value ?? ""}
                                      onChange={(ev) => updateLawEffect(def, idx, { effect_target: ev.target.value || null })}
                                      className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)", minWidth: "160px" }}
                                    >
                                      {subTypeOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  )}
                                  <label className="flex items-center gap-1">
                                    <span className="text-[var(--foreground-muted)] shrink-0">
                                      <FormLabel label={valueHelper.valueLabel} tooltip={genericEffectValueTooltip} />
                                    </span>
                                    <input
                                      type="number"
                                      step={valueHelper.valueStep}
                                      value={inputValue}
                                      onChange={(ev) => onValueChange(Number(ev.target.value) || 0)}
                                      className="w-20 rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)" }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeLawEffect(def, idx)}
                                    className="text-[var(--danger)] hover:underline"
                                  >
                                    Supprimer
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                          <button
                            type="button"
                            onClick={() => addLawEffect(def, level.key)}
                            className="mt-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            Ajouter un effet
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleBlock>
            );
          })}
          </CollapsibleBlock>
          )}

          {(countriesForMatrice && relationMapForMatrice) && (
            <CollapsibleBlock
              title="Diplomatie"
              infoContent={<TooltipBody text="Relations entre pays : perception mutuelle, influence, emprise et effets de voisinage." />}
              open={diplomatieOpen}
              onToggle={() => setDiplomatieOpen((o) => !o)}
              variant="section"
            >
              <CollapsibleBlock
                title="Matrice diplomatique"
                infoContent={<TooltipBody text="Valeur de la relation entre deux pays. Utilisée par les events IA et le calcul d'idéologie." />}
                open={matriceOpen}
                onToggle={() => setMatriceOpen((o) => !o)}
              >
                <div className="p-3">
                  <MatriceDiplomatiqueForm countries={countriesForMatrice} relationMap={relationMapForMatrice} />
                </div>
              </CollapsibleBlock>
              {items.length > 0 && influenceConfigRule && (
                <CollapsibleBlock
                  title="Influence"
                  infoContent={<TooltipBody text="Calcul du poids international : PIB, population, puissance militaire et stabilité." />}
                  open={influenceOpen}
                  onToggle={() => setInfluenceOpen((o) => !o)}
                >
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Score Influence (type Diplomatic Weight) : multiplicateurs des contributions PIB, Population, Hard Power ; stabilité en intervalle (-3 à +3) ; gravité par paramètre.
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Mult. PIB" tooltip="Règle l'importance du PIB dans le calcul de l'influence. Plus la valeur est haute, plus la richesse pèse lourd." />
                        </label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_gdp ?? 1e-9} onChange={(e) => updateInfluenceConfig({ mult_gdp: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Mult. Population" tooltip="Règle l'importance de la population dans le calcul de l'influence." />
                        </label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_population ?? 1e-7} onChange={(e) => updateInfluenceConfig({ mult_population: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Mult. Hard Power" tooltip="Règle l'importance de la puissance militaire dans le calcul de l'influence." />
                        </label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_military ?? 0.01} onChange={(e) => updateInfluenceConfig({ mult_military: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Stabilité : modif. à min (-3)" tooltip="Définit à quel point une stabilité très mauvaise réduit l'influence internationale du pays." />
                        </label>
                        <input type="number" step="any" value={getInfluenceConfig().stability_modifier_min ?? 0} onChange={(e) => updateInfluenceConfig({ stability_modifier_min: Number(e.target.value) ?? 0 })} className="rounded border py-1.5 px-2 text-sm w-24 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Stabilité : modif. à max (+3)" tooltip="Définit à quel point une stabilité excellente renforce l'influence internationale du pays." />
                        </label>
                        <input type="number" step="any" value={getInfluenceConfig().stability_modifier_max ?? 1} onChange={(e) => updateInfluenceConfig({ stability_modifier_max: Number(e.target.value) ?? 1 })} className="rounded border py-1.5 px-2 text-sm w-24 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Gravité PIB %" tooltip="Accentue l'effet du PIB pour les pays éloignés de la moyenne mondiale." />
                        </label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_gdp ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_gdp: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Gravité Population %" tooltip="Accentue l'effet de la population pour les pays éloignés de la moyenne mondiale." />
                        </label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_population ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_population: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Gravité Hard Power %" tooltip="Accentue l'effet de la puissance militaire pour les pays éloignés de la moyenne mondiale." />
                        </label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_military ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_military: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
              {items.length > 0 && sphereInfluencePctRule && (
                <CollapsibleBlock
                  title="Sphère"
                  infoContent={
                    <TooltipBody
                      text={<strong>Règle la part d&apos;influence récupérée par un pays dominant sur un pays qu&apos;il contrôle.</strong>}
                      points={[
                        "Contesté : emprise incomplète ou disputée.",
                        "Occupé : contrôle fort, sans intégration totale.",
                        "Annexé : contrôle maximal.",
                      ]}
                    />
                  }
                  open={sphereOpen}
                  onToggle={() => setSphereOpen((o) => !o)}
                >
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Pour chaque statut de contrôle, le % de l&apos;influence du pays sous emprise qui est attribué à l&apos;overlord.
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Contesté %" tooltip="Part d'influence transmise quand le contrôle du pays reste disputé." />
                        </label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().contested ?? 50} onChange={(e) => updateSphereInfluencePct({ contested: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Occupé %" tooltip="Part d'influence transmise quand le pays est occupé mais pas encore annexé." />
                        </label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().occupied ?? 80} onChange={(e) => updateSphereInfluencePct({ occupied: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Annexé %" tooltip="Part d'influence transmise quand le pays est considéré comme entièrement annexé." />
                        </label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().annexed ?? 100} onChange={(e) => updateSphereInfluencePct({ annexed: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          {items.length > 0 && (ideologyConfigRule || ideologyEffectsRule) && (
            <CollapsibleBlock
              title="Idéologie"
              infoContent={<TooltipBody text="Vitesse du glissement idéologique des pays (voisins et effets actifs). Effets par idéologie : valeur à 100 % appliquée au prorata du score." />}
              open={ideologyOpen}
              onToggle={() => setIdeologyOpen((o) => !o)}
              variant="section"
            >
              <div className="p-3 space-y-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Règles de l'hexagone à six idéologies d’alignement. La dérive combine le voisinage, la relation, l’influence, le contrôle et les effets idéologiques actifs.
                </p>
                {ideologyConfigRule && (
                <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Lissage quotidien" tooltip="Règle la vitesse du changement idéologique. Une faible valeur crée de l'inertie, une forte valeur accélère les bascules." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().daily_step}
                      onChange={(e) => updateIdeologyConfig({ daily_step: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.daily_step })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Poids voisins" tooltip="Mesure à quel point l'idéologie des pays voisins tire un pays dans une direction." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().neighbor_pull_weight}
                      onChange={(e) => updateIdeologyConfig({ neighbor_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.neighbor_pull_weight })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Poids effets" tooltip="Mesure à quel point les effets idéologiques ajoutés par l'administration comptent dans la dérive." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().effect_pull_weight}
                      onChange={(e) => updateIdeologyConfig({ effect_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.effect_pull_weight })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Poids relation" tooltip="Augmente ou réduit l'influence idéologique d'un voisin selon que la relation bilatérale est bonne ou mauvaise." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().relation_pull_weight}
                      onChange={(e) => updateIdeologyConfig({ relation_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.relation_pull_weight })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Poids influence" tooltip="Donne davantage de poids idéologique aux voisins les plus influents sur la scène internationale." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().influence_pull_weight}
                      onChange={(e) => updateIdeologyConfig({ influence_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.influence_pull_weight })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Poids contrôle" tooltip="Renforce l'empreinte idéologique d'un voisin quand il contrôle ou annexe une part du pays concerné." />
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={getIdeologyConfigValue().control_pull_weight}
                      onChange={(e) => updateIdeologyConfig({ control_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.control_pull_weight })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Force des impulsions" tooltip="Amplifie les chocs idéologiques brusques par rapport aux influences lentes et progressives." />
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={getIdeologyConfigValue().snap_strength}
                      onChange={(e) => updateIdeologyConfig({ snap_strength: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.snap_strength })}
                      className="w-full rounded border px-2 py-1.5 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                </div>
                </>
                )}
                {ideologyEffectsRule && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-[var(--foreground)]">Effets par idéologie (valeur à 100 %)</h4>
                    {IDEOLOGY_IDS.map((ideologyId) => {
                      const list = getIdeologyEffectsForIdeology(ideologyId);
                      const formOpenForThis = ideologyEffectFormOpen && ideologyEffectFormIdeologyId === ideologyId;
                      return (
                        <div key={ideologyId} className="rounded border p-2 space-y-1" style={{ borderColor: "var(--border-muted)" }}>
                          <div className="text-xs font-medium text-[var(--foreground-muted)]">{IDEOLOGY_LABELS[ideologyId]}</div>
                          <ul className="list-disc list-inside text-sm">
                            {list.map((e, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-2">
                                <span>{labelForIdeologyEffect(e)}</span>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => openEditIdeologyEffect(ideologyId, idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                                  <button type="button" onClick={() => removeIdeologyEffect(ideologyId, idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                          {!formOpenForThis ? (
                            <button type="button" onClick={() => openAddIdeologyEffect(ideologyId)} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                          ) : (
                            <div className="rounded border p-3 space-y-2 mt-2" style={{ borderColor: "var(--border-muted)" }}>
                              <div>
                                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d'effet</label>
                                <select value={ideologyEffectKind} onChange={(ev) => { const k = ev.target.value; setIdeologyEffectKind(k); setIdeologyEffectTarget(getDefaultTargetForKindIdeology(k)); }} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                  {ideologyEffectOptionGroups.map((group) => (
                                    <optgroup key={group.label} label={group.label}>
                                      {group.options.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                              {EFFECT_KINDS_WITH_STAT_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Stat</label>
                                  <select value={ideologyEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_BUDGET_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label>
                                  <select value={ideologyEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_BRANCH_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label>
                                  <select value={ideologyEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label>
                                  <select value={ideologyEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Sous-branche/type</label>
                                  <select value={ideologyEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getEffectKindValueHelper(ideologyEffectKind).valueLabel}</label>
                                <input type="number" step={getEffectKindValueHelper(ideologyEffectKind).valueStep} value={ideologyEffectValue} onChange={(e) => setIdeologyEffectValue(e.target.value)} className="w-32 rounded border py-1.5 px-2 text-sm font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={saveIdeologyEffectForm} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>Enregistrer</button>
                                <button type="button" onClick={() => setIdeologyEffectFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>Annuler</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CollapsibleBlock>
          )}

          <div>
          {aiMajorEffectsRule && aiMinorEffectsRule && (
            <CollapsibleBlock
              title="Intelligence Artificielle"
              infoContent={<TooltipBody text="Rythme de génération des events IA et effets permanents pour les IA majeures et mineures." />}
              open={aiOpen}
              onToggle={() => setAiOpen((o) => !o)}
              variant="section"
            >
              <div className="p-3 space-y-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Effets appliqués aux pays sans joueur selon leur statut IA (Majeur / Mineur) défini dans la liste admin des pays.
                </p>

                {aiEventsConfigRule && (
                  <div className="rounded border p-4 space-y-4" style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}>
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">
                      <TitleWithInfo
                        title="Paramètres Events IA"
                        tooltip={
                          <TooltipBody
                            text={<strong>Détermine comment le système génère les actions automatiques des pays IA.</strong>}
                            points={[
                              "quand elles sont créées",
                              "combien d'actions partent à chaque passage",
                              "quels types d'actions et quelles cibles sont autorisés",
                            ]}
                          />
                        }
                        className="inline-flex items-center gap-2"
                      />
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Intervalle (heures)" tooltip="Délai minimum entre deux passages du cron qui génère les events IA." />
                        </label>
                        <input
                          type="number"
                          min={0.01}
                          max={168}
                          step={0.001}
                          value={getAiEventsConfig().interval_hours ?? 1}
                          onChange={(e) => updateAiEventsConfig({ interval_hours: Math.max(0.01, Number(e.target.value) || 0.01) })}
                          className="w-full rounded border px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Actions IA majeures par passage" tooltip="Nombre d'actions que le système peut créer pour les grandes IA à chaque passage." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={getAiEventsConfig().count_major_per_run ?? 0}
                          onChange={(e) => updateAiEventsConfig({ count_major_per_run: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full rounded border px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Actions IA mineures par passage" tooltip="Nombre d'actions que le système peut créer pour les petites IA à chaque passage." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={getAiEventsConfig().count_minor_per_run ?? 0}
                          onChange={(e) => updateAiEventsConfig({ count_minor_per_run: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full rounded border px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Amplitude temps (minutes)" tooltip="Décale légèrement l'heure exacte des actions IA autour de l'heure théorique pour éviter un déclenchement trop mécanique." />
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={getAiEventsConfig().trigger_amplitude_minutes ?? 0}
                          onChange={(e) => updateAiEventsConfig({ trigger_amplitude_minutes: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full rounded border px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-[var(--foreground-muted)]">
                        <TitleWithInfo title="Actions autorisées (IA majeures)" tooltip="Liste des types d'actions que les IA majeures ont le droit de générer automatiquement." className="inline-flex items-center gap-1.5" />
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {stateActionTypesForAi.map((t) => (
                          <label key={t.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={(getAiEventsConfig().allowed_action_type_keys_major ?? []).includes(t.key)}
                              onChange={() => toggleAllowedActionKey("major", t.key)}
                            />
                            {t.label_fr}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-[var(--foreground-muted)]">
                        <TitleWithInfo title="Actions autorisées (IA mineures)" tooltip="Liste des types d'actions que les IA mineures ont le droit de générer automatiquement." className="inline-flex items-center gap-1.5" />
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {stateActionTypesForAi.map((t) => (
                          <label key={t.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={(getAiEventsConfig().allowed_action_type_keys_minor ?? []).includes(t.key)}
                              onChange={() => toggleAllowedActionKey("minor", t.key)}
                            />
                            {t.label_fr}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-[var(--foreground-muted)]">
                        <TitleWithInfo title="Cibles autorisées" tooltip="Détermine quelles catégories de pays peuvent être choisies comme cibles par les actions IA." className="inline-flex items-center gap-1.5" />
                      </span>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={getAiEventsConfig().target_major_ai ?? false}
                            onChange={(e) => updateAiEventsConfig({ target_major_ai: e.target.checked })}
                          />
                          IA majeures
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={getAiEventsConfig().target_minor_ai ?? false}
                            onChange={(e) => updateAiEventsConfig({ target_minor_ai: e.target.checked })}
                          />
                          IA mineures
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={getAiEventsConfig().target_players ?? false}
                            onChange={(e) => updateAiEventsConfig({ target_players: e.target.checked })}
                          />
                          Joueurs
                        </label>
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-[var(--foreground-muted)]">
                        <TitleWithInfo
                          title="Distance"
                          tooltip={
                            <TooltipBody
                              text={<strong>Définit jusqu&apos;où l&apos;IA peut aller chercher ses cibles.</strong>}
                              points={[
                                "Voisins : pays limitrophes via la carte.",
                                "Continent : pays du même continent.",
                                "Monde entier : aucune contrainte géographique.",
                              ]}
                            />
                          }
                          className="inline-flex items-center gap-1.5"
                        />
                      </span>
                      <div className="flex flex-wrap gap-4">
                        {["neighbors", "continent", "world"].map((mode) => (
                          <label key={mode} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={(getAiEventsConfig().distance_modes ?? []).includes(mode)}
                              onChange={() => toggleDistanceMode(mode)}
                            />
                            {mode === "neighbors" ? "Voisins" : mode === "continent" ? "Continent" : "Monde entier"}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Pour « Voisins », les régions limitrophes sont lues depuis la table map_region_neighbors. Après modification des formes de la carte, recalculer les voisinages.
                      </p>
                      <RecalculerVoisinagesButton />
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-[var(--foreground-muted)]">
                        <TitleWithInfo title="Accepter automatiquement (par type)" tooltip="Permet de faire passer certaines actions IA directement à l'état accepté, sans validation manuelle." className="inline-flex items-center gap-1.5" />
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {stateActionTypesForAi.map((t) => (
                          <label key={t.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={getAiEventsConfig().auto_accept_by_action_type?.[t.key] ?? false}
                              onChange={() => toggleAutoAccept(t.key)}
                            />
                            {t.label_fr}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-[var(--foreground)]">
                      <TitleWithInfo title="IA majeure" tooltip="Effets permanents appliqués aux pays sans joueur considérés comme grandes puissances IA." className="inline-flex items-center gap-2" />
                    </h4>
                    <ul className="space-y-2">
                      {getAiEffects(aiMajorEffectsRule).map((e, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                          style={{ borderColor: "var(--border-muted)" }}
                        >
                          <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditAiEffect("major", idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                            <button type="button" onClick={() => removeAiEffect("major", idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {!aiMajorFormOpen ? (
                      <button type="button" onClick={() => openAddAiEffect("major")} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                    ) : (
                      <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                        <div>
                          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                            <FormLabel label="Type d'effet" tooltip={genericEffectTypeTooltip} />
                          </label>
                          <select value={aiMajorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMajorEffectKind(k); setAiMajorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {getEffectKindOptionGroups().map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Stat" tooltip={genericStatTooltip} /></label><select value={aiMajorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Ministère" tooltip={genericBudgetTooltip} /></label><select value={aiMajorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Branche" tooltip={genericBranchTooltip} /></label><select value={aiMajorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Unité" tooltip={genericUnitTooltip} /></label><select value={aiMajorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Sous-branche/type" tooltip="Branche et sous-type militaire." /></label><select value={aiMajorEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label={getEffectKindValueHelper(aiMajorEffectKind).valueLabel} tooltip={genericEffectValueTooltip} /></label><input type="number" step={getEffectKindValueHelper(aiMajorEffectKind).valueStep} value={aiMajorEffectValue} onChange={(e) => setAiMajorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
                        <div className="flex gap-2"><button type="button" onClick={() => saveAiEffectForm("major")} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>Enregistrer</button><button type="button" onClick={() => setAiMajorFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>Annuler</button></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-[var(--foreground)]">
                      <TitleWithInfo title="IA mineure" tooltip="Effets permanents appliqués aux pays sans joueur considérés comme puissances secondaires IA." className="inline-flex items-center gap-2" />
                    </h4>
                    <ul className="space-y-2">
                      {getAiEffects(aiMinorEffectsRule).map((e, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                          style={{ borderColor: "var(--border-muted)" }}
                        >
                          <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditAiEffect("minor", idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                            <button type="button" onClick={() => removeAiEffect("minor", idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {!aiMinorFormOpen ? (
                      <button type="button" onClick={() => openAddAiEffect("minor")} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                    ) : (
                      <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                        <div>
                          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                            <FormLabel label="Type d'effet" tooltip={genericEffectTypeTooltip} />
                          </label>
                          <select value={aiMinorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMinorEffectKind(k); setAiMinorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {getEffectKindOptionGroups().map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Stat" tooltip={genericStatTooltip} /></label><select value={aiMinorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Ministère" tooltip={genericBudgetTooltip} /></label><select value={aiMinorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Branche" tooltip={genericBranchTooltip} /></label><select value={aiMinorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Unité" tooltip={genericUnitTooltip} /></label><select value={aiMinorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Sous-branche/type" tooltip="Branche et sous-type militaire." /></label><select value={aiMinorEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label={getEffectKindValueHelper(aiMinorEffectKind).valueLabel} tooltip={genericEffectValueTooltip} /></label><input type="number" step={getEffectKindValueHelper(aiMinorEffectKind).valueStep} value={aiMinorEffectValue} onChange={(e) => setAiMinorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
                        <div className="flex gap-2"><button type="button" onClick={() => saveAiEffectForm("minor")} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>Enregistrer</button><button type="button" onClick={() => setAiMinorFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>Annuler</button></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleBlock>
          )}
          </div>

          {intelConfigRule && (
            <CollapsibleBlock
              title="Espionnage / Intelligence"
              infoContent={<TooltipBody text="Brouillard de guerre : baisse quotidienne du niveau d'intel et gain lors d'une action d'espionnage acceptée." />}
              open={intelOpen}
              onToggle={() => setIntelOpen((o) => !o)}
              variant="section"
            >
              <div className="p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Mode de decay" tooltip="Flat : décrémente un nombre fixe par jour. Pct : décrémente un pourcentage du niveau actuel. Both : applique d'abord le flat, puis le pourcentage sur le résultat." />
                    </label>
                    <select
                      value={getIntelConfig().decay_mode ?? "flat"}
                      onChange={(e) => updateIntelConfig({ decay_mode: e.target.value as "flat" | "pct" | "both" })}
                      className="w-full rounded border py-1.5 px-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    >
                      <option value="flat">Flat (fixe)</option>
                      <option value="pct">Pourcentage</option>
                      <option value="both">Les deux (séquentiel)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Gain espionnage (base)" tooltip="Delta de référence ajouté au niveau d'intel quand le MJ accepte une action d'espionnage. Le gain réel est proportionnel au jet d'impact." />
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={getIntelConfig().espionage_intel_gain_base ?? 50}
                      onChange={(e) => updateIntelConfig({ espionage_intel_gain_base: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-full rounded border py-1.5 px-2 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Decay flat / jour" tooltip="Nombre de points d'intel retirés chaque jour (utilisé si le mode est Flat ou Both)." />
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getIntelConfig().decay_flat_per_day ?? 2}
                      onChange={(e) => updateIntelConfig({ decay_flat_per_day: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full rounded border py-1.5 px-2 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">
                      <FormLabel label="Decay pct / jour (%)" tooltip="Pourcentage du niveau actuel retiré chaque jour (utilisé si le mode est Pct ou Both)." />
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={getIntelConfig().decay_pct_per_day ?? 5}
                      onChange={(e) => updateIntelConfig({ decay_pct_per_day: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-full rounded border py-1.5 px-2 text-sm font-mono"
                      style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Exemple : avec un decay flat de 2 et un mode « flat », un pays à 50 % d'intel passera à 48 % le lendemain.
                  Avec un gain base de 50 et un jet d'impact de 70/100, le joueur recevra +35 points d'intel.
                </p>
              </div>
            </CollapsibleBlock>
          )}

        </div>
      )}
    </div>
  );
}