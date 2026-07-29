"use client";

import { useState, useMemo } from "react";
import {
  computeMapRegionNeighbors,
  getVoisinagesByCountry,
  saveRuleParameters,
  type VoisinageEntry,
} from "@/app/admin/regles/actions";
import { AdminParameterTable, AdminSaveBar, AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";
import {
  AiRulePreview,
  BudgetWorldGapPreview,
  IdeologyRulePreview,
  InfluenceRulePreview,
  IntelRulePreview,
  LawThresholdRulePreview,
  SphereRulePreview,
} from "@/components/admin/RulePreviews";
import type { RuleParameter } from "@/types/database";
import {
  getRuleLabel,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  BUDGET_EFFECT_TYPES,
  BUDGET_EFFECT_TYPE_LABELS,
  getEffectsListForMinistry,
  budgetMinistryFinalContrib,
  BILATERAL_RELATION_SCOPE_LABELS,
  type BudgetMinistryValue,
  type BudgetMinistryEffectDef,
  type BilateralRelationScope,
} from "@/lib/ruleParameters";
import { DEFAULT_IDEOLOGY_CONFIG, getIdeologyConfig as parseIdeologyConfig, IDEOLOGY_IDS, IDEOLOGY_LABELS, type IdeologyConfig } from "@/lib/ideology";
import { STATE_ACTION_STAT_RANGES } from "@/lib/stateActionModifiers";
import { MOIS_LABELS } from "@/lib/worldDate";
import {
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
  getEffectKindOptionGroups,
  getEffectKindValueHelper,
  formatEffectValue,
} from "@/lib/countryEffects";
import {
  formatIdeologyEffectsEffectValue,
  getIdeologyEffectFormValueHelper,
  getIdeologyEffectKindOptionGroups,
  getIdeologyEffectsKindLabel,
} from "@/lib/ideologyEffectsDisplay";
import { LAW_DEFINITIONS, type LawDefinition } from "@/lib/laws";
import { MatriceDiplomatiqueForm } from "@/app/admin/matrice-diplomatique/MatriceDiplomatiqueForm";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { computeInfluenceGravityFactor } from "@/lib/influence";
import { matchesSearchText } from "@/lib/searchText";

const GDP_INFLUENCE_REFERENCE = 1_000_000_000_000;
const POPULATION_INFLUENCE_REFERENCE = 10_000_000;
const MILITARY_INFLUENCE_REFERENCE = 100;

function influencePointsForReference(
  multiplier: number | undefined,
  fallback: number,
  reference: number
): number {
  const value = typeof multiplier === "number" && Number.isFinite(multiplier) ? multiplier : fallback;
  return Math.round(value * reference * 100) / 100;
}

function formatInfluenceFactor(value: number): string {
  return `×${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function influenceMultiplierPercent(multiplier: number | undefined, fallback: number): number {
  const value = typeof multiplier === "number" && Number.isFinite(multiplier) ? multiplier : fallback;
  return Math.round(value * 10_000) / 100;
}

function InfluenceWorldGapControl({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const belowAverage = computeInfluenceGravityFactor(100, 50, safeValue, 1);
  const aboveAverage = computeInfluenceGravityFactor(100, 150, safeValue, 1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-[var(--foreground)]">{label}</label>
        <output htmlFor={id} className="text-sm font-semibold text-[var(--foreground)]">{safeValue} %</output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={safeValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
      />
      <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--foreground-muted)]">50 % sous la moyenne</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">{formatInfluenceFactor(belowAverage)}</dd>
        </div>
        <div>
          <dt className="text-[var(--foreground-muted)]">50 % au-dessus</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">{formatInfluenceFactor(aboveAverage)}</dd>
        </div>
      </dl>
    </div>
  );
}

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
      {tooltip ? (
        <InfoTooltip
          label={typeof title === "string" ? title : undefined}
          side={side}
          warning={Boolean(warning)}
          content={<TooltipBody text={tooltip} warning={warning} />}
        />
      ) : null}
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
      {tooltip ? (
        <InfoTooltip
          label={typeof label === "string" ? label : undefined}
          side={side}
          warning={Boolean(warning)}
          content={<TooltipBody text={tooltip} warning={warning} />}
        />
      ) : null}
    </span>
  );
}

const RULE_SECTION_META: Record<string, { description: string; impact: string }> = {
  "rules-global": {
    description: "Le rythme commun de la simulation et les calculs appliqués à tous les pays.",
    impact: "Tous les pays",
  },
  "rules-global-effects": {
    description: "Croissance et effets ajoutés automatiquement à chaque passage du monde.",
    impact: "Chaque jour",
  },
  "rules-dice-modifiers": {
    description: "Traduit les statistiques d’un pays en bonus ou malus sur ses jets.",
    impact: "Jets joueurs et IA",
  },
  "rules-world-date": {
    description: "Date affichée, pause générale et vitesse du calendrier.",
    impact: "Calendrier mondial",
  },
  "rules-laws": {
    description: "Budgets, mobilisation et lois qui font évoluer les pays dans le temps.",
    impact: "Évolution des pays",
  },
  "rules-budgets": {
    description: "Seuils de financement, bonus, malus et prise en compte de la moyenne mondiale.",
    impact: "Effets quotidiens",
  },
  "rules-military-staff": {
    description: "Points gagnés pour concevoir, recruter, stocker et agir par procuration.",
    impact: "Capacités militaires",
  },
  "rules-diplomacy": {
    description: "Relations, influence internationale et contrôle exercé sur d’autres pays.",
    impact: "Diplomatie",
  },
  "rules-relations": {
    description: "Valeur réciproque entre deux pays, de l’hostilité totale à l’alliance.",
    impact: "Actions et idéologies",
  },
  "rules-influence": {
    description: "Poids relatif du PIB, de la population, de l’armée et de la stabilité.",
    impact: "Classement et influence",
  },
  "rules-control": {
    description: "Part d’influence transmise au pays qui conteste, occupe ou annexe.",
    impact: "Sphères d’influence",
  },
  "rules-ideology": {
    description: "Vitesse et forces qui déplacent l’alignement idéologique d’un pays.",
    impact: "Alignement quotidien",
  },
  "rules-ai": {
    description: "Fréquence, volume, cibles et effets des actions créées sans joueur.",
    impact: "Pays IA",
  },
  "rules-intelligence": {
    description: "Gain par espionnage et disparition progressive des renseignements.",
    impact: "Brouillard de guerre",
  },
};

function CollapsibleBlock({
  id,
  title,
  infoContent,
  infoWarning,
  description,
  impact,
  open,
  onToggle,
  children,
  variant = "default",
}: {
  id?: string;
  title: string;
  infoContent?: React.ReactNode;
  infoWarning?: boolean;
  description?: string;
  impact?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "default" | "section";
}) {
  const isSection = variant === "section";
  const meta = id ? RULE_SECTION_META[id] : undefined;
  const visibleDescription = description ?? meta?.description;
  const visibleImpact = impact ?? meta?.impact;
  return (
    <div
      id={id}
      className={`${isSection ? "rounded-lg border-2" : "border-b"} scroll-mt-36`}
      style={{
        borderColor: isSection ? "var(--border)" : "var(--border-muted)",
        background: isSection ? "var(--background-panel)" : undefined,
      }}
    >
      <div
        className={`flex items-stretch ${isSection ? "px-2" : "px-1"}`}
        style={{ background: "var(--background-elevated)" }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${isSection ? "px-3 py-4" : "px-3 py-3"}`}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`${isSection ? "text-base font-semibold" : "text-sm font-medium"} text-[var(--foreground)]`}>
                {title}
              </span>
              {visibleImpact ? (
                <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>
                  {visibleImpact}
                </span>
              ) : null}
            </span>
            {visibleDescription ? (
              <span className="mt-1 block max-w-[72ch] text-xs leading-relaxed text-[var(--foreground-muted)]">
                {visibleDescription}
              </span>
            ) : null}
          </span>
          <DisclosureChevron open={open} className="shrink-0" />
        </button>
        {infoContent ? (
          <div className="flex shrink-0 items-center">
            <InfoTooltip
              label={title}
              side="bottom"
              warning={infoWarning}
              content={infoContent}
            />
          </div>
        ) : null}
      </div>
      {open && (
      <div className="grid">
        <div className="min-h-0 overflow-hidden">
          <div
            className={isSection ? "border-t py-1" : "divide-y"}
            style={{ borderColor: "var(--border-muted)" }}
          >
            {children}
          </div>
        </div>
      </div>
      )}
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
  const [savedItems, setSavedItems] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
  const [ruleSearch, setRuleSearch] = useState("");

  const ruleSearchResults = [
    {
      label: "Effets quotidiens communs",
      description: "Croissance, statistiques et autres effets appliqués à tous les pays.",
      keywords: "global population pib croissance",
      targetId: "rules-global-effects",
      open: () => {
        setEffetsGlobauxOpen(true);
        setGlobalGrowthOpen(true);
      },
    },
    {
      label: "Bonus et malus aux jets",
      description: "Influence des statistiques d’un pays sur ses jets de dés.",
      keywords: "statistiques demandes actions événements ia",
      targetId: "rules-dice-modifiers",
      open: () => {
        setEffetsGlobauxOpen(true);
        setStatsOpen(true);
      },
    },
    {
      label: "Date du monde",
      description: "Date affichée, pause et nombre de mois avancés chaque jour.",
      keywords: "temps calendrier année mois mise à jour",
      targetId: "rules-world-date",
      open: () => {
        setEffetsGlobauxOpen(true);
        setWorldDateOpen(true);
      },
    },
    {
      label: "Budgets des ministères",
      description: "Seuils de financement, bonus et malus des ministères.",
      keywords: "lois allocation gravité rattrapage économie",
      targetId: "rules-budgets",
      open: () => {
        setLoisOpen(true);
        setBudgetOpen(true);
      },
    },
    {
      label: "État-major et mobilisation",
      description: "Points militaires, recrutement, stock et procuration.",
      keywords: "armée défense design militaire",
      targetId: "rules-military-staff",
      open: () => {
        setLoisOpen(true);
        setEtatMajorOpen(true);
      },
    },
    {
      label: "Lois nationales",
      description: "Paliers, progression quotidienne et effets de chaque loi.",
      keywords: "mobilisation fiscalité législation",
      targetId: "rules-laws",
      open: () => setLoisOpen(true),
    },
    {
      label: "Relations entre pays",
      description: "Valeurs de relation utilisées par la diplomatie et les événements.",
      keywords: "matrice diplomatique alliés hostilité",
      targetId: "rules-relations",
      open: () => {
        setDiplomatieOpen(true);
        setMatriceOpen(true);
      },
    },
    {
      label: "Influence internationale",
      description: "Poids du PIB, de la population, de l’armée et de la stabilité.",
      keywords: "diplomatie puissance hard power gravité",
      targetId: "rules-influence",
      open: () => {
        setDiplomatieOpen(true);
        setInfluenceOpen(true);
      },
    },
    {
      label: "Contrôle et annexion",
      description: "Influence transmise par un pays contesté, occupé ou annexé.",
      keywords: "sphère emprise occupation",
      targetId: "rules-control",
      open: () => {
        setDiplomatieOpen(true);
        setSphereOpen(true);
      },
    },
    {
      label: "Évolution des idéologies",
      description: "Vitesse du changement et poids des différentes influences.",
      keywords: "dérive voisins relations effets",
      targetId: "rules-ideology",
      open: () => setIdeologyOpen(true),
    },
    {
      label: "Pays gérés par l’IA",
      description: "Rythme, ciblage et effets des événements automatiques.",
      keywords: "intelligence artificielle majeure mineure actions",
      targetId: "rules-ai",
      open: () => setAiOpen(true),
    },
    {
      label: "Espionnage et renseignement",
      description: "Gain après une action et perte quotidienne d’information.",
      keywords: "intelligence intel brouillard guerre decay",
      targetId: "rules-intelligence",
      open: () => setIntelOpen(true),
    },
  ].filter((entry) =>
    matchesSearchText(ruleSearch, [entry.label, entry.description, entry.keywords])
  );

  function openRuleSearchResult(result: (typeof ruleSearchResults)[number]) {
    result.open();
    requestAnimationFrame(() => {
      const target = document.getElementById(result.targetId);
      target?.scrollIntoView({ block: "start" });
      target?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
  }

  const dirtyItems = useMemo(() => {
    const savedById = new Map(savedItems.map((row) => [row.id, row.value]));
    return items.filter((row) => JSON.stringify(row.value) !== JSON.stringify(savedById.get(row.id)));
  }, [items, savedItems]);

  const updateValue = (id: string, value: unknown) => {
    setError(null);
    setSuccess(null);
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, value } : r))
    );
  };

  async function saveAll() {
    if (dirtyItems.length === 0 || saving) return;
    setError(null);
    setSuccess(null);
    if (ruleValueError) {
      setError("Impossible d'enregistrer : une ou plusieurs valeurs sont invalides (JSON). Corrigez-les puis réessayez.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveRuleParameters(dirtyItems);
      if (result.error) {
        setError(`${result.error} Aucun changement de ce lot n’a été appliqué.`);
      } else {
        setSavedItems(items);
        setSuccess(`${dirtyItems.length} réglage${dirtyItems.length > 1 ? "s" : ""} enregistré${dirtyItems.length > 1 ? "s" : ""}.`);
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

  function resetAll() {
    setItems(savedItems);
    setError(null);
    setSuccess(null);
    setRuleValueError(null);
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
    () => getIdeologyEffectKindOptionGroups(EFFECT_KINDS_FOR_IDEOLOGY_RULE),
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
    const helper = getIdeologyEffectFormValueHelper(e.effect_kind);
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
    const helper = getIdeologyEffectFormValueHelper(ideologyEffectKind);
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
    const kindLabel = getIdeologyEffectsKindLabel(e.effect_kind);
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
    const valueStr = formatIdeologyEffectsEffectValue(e.effect_kind, e.value);
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
  const minPct = simulatorParams?.min_pct ?? 5;
  const effectsResolved = (simulatorParams && getEffectsListForMinistry(simulatorMinistry, simulatorParams)) ?? [];
  const allocationBelowMin = simulatorAllocationPct < minPct;
  const gravPctSim = simulatorParams?.gravity_pct ?? 50;
  const bonusesPerDay = effectsResolved.map((eff, effIdx) => {
    const label = BUDGET_EFFECT_TYPE_LABELS[eff.effect_type] ?? eff.effect_type;
    if (!validNums) {
      return { key: `${eff.effect_type}-${effIdx}`, line: `${label} : (saisir valeurs numériques)` };
    }
    const w = { pop: worldAvgNum, gdp: worldAvgNum, mil: worldAvgNum, ind: worldAvgNum, sci: worldAvgNum, stab: worldAvgNum };
    const c = {
      population: baseNum,
      gdp: baseNum,
      militarism: baseNum,
      industry: baseNum,
      science: baseNum,
      stability: baseNum,
    };
    const ga = eff.gravity_applies ?? BUDGET_EFFECT_TYPES.find((t) => t.id === eff.effect_type)?.defaultGravityApplies ?? false;
    const fc = budgetMinistryFinalContrib(
      simulatorAllocationPct,
      minPct,
      eff.bonus,
      eff.malus,
      ga,
      gravPctSim,
      eff.effect_type,
      w,
      c
    );
    const scopeNote =
      eff.effect_type === "bilateral_relations"
        ? ` [${BILATERAL_RELATION_SCOPE_LABELS[(eff.relation_scope as BilateralRelationScope) ?? "world"] ?? eff.relation_scope}]`
        : "";
    if (eff.effect_type === "bilateral_relations") {
      const r = Math.round(fc);
      return {
        key: `${eff.effect_type}-${effIdx}`,
        line: `${label}${scopeNote} : ${r >= 0 ? "+" : ""}${r} / jour (si la relation actuelle reste dans la plage définie)`,
      };
    }
    return {
      key: `${eff.effect_type}-${effIdx}`,
      line: `${label}${scopeNote} : ${fc >= 0 ? "+" : ""}${fc.toFixed(4)} / jour${allocationBelowMin ? " (sous seuil → malus intégré)" : ""}`,
    };
  });

  const worldDateValue =
    typeof worldDateRule?.value === "object" && worldDateRule.value !== null
      ? worldDateRule.value as { month?: number; year?: number }
      : {};
  const worldMonth = Math.max(1, Math.min(12, Number(worldDateValue.month ?? 1)));
  const worldYear = Number(worldDateValue.year ?? 2025);
  const worldAdvance = Number(worldDateAdvanceRule?.value ?? 1);
  const worldPaused = cronPausedRule?.value === true || String(cronPausedRule?.value) === "true";
  const aiOverview = getAiEventsConfig();
  const aiMajorCount = aiOverview.count_major_per_run ?? 0;
  const aiMinorCount = aiOverview.count_minor_per_run ?? 0;
  const intelOverview = getIntelConfig();
  const intelDecayMode = intelOverview.decay_mode ?? "flat";
  const overviewRows = [
    {
      label: "Monde",
      value: `${worldPaused ? "Mises à jour en pause" : "Mises à jour actives"} · ${MOIS_LABELS[worldMonth - 1]} ${worldYear} · +${worldAdvance} mois/jour`,
    },
    {
      label: "Pays IA",
      value: `Toutes les ${aiOverview.interval_hours ?? 1} h · ${aiMajorCount} action${aiMajorCount === 1 ? "" : "s"} majeure${aiMajorCount === 1 ? "" : "s"} et ${aiMinorCount} mineure${aiMinorCount === 1 ? "" : "s"} par passage`,
    },
  ];

  return (
    <div className="admin-settings-form space-y-5">
      <div className="mb-7">
        <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
          Règles de simulation
        </h1>
        <p className="max-w-[72ch] leading-relaxed text-[var(--foreground-muted)]">
          Pilotez la mise à jour quotidienne du monde, les lois, la diplomatie et les pays sans joueur.
          Chaque section indique maintenant qui verra le changement et quand il s’appliquera.
        </p>
      </div>

      <AdminSettingsGuide
        purpose="Modifiez une intention de jeu, puis vérifiez son effet concret dans la section concernée. Les réglages avancés restent accessibles sans encombrer la lecture générale."
        impact="La plupart des changements prennent effet au prochain passage quotidien. La date, les jets et certaines valeurs diplomatiques peuvent agir plus tôt."
        check="Contrôlez les seuils dans leur ordre, les minimums face aux maximums et les exemples affichés avant d’enregistrer."
        warning="L’enregistrement applique tout le lot en une seule fois. En cas d’erreur, aucun réglage du lot n’est modifié."
      />

      <section
        aria-labelledby="rules-overview-title"
        className="rounded-xl border px-4 py-4 sm:px-5"
        style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
      >
        <h2 id="rules-overview-title" className="text-base font-semibold text-[var(--foreground)]">
          Situation générale
        </h2>
        <dl className="mt-3 divide-y" style={{ borderColor: "var(--border-muted)" }}>
          {overviewRows.map((row) => (
            <div key={row.label} className="grid gap-1 py-3 text-sm sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="font-medium text-[var(--foreground)]">{row.label}</dt>
              <dd className="leading-relaxed text-[var(--foreground-muted)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="max-w-3xl rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <label htmlFor="rule-setting-search" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
          Trouver un réglage
        </label>
        <input
          id="rule-setting-search"
          type="search"
          value={ruleSearch}
          onChange={(event) => setRuleSearch(event.target.value)}
          placeholder="Ex. budget, idéologie, espionnage…"
          className="min-h-12 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
          style={{ borderColor: "var(--border)" }}
        />
        <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
          Recherchez avec vos mots, puis ouvrez directement le bon panneau.
        </p>
        {ruleSearch && (
          <div className="mt-3 space-y-1" aria-live="polite">
            {ruleSearchResults.map((result) => (
              <button
                key={result.targetId}
                type="button"
                onClick={() => openRuleSearchResult(result)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--background-elevated)] focus-visible:bg-[var(--background-elevated)]"
              >
                <span>
                  <span className="block text-sm font-medium text-[var(--foreground)]">{result.label}</span>
                  <span className="block text-xs leading-relaxed text-[var(--foreground-muted)]">{result.description}</span>
                </span>
                <span aria-hidden className="shrink-0 text-[var(--accent)]">→</span>
              </button>
            ))}
            {ruleSearchResults.length === 0 && (
              <p className="px-3 py-4 text-sm text-[var(--foreground-muted)]">
                Aucun réglage trouvé. Essayez un terme plus général.
              </p>
            )}
          </div>
        )}
      </div>
      {ruleValueError && (
        <p role="alert" className="rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
          {ruleValueError}
        </p>
      )}
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
              id="rules-global"
              title="Effets globaux"
              infoContent={<TooltipBody text="Réglages appliqués à tous les pays. Ils définissent le climat général de la simulation." />}
              open={effetsGlobauxOpen}
              onToggle={() => setEffetsGlobauxOpen((o) => !o)}
              variant="section"
            >
              {globalGrowthEffectsRule && (
            <CollapsibleBlock
              id="rules-global-effects"
              title="Effets quotidiens communs"
              infoContent={<TooltipBody text="Effets appliqués à tous les pays à chaque passage du monde : croissance, statistiques, budget, etc." />}
              open={globalGrowthOpen}
              onToggle={() => setGlobalGrowthOpen((o) => !o)}
            >
              <div className="p-3 space-y-3">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Ces effets sont appliqués à tous les pays pendant la mise à jour quotidienne.
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
                        aria-label="Type d’effet global"
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
                          aria-label="Statistique ciblée par l’effet global"
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
                          aria-label="Ministère ciblé par l’effet global"
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
                          aria-label="Branche ciblée par l’effet global"
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
                          aria-label="Unité ciblée par l’effet global"
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
                          aria-label="Sous-branche ciblée par l’effet global"
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
                        aria-label={getEffectKindValueHelper(globalEffectKind).valueLabel}
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
                  id="rules-dice-modifiers"
                  title="Bonus et malus des statistiques"
                  infoContent={<TooltipBody text="Définit l’effet individuel d’une statistique lorsqu’un type d’action l’utilise dans son jet." />}
                  open={statsOpen}
                  onToggle={() => setStatsOpen((o) => !o)}
                >
                  <div className="p-3 space-y-4">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Définissez le bonus ou le malus produit par chaque statistique lorsqu’elle est utilisée. Les valeurs intermédiaires sont calculées automatiquement.
                    </p>
                    <AdminParameterTable
                      label="Effets des statistiques sur les jets"
                      columns={["Au score minimum", "Au score maximum"]}
                      rows={STAT_KEYS.map((statKey) => {
                        const ranges = getStatsDiceModifierRanges()[statKey] ?? { min: -10, max: 20 };
                        const statRange = STATE_ACTION_STAT_RANGES[statKey];
                        return {
                          key: statKey,
                          title: STAT_LABELS[statKey],
                          description: `Score du pays : ${statRange.min} à ${statRange.max}`,
                          cells: [
                            <div key="min" className="flex items-center gap-2">
                              <input
                                aria-label={`Effet au score minimum pour ${STAT_LABELS[statKey]}`}
                                type="number"
                                value={ranges.min}
                                onChange={(e) => updateStatsDiceModifierRanges(statKey, "min", Number(e.target.value) ?? -10)}
                                className={`${inputClassNarrow} w-24`}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">points</span>
                            </div>,
                            <div key="max" className="flex items-center gap-2">
                              <input
                                aria-label={`Effet au score maximum pour ${STAT_LABELS[statKey]}`}
                                type="number"
                                value={ranges.max}
                                onChange={(e) => updateStatsDiceModifierRanges(statKey, "max", Number(e.target.value) ?? 20)}
                                className={`${inputClassNarrow} w-24`}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">points</span>
                            </div>,
                          ],
                        };
                      })}
                    />
                    <div
                      className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
                      style={{ borderColor: "var(--border-muted)" }}
                    >
                      <div className="max-w-[72ch]">
                        <h4 className="text-sm font-medium text-[var(--foreground)]">Le contexte vient de l’action</h4>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                          Le type d’action décide quelles statistiques entrent dans le jet. La relation, le rapport de force et les corrections du MJ peuvent ensuite modifier le résultat.
                        </p>
                      </div>
                      <a
                        href="/admin/actions-etat"
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Ouvrir les Actions d’État
                      </a>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
              {worldDateRule && worldDateAdvanceRule && (
                <CollapsibleBlock
                  id="rules-world-date"
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
                          className="h-5 w-5 shrink-0 rounded"
                        />
                        <label htmlFor="cron-paused" className="inline-flex min-h-11 items-center text-sm text-[var(--foreground)]">
                          Mettre les mises à jour automatiques en pause
                        </label>
                      </div>
                    )}
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Date affichée aux joueurs. Chaque jour de jeu, elle avance du nombre de mois choisi ci-dessous. À 0, elle reste figée.
                    </p>
                    <AdminParameterTable
                      label="Date et rythme du monde"
                      columns={["Valeur"]}
                      rows={[
                        {
                          key: "month",
                          title: "Mois affiché",
                          description: "Mois actuel visible par les joueurs.",
                          cells: [
                            <select
                              key="month"
                              aria-label="Mois du monde"
                              value={worldMonth}
                              onChange={(e) => updateValue(worldDateRule.id, { month: Number(e.target.value), year: worldYear })}
                              className="w-full max-w-48 rounded border px-3 py-2 text-sm"
                              style={{ borderColor: "var(--border)", background: "var(--background)" }}
                            >
                              {MOIS_LABELS.map((label, i) => (
                                <option key={i} value={i + 1}>{label}</option>
                              ))}
                            </select>,
                          ],
                        },
                        {
                          key: "year",
                          title: "Année affichée",
                          description: "Année actuelle visible par les joueurs.",
                          cells: [
                            <input
                              key="year"
                              aria-label="Année du monde"
                              type="number"
                              min={1}
                              max={9999}
                              value={worldYear}
                              onChange={(e) => updateValue(worldDateRule.id, {
                                month: worldMonth,
                                year: Math.max(1, Math.min(9999, Number(e.target.value) || 2025)),
                              })}
                              className={`${inputClassNarrow} w-28`}
                              style={inputStyle}
                            />,
                          ],
                        },
                        {
                          key: "advance",
                          title: "Avance à chaque jour de jeu",
                          description: "À 0, la date reste figée.",
                          cells: [
                            <div key="advance" className="flex items-center gap-2">
                              <input
                                aria-label="Mois avancés par mise à jour"
                                type="number"
                                min={0}
                                max={12}
                                value={worldAdvance}
                                onChange={(e) => updateValue(
                                  worldDateAdvanceRule.id,
                                  Math.max(0, Math.min(12, Math.round(Number(e.target.value)) || 0))
                                )}
                                className={`${inputClassNarrow} w-24`}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">mois</span>
                            </div>,
                          ],
                        },
                      ]}
                    />
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          {items.length > 0 && (
          <CollapsibleBlock
            id="rules-laws"
            title="Lois"
            infoContent={<TooltipBody text="Réglages des ministères, du budget et de la mobilisation. Ils influencent directement l'évolution des pays." />}
            open={loisOpen}
            onToggle={() => setLoisOpen((o) => !o)}
            variant="section"
          >
          <CollapsibleBlock
            id="rules-budgets"
            title="Budgets des ministères"
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
              const adaptedEffectCount = getEffectsListForMinistry(key, val).filter((effect) =>
                effect.gravity_applies ??
                BUDGET_EFFECT_TYPES.find((type) => type.id === effect.effect_type)?.defaultGravityApplies ??
                false
              ).length;
              const isOpen = budgetMinistryOpen[key] ?? false;
              return (
                <CollapsibleBlock
                  key={r.id}
                  title={BUDGET_MINISTRY_LABELS[key] ?? key}
                  description="Seuil de financement et effets quotidiens produits par ce ministère."
                  impact="Chaque jour"
                  open={isOpen}
                  onToggle={() =>
                    setBudgetMinistryOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }))
                  }
                >
                  <div className="p-3 space-y-3" style={{ borderColor: "var(--border-muted)" }}>
                    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">
                          <FormLabel label="Financement minimal (%)" tooltip="Part du budget à atteindre pour que ce ministère produise correctement ses effets positifs." />
                        </label>
                        <input
                          aria-label={`Financement minimal pour ${BUDGET_MINISTRY_LABELS[key] ?? key}`}
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
                          <FormLabel label="Prise en compte de l’écart mondial (%)" tooltip="Part de l’écart à la moyenne mondiale répercutée sur les effets adaptés. 0 % donne le même effet à tous ; 100 % prend tout l’écart en compte." />
                        </label>
                        <input
                          aria-label={`Prise en compte de l’écart mondial pour ${BUDGET_MINISTRY_LABELS[key] ?? key}`}
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
                    <BudgetWorldGapPreview
                      weight={val.gravity_pct ?? 50}
                      adaptedEffectCount={adaptedEffectCount}
                    />
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-[var(--foreground-muted)]">
                          <TitleWithInfo title="Effets du ministère" tooltip="Chaque ligne indique ce que le ministère améliore, ce qu’il pénalise en cas de sous-financement et si la moyenne mondiale modifie cet effet." className="inline-flex items-center gap-1.5" />
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
                                  <FormLabel label="Domaine influencé" tooltip="Choisit ce que le ministère influence : population, PIB ou l’une des statistiques du pays." />
                                </label>
                                <select
                                  aria-label={`Type de l’effet ${idx + 1} pour ${BUDGET_MINISTRY_LABELS[key] ?? key}`}
                                  value={effect.effect_type}
                                  onChange={(e) => {
                                    const v = e.target.value as BudgetMinistryEffectDef["effect_type"];
                                    const patch: Partial<BudgetMinistryEffectDef> = { effect_type: v };
                                    if (v === "bilateral_relations") {
                                      patch.relation_scope = "world";
                                      patch.relation_band_min = -100;
                                      patch.relation_band_max = 100;
                                    }
                                    updateBudgetEffectAt(r, idx, patch);
                                  }}
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
                                  aria-label={`Bonus de l’effet ${idx + 1} pour ${BUDGET_MINISTRY_LABELS[key] ?? key}`}
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
                                  aria-label={`Malus de l’effet ${idx + 1} pour ${BUDGET_MINISTRY_LABELS[key] ?? key}`}
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
                                  <FormLabel label="Tenir compte de la moyenne mondiale" tooltip="Si activé, un pays sous la moyenne reçoit davantage de bonus et subit moins de malus. Un pays au-dessus connaît l’effet inverse." />
                                </label>
                              </div>
                              {effect.effect_type === "bilateral_relations" && (
                                <>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-xs text-[var(--foreground-muted)]">
                                      <FormLabel label="Portée" tooltip="Cibles dont la relation avec le pays sera modifiée chaque jour (si la valeur actuelle est dans la plage ci-dessous)." />
                                    </label>
                                    <select
                                      aria-label={`Portée relationnelle de l’effet ${idx + 1}`}
                                      value={(effect.relation_scope as BilateralRelationScope) ?? "world"}
                                      onChange={(e) =>
                                        updateBudgetEffectAt(r, idx, { relation_scope: e.target.value as BilateralRelationScope })
                                      }
                                      className={`${inputClassNarrow} min-w-40`}
                                      style={inputStyle}
                                    >
                                      {(Object.keys(BILATERAL_RELATION_SCOPE_LABELS) as BilateralRelationScope[]).map((sc) => (
                                        <option key={sc} value={sc}>
                                          {BILATERAL_RELATION_SCOPE_LABELS[sc]}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-xs text-[var(--foreground-muted)]">
                                      <FormLabel label="Rel. min" tooltip="Niveau de relation (-100 à 100) en dessous duquel l'effet ne s'applique pas." />
                                    </label>
                                    <input
                                      aria-label={`Relation minimale de l’effet ${idx + 1}`}
                                      type="number"
                                      min={-100}
                                      max={100}
                                      step={1}
                                      value={effect.relation_band_min ?? -100}
                                      onChange={(e) =>
                                        updateBudgetEffectAt(r, idx, { relation_band_min: Math.round(Number(e.target.value)) || -100 })
                                      }
                                      className={`${inputClassNarrow} w-16`}
                                      style={inputStyle}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-xs text-[var(--foreground-muted)]">
                                      <FormLabel label="Rel. max" tooltip="Niveau de relation au-dessus duquel l'effet ne s'applique pas." />
                                    </label>
                                    <input
                                      aria-label={`Relation maximale de l’effet ${idx + 1}`}
                                      type="number"
                                      min={-100}
                                      max={100}
                                      step={1}
                                      value={effect.relation_band_max ?? 100}
                                      onChange={(e) =>
                                        updateBudgetEffectAt(r, idx, { relation_band_max: Math.round(Number(e.target.value)) || 100 })
                                      }
                                      className={`${inputClassNarrow} w-16`}
                                      style={inputStyle}
                                    />
                                  </div>
                                </>
                              )}
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
                <TitleWithInfo title="Tester un budget" tooltip="Prévisualisez les effets d’un ministère selon son budget et la situation du pays par rapport au reste du monde." className="inline-flex items-center gap-2" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                    <FormLabel label="Ministère" tooltip="Choisit quel ministère vous souhaitez tester dans le simulateur." />
                  </label>
                  <select
                    aria-label="Ministère à simuler"
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
                    <FormLabel label="Valeur du pays dans le domaine testé" tooltip="Valeur actuelle estimée du pays sur le domaine testé, avant application du ministère." />
                  </label>
                  <input
                    aria-label="Valeur de base du pays simulé"
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
                    <FormLabel label="Moyenne mondiale du même domaine" tooltip="Référence comparée à la valeur du pays pour adapter les effets qui tiennent compte de la moyenne mondiale." />
                  </label>
                  <input
                    aria-label="Moyenne mondiale simulée"
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
                  <FormLabel label="Part du budget (%)" tooltip="Part du budget total donnée à ce ministère dans le test. Cela permet de simuler un sous-financement ou un effort volontaire." />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Allocation budgétaire simulée"
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
                <div className="text-xs font-medium text-[var(--foreground-muted)]">Résultat quotidien (estimation mensuelle : × 30)</div>
                <ul className="mt-1 list-none space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                  {bonusesPerDay.map(({ key, line }) => (
                    <li key={key}>{line}</li>
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
            const recrutement = (raw.recrutement as Record<string, number>) ?? { min_points_per_tick: 1, max_points_per_tick: 10, points_per_pct_defense: 0 };
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
                id="rules-military-staff"
                key="etat_major"
                title="État-major"
                infoContent={<TooltipBody text="Points gagnés chaque jour pour concevoir, recruter, stocker et acheter des unités militaires." />}
                open={etatMajorOpen}
                onToggle={() => setEtatMajorOpen((o) => !o)}
              >
                <div className="p-3">
                  <AdminParameterTable
                    label="Progression quotidienne de l’État-major"
                    columns={["Base ou minimum quotidien", "Maximum quotidien", "Gain par 1 % de budget"]}
                    rows={[
                      {
                        key: "design",
                        title: "Conception des unités",
                        description: "Progression soutenue par l’industrie.",
                        cells: [
                          <div key="min" className="flex items-center gap-2">
                            <input aria-label="Minimum quotidien de conception" type="number" min={0} step={0.5} value={design.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("design", "min_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          <div key="max" className="flex items-center gap-2">
                            <input aria-label="Maximum quotidien de conception" type="number" min={0} step={0.5} value={design.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("design", "max_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          null,
                        ],
                      },
                      {
                        key: "recruitment",
                        title: "Recrutement",
                        description: "Progression soutenue par le militarisme et le budget Défense.",
                        cells: [
                          <div key="min" className="flex items-center gap-2">
                            <input aria-label="Minimum quotidien de recrutement" type="number" min={0} step={0.5} value={recrutement.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("recrutement", "min_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          <div key="max" className="flex items-center gap-2">
                            <input aria-label="Maximum quotidien de recrutement" type="number" min={0} step={0.5} value={recrutement.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("recrutement", "max_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          <div key="budget" className="flex items-center gap-2">
                            <input aria-label="Gain de recrutement par pourcentage du budget Défense" type="number" min={0} step={0.01} value={recrutement.points_per_pct_defense ?? 0} onChange={(e) => updateEtatMajor("recrutement", "points_per_pct_defense", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">point</span>
                          </div>,
                        ],
                      },
                      {
                        key: "stock",
                        title: "Stock stratégique",
                        description: "Progression soutenue par la science.",
                        cells: [
                          <div key="min" className="flex items-center gap-2">
                            <input aria-label="Minimum quotidien du stock stratégique" type="number" min={0} step={0.5} value={stock.min_points_per_tick ?? 1} onChange={(e) => updateEtatMajor("stock", "min_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          <div key="max" className="flex items-center gap-2">
                            <input aria-label="Maximum quotidien du stock stratégique" type="number" min={0} step={0.5} value={stock.max_points_per_tick ?? 10} onChange={(e) => updateEtatMajor("stock", "max_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          null,
                        ],
                      },
                      {
                        key: "procurement",
                        title: "Procuration",
                        description: "Progression directement liée au budget affecté.",
                        cells: [
                          <div key="base" className="flex items-center gap-2">
                            <input aria-label="Base quotidienne de procuration" type="number" min={0} step={0.5} value={procuration.base_points_per_tick ?? 0} onChange={(e) => updateEtatMajor("procuration", "base_points_per_tick", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                          </div>,
                          null,
                          <div key="budget" className="flex items-center gap-2">
                            <input aria-label="Gain de procuration par pourcentage du budget" type="number" min={0} step={0.1} value={procuration.points_per_pct_budget ?? 0.5} onChange={(e) => updateEtatMajor("procuration", "points_per_pct_budget", Number(e.target.value) || 0)} className={inputClassNarrow} style={inputStyle} />
                            <span className="text-xs text-[var(--foreground-muted)]">point</span>
                          </div>,
                        ],
                      },
                    ]}
                  />
                </div>
              </CollapsibleBlock>
            );
          })()}

          {LAW_DEFINITIONS.map((def) => {
            const configRule = getLawConfigRule(def);
            const effectsRule = getLawEffectsRule(def);
            if (!configRule || !effectsRule) return null;
            const isOpen = lawSectionsOpen[def.lawKey] ?? false;
            const lawConfig = getLawConfig(def);
            return (
              <CollapsibleBlock
                key={def.lawKey}
                title={def.title_fr}
                description={`Seuils, vitesse de progression et conséquences de la loi « ${def.title_fr} ».`}
                impact="Prochaine mise à jour"
                infoContent={<TooltipBody text={`Seuils, pas quotidien et effets par palier pour la loi « ${def.title_fr} ».`} />}
                open={isOpen}
                onToggle={() => setLawSectionsOpen((o) => ({ ...o, [def.lawKey]: !o[def.lawKey] }))}
              >
                <div className="p-3 space-y-4">
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Après enregistrement, les changements seront appliqués lors de la prochaine mise à jour quotidienne.
                  </p>
                  <LawThresholdRulePreview
                    levels={def.levels}
                    thresholds={lawConfig.level_thresholds ?? {}}
                    dailyStep={Number(lawConfig.daily_step ?? 20)}
                  />
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
                      Chaque seuil indique à partir de quel score le pays entre dans ce palier.
                    </p>
                    <AdminParameterTable
                      label={`Seuils des paliers de la loi ${def.title_fr}`}
                      columns={["Score d’entrée"]}
                      rows={def.levels.map((level) => {
                        const config = getLawConfig(def);
                        const thresholds = config.level_thresholds ?? {};
                        const val = thresholds[level.key] ?? 0;
                        return {
                          key: level.key,
                          title: level.label,
                          cells: [
                            <div key={level.key} className="flex items-center gap-2">
                            <input
                              aria-label={`Seuil du palier ${level.label}`}
                              type="number"
                              min={0}
                              max={500}
                              value={val}
                              onChange={(e) => updateLawThreshold(def, level.key, Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                              <span className="text-xs text-[var(--foreground-muted)]">sur 500</span>
                            </div>,
                          ],
                        };
                      })}
                    />
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
                                    aria-label={`Type de l’effet ${idx + 1} du palier ${level.label}`}
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
                                      aria-label={`Statistique ciblée par l’effet ${idx + 1}`}
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
                                      aria-label={`Ministère ciblé par l’effet ${idx + 1}`}
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
                                      aria-label={`Branche ciblée par l’effet ${idx + 1}`}
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
                                      aria-label={`Unité ciblée par l’effet ${idx + 1}`}
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
                                      aria-label={`Sous-branche ciblée par l’effet ${idx + 1}`}
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
              id="rules-diplomacy"
              title="Diplomatie"
              infoContent={<TooltipBody text="Relations entre pays : perception mutuelle, influence, emprise et effets de voisinage." />}
              open={diplomatieOpen}
              onToggle={() => setDiplomatieOpen((o) => !o)}
              variant="section"
            >
              <CollapsibleBlock
                id="rules-relations"
                title="Matrice diplomatique"
                infoContent={<TooltipBody text="Valeur de la relation entre deux pays. Elle sert aux événements automatiques et au calcul des idéologies." />}
                open={matriceOpen}
                onToggle={() => setMatriceOpen((o) => !o)}
              >
                <div className="p-3">
                  <MatriceDiplomatiqueForm countries={countriesForMatrice} relationMap={relationMapForMatrice} />
                </div>
              </CollapsibleBlock>
              {items.length > 0 && influenceConfigRule && (
                <CollapsibleBlock
                  id="rules-influence"
                  title="Influence"
                  infoContent={<TooltipBody text="Calcul du poids international : PIB, population, puissance militaire et stabilité." />}
                  open={influenceOpen}
                  onToggle={() => setInfluenceOpen((o) => !o)}
                >
                  <div className="space-y-5 p-3">
                    <p className="max-w-[72ch] text-xs leading-relaxed text-[var(--foreground-muted)]">
                      L’économie, la population et l’armée produisent d’abord des points d’influence. La stabilité modifie ensuite leur total.
                    </p>

                    <section>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">Contribution de base</h4>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Les unités de référence évitent les coefficients techniques. Les flèches des champs utilisent maintenant des pas raisonnables.
                      </p>
                      <div className="mt-3">
                        <AdminParameterTable
                          label="Contribution de base à l’influence"
                          columns={["Points d’influence"]}
                          rows={[
                            {
                              key: "gdp",
                              title: "1 000 milliards de PIB",
                              cells: [
                                <div key="gdp" className="flex items-center gap-2">
                            <input
                              aria-label="Influence produite par 1 000 milliards de PIB"
                              type="number"
                              min={0}
                              step={50}
                              value={influencePointsForReference(getInfluenceConfig().mult_gdp, 1e-9, GDP_INFLUENCE_REFERENCE)}
                              onChange={(event) => updateInfluenceConfig({
                                mult_gdp: (Number(event.target.value) || 0) / GDP_INFLUENCE_REFERENCE,
                              })}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                                </div>,
                              ],
                            },
                            {
                              key: "population",
                              title: "10 millions d’habitants",
                              cells: [
                                <div key="population" className="flex items-center gap-2">
                            <input
                              aria-label="Influence produite par 10 millions d’habitants"
                              type="number"
                              min={0}
                              step={10}
                              value={influencePointsForReference(getInfluenceConfig().mult_population, 1e-7, POPULATION_INFLUENCE_REFERENCE)}
                              onChange={(event) => updateInfluenceConfig({
                                mult_population: (Number(event.target.value) || 0) / POPULATION_INFLUENCE_REFERENCE,
                              })}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                                </div>,
                              ],
                            },
                            {
                              key: "military",
                              title: "100 points de puissance militaire",
                              cells: [
                                <div key="military" className="flex items-center gap-2">
                            <input
                              aria-label="Influence produite par 100 points de puissance militaire"
                              type="number"
                              min={0}
                              step={5}
                              value={influencePointsForReference(getInfluenceConfig().mult_military, 0.01, MILITARY_INFLUENCE_REFERENCE)}
                              onChange={(event) => updateInfluenceConfig({
                                mult_military: (Number(event.target.value) || 0) / MILITARY_INFLUENCE_REFERENCE,
                              })}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                            <span className="text-xs text-[var(--foreground-muted)]">points</span>
                                </div>,
                              ],
                            },
                          ]}
                        />
                      </div>
                    </section>

                    <section className="border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">Effet de la stabilité</h4>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Ce pourcentage est appliqué au total obtenu ci-dessus. Une stabilité intermédiaire produit une valeur intermédiaire.
                      </p>
                      <div className="mt-3">
                        <AdminParameterTable
                          label="Effet de la stabilité sur l’influence"
                          columns={["Influence finale"]}
                          rows={[
                            {
                              key: "stability-min",
                              title: "Stabilité à −3",
                              cells: [
                                <div key="stability-min" className="flex items-center gap-2">
                            <input
                              aria-label="Pourcentage d’influence conservé avec une stabilité de moins 3"
                              type="number"
                              min={0}
                              step={5}
                              value={influenceMultiplierPercent(getInfluenceConfig().stability_modifier_min, 0)}
                              onChange={(event) => updateInfluenceConfig({
                                stability_modifier_min: (Number(event.target.value) || 0) / 100,
                              })}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                            <span className="text-xs text-[var(--foreground-muted)]">% de la base</span>
                                </div>,
                              ],
                            },
                            {
                              key: "stability-max",
                              title: "Stabilité à +3",
                              cells: [
                                <div key="stability-max" className="flex items-center gap-2">
                            <input
                              aria-label="Pourcentage d’influence conservé avec une stabilité de plus 3"
                              type="number"
                              min={0}
                              step={5}
                              value={influenceMultiplierPercent(getInfluenceConfig().stability_modifier_max, 1)}
                              onChange={(event) => updateInfluenceConfig({
                                stability_modifier_max: (Number(event.target.value) || 0) / 100,
                              })}
                              className={inputClassNarrow}
                              style={inputStyle}
                            />
                            <span className="text-xs text-[var(--foreground-muted)]">% de la base</span>
                                </div>,
                              ],
                            },
                          ]}
                        />
                      </div>
                    </section>

                    <section className="border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">
                        Correction des écarts avec la moyenne mondiale
                      </h4>
                      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-[var(--foreground-muted)]">
                        Cette correction rapproche les contributions des pays sans créer une nouvelle source d’influence. Un pays à la moyenne reste toujours à ×1,00. À 0 %, les écarts restent bruts ; à 100 %, la correction est maximale.
                      </p>
                      <div className="mt-3 grid gap-5 lg:grid-cols-3">
                        <InfluenceWorldGapControl
                          id="influence-gap-gdp"
                          label="PIB"
                          value={getInfluenceConfig().gravity_pct_gdp ?? 50}
                          onChange={(value) => updateInfluenceConfig({ gravity_pct_gdp: value })}
                        />
                        <InfluenceWorldGapControl
                          id="influence-gap-population"
                          label="Population"
                          value={getInfluenceConfig().gravity_pct_population ?? 50}
                          onChange={(value) => updateInfluenceConfig({ gravity_pct_population: value })}
                        />
                        <InfluenceWorldGapControl
                          id="influence-gap-military"
                          label="Puissance militaire"
                          value={getInfluenceConfig().gravity_pct_military ?? 50}
                          onChange={(value) => updateInfluenceConfig({ gravity_pct_military: value })}
                        />
                      </div>
                    </section>
                    <InfluenceRulePreview config={getInfluenceConfig()} />
                  </div>
                </CollapsibleBlock>
              )}
              {items.length > 0 && sphereInfluencePctRule && (
                <CollapsibleBlock
                  id="rules-control"
                  title="Sphère"
                  infoContent={
                    <TooltipBody
                      text={<strong>Règle la part d&apos;influence transférée du pays contrôlé vers le pays contrôleur.</strong>}
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
                      Pour chaque statut, choisissez la part de l&apos;influence du pays contrôlé transférée au pays contrôleur.
                    </p>
                    <AdminParameterTable
                      label="Influence transférée selon le statut de contrôle"
                      columns={["Part transférée"]}
                      rows={[
                        {
                          key: "contested",
                          title: "Contesté",
                          description: "Le contrôle du pays reste partagé ou disputé.",
                          cells: [
                            <div key="value" className="flex items-center gap-2">
                              <input aria-label="Part d’influence transférée si le contrôle est contesté" type="number" min={0} max={100} value={getSphereInfluencePct().contested ?? 50} onChange={(e) => updateSphereInfluencePct({ contested: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={inputClassNarrow} style={inputStyle} />
                              <span className="text-xs text-[var(--foreground-muted)]">%</span>
                            </div>,
                          ],
                        },
                        {
                          key: "occupied",
                          title: "Occupé",
                          description: "Le pays est entièrement contrôlé, sans être annexé.",
                          cells: [
                            <div key="value" className="flex items-center gap-2">
                              <input aria-label="Part d’influence transférée si le pays est occupé" type="number" min={0} max={100} value={getSphereInfluencePct().occupied ?? 80} onChange={(e) => updateSphereInfluencePct({ occupied: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={inputClassNarrow} style={inputStyle} />
                              <span className="text-xs text-[var(--foreground-muted)]">%</span>
                            </div>,
                          ],
                        },
                        {
                          key: "annexed",
                          title: "Annexé",
                          description: "Le pays est intégré au territoire du contrôleur.",
                          cells: [
                            <div key="value" className="flex items-center gap-2">
                              <input aria-label="Part d’influence transférée si le pays est annexé" type="number" min={0} max={100} value={getSphereInfluencePct().annexed ?? 100} onChange={(e) => updateSphereInfluencePct({ annexed: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={inputClassNarrow} style={inputStyle} />
                              <span className="text-xs text-[var(--foreground-muted)]">%</span>
                            </div>,
                          ],
                        },
                      ]}
                    />
                    <SphereRulePreview values={getSphereInfluencePct()} />
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          {items.length > 0 && (ideologyConfigRule || ideologyEffectsRule) && (
            <CollapsibleBlock
              id="rules-ideology"
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
                <AdminParameterTable
                  label="Calcul quotidien de l’idéologie"
                  columns={["Coefficient"]}
                  rows={[
                    {
                      key: "daily-step",
                      title: "Vitesse quotidienne",
                      description: "Part du déplacement calculé qui est réellement appliquée chaque jour.",
                      cells: [
                        <input
                          key="daily-step"
                          aria-label="Vitesse quotidienne de l’idéologie"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().daily_step}
                          onChange={(e) => updateIdeologyConfig({ daily_step: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.daily_step })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                    {
                      key: "neighbor-pull",
                      title: "Pression des pays voisins",
                      description: "Force de base avec laquelle les idéologies voisines attirent le pays.",
                      cells: [
                        <input
                          key="neighbor-pull"
                          aria-label="Pression idéologique des pays voisins"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().neighbor_pull_weight}
                          onChange={(e) => updateIdeologyConfig({ neighbor_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.neighbor_pull_weight })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                    {
                      key: "effect-pull",
                      title: "Effets idéologiques actifs",
                      description: "Importance des lois, avantages et autres effets qui poussent une idéologie.",
                      cells: [
                        <input
                          key="effect-pull"
                          aria-label="Poids des effets idéologiques actifs"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().effect_pull_weight}
                          onChange={(e) => updateIdeologyConfig({ effect_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.effect_pull_weight })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                  ]}
                />
                <AdminParameterTable
                  label="Modificateurs du déplacement idéologique"
                  columns={["Coefficient"]}
                  rows={[
                    {
                      key: "relation-pull",
                      title: "Relations diplomatiques",
                      description: "Une bonne relation renforce l’attraction d’un voisin ; une mauvaise la réduit.",
                      cells: [
                        <input
                          key="relation-pull"
                          aria-label="Poids des relations diplomatiques"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().relation_pull_weight}
                          onChange={(e) => updateIdeologyConfig({ relation_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.relation_pull_weight })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                    {
                      key: "influence-pull",
                      title: "Influence internationale",
                      description: "Les voisins influents pèsent davantage dans le déplacement.",
                      cells: [
                        <input
                          key="influence-pull"
                          aria-label="Poids de l’influence internationale"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().influence_pull_weight}
                          onChange={(e) => updateIdeologyConfig({ influence_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.influence_pull_weight })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                    {
                      key: "control-pull",
                      title: "Contrôle territorial",
                      description: "L’occupation et l’annexion renforcent l’empreinte idéologique du pays dominant.",
                      cells: [
                        <input
                          key="control-pull"
                          aria-label="Poids du contrôle territorial"
                          type="number"
                          step="0.01"
                          value={getIdeologyConfigValue().control_pull_weight}
                          onChange={(e) => updateIdeologyConfig({ control_pull_weight: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.control_pull_weight })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                    {
                      key: "snap-strength",
                      title: "Impulsions ponctuelles",
                      description: "Amplifie les chocs brusques par rapport aux influences progressives.",
                      cells: [
                        <input
                          key="snap-strength"
                          aria-label="Force des impulsions idéologiques"
                          type="number"
                          step="0.1"
                          value={getIdeologyConfigValue().snap_strength}
                          onChange={(e) => updateIdeologyConfig({ snap_strength: Number(e.target.value) || DEFAULT_IDEOLOGY_CONFIG.snap_strength })}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />,
                      ],
                    },
                  ]}
                />
                <IdeologyRulePreview
                  config={getIdeologyConfigValue()}
                  sphere={getSphereInfluencePct()}
                />
                </>
                )}
                {ideologyEffectsRule && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-[var(--foreground)]">Effets par idéologie (valeur à 100 %)</h4>
                    {IDEOLOGY_IDS.map((ideologyId) => {
                      const list = getIdeologyEffectsForIdeology(ideologyId);
                      const formOpenForThis = ideologyEffectFormOpen && ideologyEffectFormIdeologyId === ideologyId;
                      return (
                        <div key={ideologyId} className="rounded border p-2 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                          <div className="text-xs font-medium text-[var(--foreground-muted)]">{IDEOLOGY_LABELS[ideologyId]}</div>
                          {list.length > 0 ? (
                            <div
                              className="rounded-md border py-2 pl-2.5 pr-2"
                              style={{
                                borderColor: "var(--border-muted)",
                                background: "var(--background-elevated)",
                              }}
                            >
                              <div className="mb-1.5 text-xs font-semibold text-[var(--accent)]">Effets</div>
                              <ul className="list-none space-y-2 text-sm leading-relaxed">
                                {list.map((e, idx) => (
                                  <li
                                    key={idx}
                                    className="flex flex-col gap-1 border-b border-[var(--border-muted)] pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                                  >
                                    <span className="min-w-0 break-words">{labelForIdeologyEffect(e)}</span>
                                    <div className="flex shrink-0 gap-2">
                                      <button type="button" onClick={() => openEditIdeologyEffect(ideologyId, idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                                      <button type="button" onClick={() => removeIdeologyEffect(ideologyId, idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed px-2.5 py-2 text-xs text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>
                              Aucun effet configuré pour cette idéologie.
                            </div>
                          )}
                          {!formOpenForThis ? (
                            <button type="button" onClick={() => openAddIdeologyEffect(ideologyId)} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                          ) : (
                            <div className="rounded border p-3 space-y-2 mt-2" style={{ borderColor: "var(--border-muted)" }}>
                              <div>
                                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d'effet</label>
                                <select aria-label="Type d’effet idéologique" value={ideologyEffectKind} onChange={(ev) => { const k = ev.target.value; setIdeologyEffectKind(k); setIdeologyEffectTarget(getDefaultTargetForKindIdeology(k)); }} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
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
                                  <select aria-label="Statistique ciblée par l’effet idéologique" value={ideologyEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_BUDGET_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label>
                                  <select aria-label="Ministère ciblé par l’effet idéologique" value={ideologyEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_BRANCH_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label>
                                  <select aria-label="Branche ciblée par l’effet idéologique" value={ideologyEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label>
                                  <select aria-label="Unité ciblée par l’effet idéologique" value={ideologyEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}
                                  </select>
                                </div>
                              )}
                              {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(ideologyEffectKind) && (
                                <div>
                                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Sous-branche/type</label>
                                  <select aria-label="Sous-branche ciblée par l’effet idéologique" value={ideologyEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setIdeologyEffectTarget(ev.target.value || null)} className="w-full rounded border py-1.5 px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                                    {subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getIdeologyEffectFormValueHelper(ideologyEffectKind).valueLabel}</label>
                                <input aria-label={getIdeologyEffectFormValueHelper(ideologyEffectKind).valueLabel} type="number" step={getIdeologyEffectFormValueHelper(ideologyEffectKind).valueStep} value={ideologyEffectValue} onChange={(e) => setIdeologyEffectValue(e.target.value)} className="w-32 rounded border py-1.5 px-2 text-sm font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                              </div>
                              <div className="flex flex-wrap gap-2">
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
              id="rules-ai"
              title="Pays gérés par l’IA"
              infoContent={<TooltipBody text="Rythme de création des événements et effets permanents pour les puissances majeures et mineures sans joueur." />}
              open={aiOpen}
              onToggle={() => setAiOpen((o) => !o)}
              variant="section"
            >
              <div className="p-3 space-y-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Effets appliqués aux pays sans joueur selon leur statut IA (Majeur / Mineur) défini dans la liste admin des pays.
                </p>

                {aiEventsConfigRule && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Génération des événements IA</h4>
                    <AdminParameterTable
                      label="Cadence et volume des événements IA"
                      columns={["Valeur"]}
                      rows={[
                        {
                          key: "interval",
                          title: "Délai entre deux passages",
                          description: "Temps minimum avant que le système tente de créer de nouveaux événements.",
                          cells: [
                            <div key="interval" className="flex items-center gap-2">
                              <input
                                aria-label="Délai entre deux passages des événements IA"
                                type="number"
                                min={0.01}
                                max={168}
                                step={0.001}
                                value={getAiEventsConfig().interval_hours ?? 1}
                                onChange={(e) => updateAiEventsConfig({ interval_hours: Math.max(0.01, Number(e.target.value) || 0.01) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">heures</span>
                            </div>,
                          ],
                        },
                        {
                          key: "major-count",
                          title: "Grandes puissances IA",
                          description: "Nombre d’actions majeures créées à chaque passage.",
                          cells: [
                            <div key="major-count" className="flex items-center gap-2">
                              <input
                                aria-label="Actions des grandes puissances IA par passage"
                                type="number"
                                min={0}
                                value={getAiEventsConfig().count_major_per_run ?? 0}
                                onChange={(e) => updateAiEventsConfig({ count_major_per_run: Math.max(0, Number(e.target.value) || 0) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">actions</span>
                            </div>,
                          ],
                        },
                        {
                          key: "minor-count",
                          title: "Puissances secondaires IA",
                          description: "Nombre d’actions mineures créées à chaque passage.",
                          cells: [
                            <div key="minor-count" className="flex items-center gap-2">
                              <input
                                aria-label="Actions des puissances secondaires IA par passage"
                                type="number"
                                min={0}
                                value={getAiEventsConfig().count_minor_per_run ?? 0}
                                onChange={(e) => updateAiEventsConfig({ count_minor_per_run: Math.max(0, Number(e.target.value) || 0) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">actions</span>
                            </div>,
                          ],
                        },
                        {
                          key: "amplitude",
                          title: "Décalage aléatoire",
                          description: "Évite que toutes les actions partent exactement à l’heure théorique.",
                          cells: [
                            <div key="amplitude" className="flex items-center gap-2">
                              <input
                                aria-label="Décalage aléatoire des événements IA"
                                type="number"
                                min={0}
                                value={getAiEventsConfig().trigger_amplitude_minutes ?? 0}
                                onChange={(e) => updateAiEventsConfig({ trigger_amplitude_minutes: Math.max(0, Number(e.target.value) || 0) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">minutes</span>
                            </div>,
                          ],
                        },
                      ]}
                    />
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
                    <AiRulePreview config={getAiEventsConfig()} />
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
                          <select aria-label="Type d’effet pour une IA majeure" value={aiMajorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMajorEffectKind(k); setAiMajorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {getEffectKindOptionGroups().map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Stat" tooltip={genericStatTooltip} /></label><select aria-label="Statistique ciblée pour une IA majeure" value={aiMajorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Ministère" tooltip={genericBudgetTooltip} /></label><select aria-label="Ministère ciblé pour une IA majeure" value={aiMajorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Branche" tooltip={genericBranchTooltip} /></label><select aria-label="Branche ciblée pour une IA majeure" value={aiMajorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Unité" tooltip={genericUnitTooltip} /></label><select aria-label="Unité ciblée pour une IA majeure" value={aiMajorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Sous-branche/type" tooltip="Branche et sous-type militaire." /></label><select aria-label="Sous-branche ciblée pour une IA majeure" value={aiMajorEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label={getEffectKindValueHelper(aiMajorEffectKind).valueLabel} tooltip={genericEffectValueTooltip} /></label><input aria-label={getEffectKindValueHelper(aiMajorEffectKind).valueLabel} type="number" step={getEffectKindValueHelper(aiMajorEffectKind).valueStep} value={aiMajorEffectValue} onChange={(e) => setAiMajorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
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
                          <select aria-label="Type d’effet pour une IA mineure" value={aiMinorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMinorEffectKind(k); setAiMinorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {getEffectKindOptionGroups().map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Stat" tooltip={genericStatTooltip} /></label><select aria-label="Statistique ciblée pour une IA mineure" value={aiMinorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Ministère" tooltip={genericBudgetTooltip} /></label><select aria-label="Ministère ciblé pour une IA mineure" value={aiMinorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Branche" tooltip={genericBranchTooltip} /></label><select aria-label="Branche ciblée pour une IA mineure" value={aiMinorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Unité" tooltip={genericUnitTooltip} /></label><select aria-label="Unité ciblée pour une IA mineure" value={aiMinorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label="Sous-branche/type" tooltip="Branche et sous-type militaire." /></label><select aria-label="Sous-branche ciblée pour une IA mineure" value={aiMinorEffectTarget ?? subTypeOptions[0]?.value ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{subTypeOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]"><FormLabel label={getEffectKindValueHelper(aiMinorEffectKind).valueLabel} tooltip={genericEffectValueTooltip} /></label><input aria-label={getEffectKindValueHelper(aiMinorEffectKind).valueLabel} type="number" step={getEffectKindValueHelper(aiMinorEffectKind).valueStep} value={aiMinorEffectValue} onChange={(e) => setAiMinorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
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
              id="rules-intelligence"
              title="Espionnage et renseignement"
              infoContent={<TooltipBody text="Brouillard de guerre : perte quotidienne de renseignement et gain après une action d’espionnage acceptée." />}
              open={intelOpen}
              onToggle={() => setIntelOpen((o) => !o)}
              variant="section"
            >
              <div className="p-4 space-y-4">
                <AdminParameterTable
                  label="Diminution et gain du renseignement"
                  columns={["Réglage"]}
                  rows={[
                    {
                      key: "decay-mode",
                      title: "Diminution quotidienne",
                      description: "Choisit comment le niveau baisse chaque jour sans nouvel espionnage.",
                      cells: [
                        <select
                          key="decay-mode"
                          aria-label="Mode de diminution du renseignement"
                          value={intelDecayMode}
                          onChange={(e) => updateIntelConfig({ decay_mode: e.target.value as "flat" | "pct" | "both" })}
                          className={`${inputClass} max-w-md`}
                          style={inputStyle}
                        >
                          <option value="flat">Retirer le même nombre de points</option>
                          <option value="pct">Retirer une part du niveau restant</option>
                          <option value="both">Retirer les points, puis le pourcentage</option>
                        </select>,
                      ],
                    },
                    ...(intelDecayMode !== "pct"
                      ? [{
                          key: "flat-decay",
                          title: "Perte fixe",
                          description: "Nombre de points retirés chaque jour, quel que soit le niveau restant.",
                          cells: [
                            <div key="flat-decay" className="flex items-center gap-2">
                              <input
                                aria-label="Points de renseignement perdus chaque jour"
                                type="number"
                                min={0}
                                step={0.5}
                                value={getIntelConfig().decay_flat_per_day ?? 2}
                                onChange={(e) => updateIntelConfig({ decay_flat_per_day: Math.max(0, Number(e.target.value) || 0) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">points par jour</span>
                            </div>,
                          ],
                        }]
                      : []),
                    ...(intelDecayMode !== "flat"
                      ? [{
                          key: "percent-decay",
                          title: "Perte proportionnelle",
                          description: "Part recalculée sur le niveau restant : à 5 %, 100 devient 95, puis 90,25.",
                          cells: [
                            <div key="percent-decay" className="flex items-center gap-2">
                              <input
                                aria-label="Part du renseignement restant perdue chaque jour"
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={getIntelConfig().decay_pct_per_day ?? 5}
                                onChange={(e) => updateIntelConfig({ decay_pct_per_day: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                                className={inputClassNarrow}
                                style={inputStyle}
                              />
                              <span className="text-xs text-[var(--foreground-muted)]">% par jour</span>
                            </div>,
                          ],
                        }]
                      : []),
                    {
                      key: "espionage-gain",
                      title: "Gain d’un espionnage parfait",
                      description: "Un impact de 70/100 donne 70 % de cette valeur.",
                      cells: [
                        <div key="espionage-gain" className="flex items-center gap-2">
                          <input
                            aria-label="Gain maximal de renseignement après un espionnage"
                            type="number"
                            min={0}
                            max={100}
                            value={getIntelConfig().espionage_intel_gain_base ?? 50}
                            onChange={(e) => updateIntelConfig({ espionage_intel_gain_base: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                            className={inputClassNarrow}
                            style={inputStyle}
                          />
                          <span className="text-xs text-[var(--foreground-muted)]">points</span>
                        </div>,
                      ],
                    },
                  ]}
                />
                <IntelRulePreview config={intelOverview} />
              </div>
            </CollapsibleBlock>
          )}

        </div>
      )}

      {items.length > 0 ? (
        <AdminSaveBar
          dirtyCount={dirtyItems.length}
          saving={saving}
          onSave={saveAll}
          onReset={resetAll}
          error={error}
          success={success}
        />
      ) : null}
    </div>
  );
}
