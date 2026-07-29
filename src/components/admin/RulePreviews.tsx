"use client";

import type { ReactNode } from "react";
import { computeInfluenceForAll, type InfluenceConfig } from "@/lib/influence";
import type { HardPowerByBranch } from "@/lib/hardPower";
import {
  computeStatModifierBreakdown,
  STATE_ACTION_STAT_RANGES,
} from "@/lib/stateActionModifiers";
import {
  computeWorldIdeologies,
  createZeroScores,
  IDEOLOGY_IDS,
  IDEOLOGY_LABELS,
  ideologyColumnName,
  relationKey,
  type IdeologyConfig,
  type IdeologyCountryInput,
  type SphereInfluencePct,
} from "@/lib/ideology";
import { formatGdp, formatNumber, formatPopulation } from "@/lib/format";

function PreviewFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 border-t pt-5" style={{ borderColor: "var(--border-muted)" }}>
      <div>
        <h4 className="text-sm font-semibold text-[var(--foreground)]">{title}</h4>
        <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-[var(--foreground-muted)]">
          {description}
        </p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function compact(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

const INFLUENCE_PROFILES = [
  {
    id: "fragile",
    label: "Pays fragile",
    gdp: 500_000_000_000,
    population: 20_000_000,
    military: 25,
    stability: -2,
  },
  {
    id: "moyen",
    label: "Puissance moyenne",
    gdp: 2_000_000_000_000,
    population: 60_000_000,
    military: 100,
    stability: 0,
  },
  {
    id: "fort",
    label: "Grande puissance",
    gdp: 5_000_000_000_000,
    population: 120_000_000,
    military: 250,
    stability: 2,
  },
] as const;

export function InfluenceRulePreview({ config }: { config: InfluenceConfig }) {
  const countries = INFLUENCE_PROFILES.map((profile) => ({
    id: profile.id,
    gdp: profile.gdp,
    population: profile.population,
    stability: profile.stability,
  }));
  const hardPower = new Map<string, HardPowerByBranch>(
    INFLUENCE_PROFILES.map((profile) => [
      profile.id,
      { terre: profile.military, air: 0, mer: 0, strategique: 0, total: profile.military },
    ])
  );
  const { byCountry } = computeInfluenceForAll(countries, hardPower, config);
  const results = INFLUENCE_PROFILES.map((profile) => ({
    profile,
    result: byCountry.get(profile.id)!,
  }));
  const maximum = Math.max(1, ...results.map(({ result }) => result.influence));
  const medium = results.find(({ profile }) => profile.id === "moyen")?.result.influence ?? 0;
  const strong = results.find(({ profile }) => profile.id === "fort")?.result.influence ?? 0;

  return (
    <PreviewFrame
      title="Conséquence en direct"
      description="Les trois profils restent identiques pendant que vous modifiez les poids ci-dessus. La moyenne mondiale de cet exemple est calculée entre eux ; le jeu utilise tous les pays."
    >
      <div className="space-y-5">
        {results.map(({ profile, result }) => {
          const stability = result.componentsAfterGravity.stabilityMultiplier;
          const segments = [
            {
              key: "gdp",
              label: "PIB",
              color: "var(--accent)",
              width: (result.componentsAfterGravity.gdp * stability / maximum) * 100,
            },
            {
              key: "population",
              label: "Population",
              color: "var(--warning)",
              width: (result.componentsAfterGravity.population * stability / maximum) * 100,
            },
            {
              key: "military",
              label: "Armée",
              color: "#60a5fa",
              width: (result.componentsAfterGravity.military * stability / maximum) * 100,
            },
          ];
          return (
            <div key={profile.id}>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">{profile.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                    PIB {formatGdp(profile.gdp)} · {formatPopulation(profile.population)} · armée {formatNumber(profile.military)} · stabilité {profile.stability > 0 ? "+" : ""}{profile.stability}
                  </p>
                </div>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Influence <strong className="text-base text-[var(--foreground)]">{compact(result.influence)}</strong>
                  <span className="ml-2">· stabilité ×{compact(stability)}</span>
                </p>
              </div>
              <div
                role="img"
                aria-label={`${profile.label} : influence ${compact(result.influence)}, composée du PIB, de la population et de l'armée`}
                className="mt-2 flex h-7 overflow-hidden rounded-md bg-[var(--background)]"
              >
                {segments.map((segment) => (
                  <span
                    key={segment.key}
                    title={`${segment.label} : ${compact(segment.width)} % de l’échelle`}
                    style={{ width: `${Math.max(0, segment.width)}%`, background: segment.color }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--foreground-muted)]">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />PIB</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--warning)]" />Population</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#60a5fa]" />Armée</span>
        <span className="text-[var(--foreground)]">
          La grande puissance vaut {medium > 0 ? `${compact(strong / medium)}×` : "—"} la puissance moyenne.
        </span>
      </div>
    </PreviewFrame>
  );
}

const STAT_LABELS: Record<string, string> = {
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
};

export function DiceModifierRulePreview({
  ranges,
}: {
  ranges: Record<string, { min: number; max: number }>;
}) {
  const maximumAbsolute = Math.max(
    1,
    ...Object.values(ranges).flatMap((range) => [Math.abs(range.min), Math.abs(range.max)])
  );

  return (
    <PreviewFrame
      title="Courbe des bonus et malus"
      description="Chaque ligne montre ce qu’ajoute une seule statistique au jet. Les bonus de plusieurs statistiques actives s’additionnent."
    >
      <div className="space-y-4">
        {Object.entries(STAT_LABELS).map(([key, label]) => {
          const statRange = STATE_ACTION_STAT_RANGES[key];
          const ruleRange = ranges[key] ?? { min: 0, max: 0 };
          const middleValue = (statRange.min + statRange.max) / 2;
          const samples = [statRange.min, middleValue, statRange.max].map((value) =>
            computeStatModifierBreakdown({ [key]: ruleRange }, { [key]: value }).byStat[key]
          );
          const y = (value: number) => 35 - (value / maximumAbsolute) * 25;
          const points = `10,${y(samples[0])} 150,${y(samples[1])} 290,${y(samples[2])}`;
          return (
            <div key={key} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
              <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
              <div>
                <svg
                  viewBox="0 0 300 70"
                  role="img"
                  aria-label={`${label} : ${samples[0]} avec une valeur faible, ${samples[1]} au milieu, ${samples[2]} avec une valeur forte`}
                  className="h-16 w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <line x1="0" y1="35" x2="300" y2="35" stroke="var(--border-muted)" strokeWidth="1" />
                  <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                  {[10, 150, 290].map((x, index) => (
                    <circle key={x} cx={x} cy={y(samples[index])} r="5" fill="var(--background-panel)" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                <div className="grid grid-cols-3 gap-2 text-xs text-[var(--foreground-muted)]">
                  <span>Faible : <strong className="text-[var(--foreground)]">{samples[0] > 0 ? "+" : ""}{samples[0]}</strong></span>
                  <span className="text-center">Moyenne : <strong className="text-[var(--foreground)]">{samples[1] > 0 ? "+" : ""}{samples[1]}</strong></span>
                  <span className="text-right">Forte : <strong className="text-[var(--foreground)]">{samples[2] > 0 ? "+" : ""}{samples[2]}</strong></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PreviewFrame>
  );
}

export function SphereRulePreview({
  values,
}: {
  values: { contested?: number; occupied?: number; annexed?: number };
}) {
  const rows = [
    { key: "contested", label: "Contesté", detail: "Contrôle partagé", value: values.contested ?? 50 },
    { key: "occupied", label: "Occupé", detail: "Contrôle total sans annexion", value: values.occupied ?? 80 },
    { key: "annexed", label: "Annexé", detail: "Intégration complète", value: values.annexed ?? 100 },
  ];
  return (
    <PreviewFrame
      title="Part d’influence récupérée"
      description="Exemple avec un pays contrôlé qui produit 100 points d’influence. La barre montre ce qui remonte vers le pays dominant."
    >
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_5rem] sm:items-center">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{row.detail}</p>
            </div>
            <div className="h-7 overflow-hidden rounded-md bg-[var(--background)]">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }} />
            </div>
            <p className="text-sm font-semibold text-[var(--foreground)] sm:text-right">{row.value} points</p>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

type IntelConfig = {
  decay_flat_per_day?: number;
  decay_pct_per_day?: number;
  decay_mode?: "flat" | "pct" | "both";
  espionage_intel_gain_base?: number;
};

function applyIntelDecay(value: number, config: IntelConfig): number {
  const flat = Math.max(0, config.decay_flat_per_day ?? 2);
  const pct = Math.max(0, config.decay_pct_per_day ?? 5) / 100;
  if (config.decay_mode === "pct") return Math.max(0, value - value * pct);
  if (config.decay_mode === "both") {
    const afterFlat = value - flat;
    return Math.max(0, afterFlat - afterFlat * pct);
  }
  return Math.max(0, value - flat);
}

export function IntelRulePreview({ config }: { config: IntelConfig }) {
  const values = [100];
  for (let day = 1; day <= 7; day += 1) values.push(applyIntelDecay(values[day - 1], config));
  const points = values.map((value, index) => `${10 + index * 40},${65 - value * 0.55}`).join(" ");
  const espionageGain = Math.round(((config.espionage_intel_gain_base ?? 50) * 70) / 100);

  return (
    <PreviewFrame
      title="Évolution sur sept jours"
      description="La courbe part de 100 points de renseignement et applique exactement le mode choisi à chaque passage quotidien."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-center">
        <div>
          <svg viewBox="0 0 300 80" role="img" aria-label={`Le renseignement passe de 100 à ${compact(values[7])} en sept jours`} className="h-28 w-full" preserveAspectRatio="none">
            <line x1="10" y1="65" x2="290" y2="65" stroke="var(--border-muted)" />
            <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            {values.map((value, index) => (
              <circle key={index} cx={10 + index * 40} cy={65 - value * 0.55} r="4" fill="var(--background-panel)" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="flex justify-between text-xs text-[var(--foreground-muted)]">
            <span>Aujourd’hui : 100</span>
            <span>Jour 7 : {compact(values[7])}</span>
          </div>
        </div>
        <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" style={{ borderColor: "var(--border-muted)" }}>
          <p className="text-sm text-[var(--foreground-muted)]">Espionnage à 70/100</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">+{espionageGain} points</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
            Le gain de référence correspond à un jet parfait ; le résultat réel est proportionnel.
          </p>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function IdeologyRulePreview({
  config,
  sphere,
}: {
  config: IdeologyConfig;
  sphere?: SphereInfluencePct;
}) {
  const selected = IDEOLOGY_IDS[0];
  const neutralScores = Object.fromEntries(IDEOLOGY_IDS.map((id) => [ideologyColumnName(id), 100 / 6]));
  const neighborScores = Object.fromEntries(IDEOLOGY_IDS.map((id) => [ideologyColumnName(id), id === selected ? 100 : 0]));
  const countries = [
    {
      id: "target",
      name: "Pays neutre",
      slug: "target",
      flag_url: null,
      regime: null,
      militarism: 5,
      industry: 5,
      science: 5,
      stability: 0,
      gdp: 1,
      population: 1,
      ...neutralScores,
    } as unknown as IdeologyCountryInput,
    {
      id: "neighbor",
      name: "Voisin dominant",
      slug: "neighbor",
      flag_url: null,
      regime: null,
      militarism: 5,
      industry: 5,
      science: 5,
      stability: 0,
      gdp: 1,
      population: 1,
      ...neighborScores,
    } as unknown as IdeologyCountryInput,
  ];
  const drift = createZeroScores();
  const snap = createZeroScores();
  drift[selected] = 10;
  snap[selected] = 1;
  const result = computeWorldIdeologies({
    countries,
    config,
    relationMap: new Map([[relationKey("target", "neighbor"), 50]]),
    influenceByCountry: new Map([["target", 50], ["neighbor", 100]]),
    neighborIdsByCountry: new Map([["target", ["neighbor"]]]),
    controlRows: [{ country_id: "target", controller_country_id: "neighbor", share_pct: 100, is_annexed: false }],
    effectsByCountry: new Map([["target", { drift, snap }]]),
    sphereInfluencePct: sphere,
  }).get("target");
  const before = 100 / 6;
  const after = result?.scores[selected] ?? before;
  const delta = after - before;

  return (
    <PreviewFrame
      title="Déplacement idéologique en un jour"
      description="Scénario fixe : pays neutre, voisin deux fois plus influent, relation +50, occupation et effet actif orientés vers le même pôle."
    >
      <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">{IDEOLOGY_LABELS[selected]}</p>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            {compact(before)} % → <strong className="text-[var(--accent)]">{compact(after)} %</strong>
          </p>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Variation quotidienne : {delta >= 0 ? "+" : ""}{compact(delta)} point
          </p>
        </div>
        <div>
          <div className="relative h-7 overflow-hidden rounded-md bg-[var(--background)]">
            <div className="h-full bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" style={{ width: `${Math.max(0, Math.min(100, after))}%` }} />
            <span className="absolute inset-y-0 w-px bg-[var(--foreground)]" style={{ left: `${before}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--foreground-muted)]">
            <span>0 %</span><span>Trait blanc : avant</span><span>100 %</span>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function LawThresholdRulePreview({
  levels,
  thresholds,
  dailyStep,
}: {
  levels: Array<{ key: string; label: string }>;
  thresholds: Record<string, number>;
  dailyStep: number;
}) {
  const palette = ["#64748b", "#3b82f6", "#eab308", "#f97316", "#ef4444", "#a855f7"];
  const values = levels.map((level) => Number(thresholds[level.key] ?? 0));
  const ordered = values.every((value, index) => index === 0 || value >= values[index - 1]);

  return (
    <PreviewFrame
      title="Lecture de l’échelle"
      description={`Un pays se déplace de ${compact(dailyStep)} point${dailyStep > 1 ? "s" : ""} par jour vers sa cible. Les couleurs montrent le niveau actif selon son score.`}
    >
      <div className="relative h-8 overflow-hidden rounded-md bg-[var(--background)]">
        {levels.map((level, index) => {
          const start = Math.max(0, Math.min(500, values[index]));
          const end = Math.max(start, Math.min(500, values[index + 1] ?? 500));
          return (
            <span
              key={level.key}
              className="absolute inset-y-0"
              style={{
                left: `${(start / 500) * 100}%`,
                width: `${((end - start) / 500) * 100}%`,
                background: palette[index % palette.length],
              }}
            />
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level, index) => (
          <div key={level.key} className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: palette[index % palette.length] }} />
            <span>{level.label} dès <strong className="text-[var(--foreground)]">{values[index]}</strong></span>
          </div>
        ))}
      </div>
      {!ordered ? (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          Les seuils ne sont pas dans l’ordre : certains niveaux peuvent devenir impossibles à atteindre.
        </p>
      ) : null}
    </PreviewFrame>
  );
}

type AiConfig = {
  interval_hours?: number;
  count_major_per_run?: number;
  count_minor_per_run?: number;
  target_major_ai?: boolean;
  target_minor_ai?: boolean;
  target_players?: boolean;
  auto_accept_by_action_type?: Record<string, boolean>;
};

export function AiRulePreview({ config }: { config: AiConfig }) {
  const interval = Math.max(0.25, Number(config.interval_hours ?? 1));
  const passages = Math.max(1, Math.floor(24 / interval));
  const perPassage = Math.max(0, Number(config.count_major_per_run ?? 0)) + Math.max(0, Number(config.count_minor_per_run ?? 0));
  const targets = [
    config.target_major_ai ? "IA majeures" : null,
    config.target_minor_ai ? "IA mineures" : null,
    config.target_players ? "joueurs" : null,
  ].filter(Boolean);
  const automatic = Object.values(config.auto_accept_by_action_type ?? {}).filter(Boolean).length;

  return (
    <PreviewFrame
      title="Projection sur vingt-quatre heures"
      description="Estimation directe à rythme constant. Le déclenchement réel peut être décalé par l’amplitude aléatoire configurée."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
        <div>
          <div className="flex min-h-12 items-center gap-1 overflow-hidden rounded-lg bg-[var(--background)] px-3">
            {Array.from({ length: Math.min(passages, 48) }, (_, index) => (
              <span key={index} className="h-3 min-w-1 flex-1 rounded-sm bg-[var(--accent)]" />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--foreground-muted)]">
            <span>0 h</span><span>{passages} passage{passages > 1 ? "s" : ""}</span><span>24 h</span>
          </div>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--foreground-muted)]">Actions générées</dt>
            <dd className="font-semibold text-[var(--foreground)]">{formatNumber(passages * perPassage)} / jour</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--foreground-muted)]">Cibles possibles</dt>
            <dd className="text-right text-[var(--foreground)]">{targets.length ? targets.join(", ") : "Aucune"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--foreground-muted)]">Types auto-acceptés</dt>
            <dd className="font-semibold text-[var(--foreground)]">{automatic}</dd>
          </div>
        </dl>
      </div>
    </PreviewFrame>
  );
}
