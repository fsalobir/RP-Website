"use client";

import type { ReactNode } from "react";
import { computeInfluenceForAll, type InfluenceConfig } from "@/lib/influence";
import type { HardPowerByBranch } from "@/lib/hardPower";
import { cronGravityFactorTs } from "@/lib/ruleParameters";
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
      description="La longueur compare l’influence totale sur une même échelle. Les couleurs montrent la part apportée par le PIB, la population et l’armée."
    >
      <div className="space-y-5">
        {results.map(({ profile, result }) => {
          const stability = result.componentsAfterGravity.stabilityMultiplier;
          const barWidth = (result.influence / maximum) * 100;
          const segments = [
            {
              key: "gdp",
              label: "PIB",
              color: "var(--accent)",
              width: result.influence > 0 ? (result.componentsAfterGravity.gdp * stability / result.influence) * 100 : 0,
            },
            {
              key: "population",
              label: "Population",
              color: "var(--warning)",
              width: result.influence > 0 ? (result.componentsAfterGravity.population * stability / result.influence) * 100 : 0,
            },
            {
              key: "military",
              label: "Armée",
              color: "#60a5fa",
              width: result.influence > 0 ? (result.componentsAfterGravity.military * stability / result.influence) * 100 : 0,
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
              <div className="mt-2 h-7">
                <div
                  role="img"
                  aria-label={`${profile.label} : influence ${compact(result.influence)}, composée du PIB, de la population et de l'armée`}
                  className="flex h-full overflow-hidden rounded-md"
                  style={{ width: `${Math.max(0, Math.min(100, barWidth))}%` }}
                >
                  {segments.map((segment) => (
                    <span
                      key={segment.key}
                      title={`${segment.label} : ${compact(segment.width)} % de l’influence de ce profil`}
                      style={{ width: `${Math.max(0, segment.width)}%`, background: segment.color }}
                    />
                  ))}
                </div>
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
          Échelle maximale : {compact(maximum)} points · la grande puissance vaut {medium > 0 ? `${compact(strong / medium)}×` : "—"} la puissance moyenne.
        </span>
      </div>
    </PreviewFrame>
  );
}

export function BudgetWorldGapPreview({
  weight,
  adaptedEffectCount,
}: {
  weight: number;
  adaptedEffectCount: number;
}) {
  const safeWeight = Math.max(0, Math.min(100, Number(weight) || 0));
  const situations = [
    { label: "Pays 50 % sous la moyenne", countryValue: 50 },
    { label: "Pays à la moyenne", countryValue: 100 },
    { label: "Pays 50 % au-dessus", countryValue: 150 },
  ].map((situation) => ({
    ...situation,
    bonusFactor: cronGravityFactorTs(1, true, safeWeight, 100, situation.countryValue),
    malusFactor: Math.abs(cronGravityFactorTs(-1, true, safeWeight, 100, situation.countryValue)),
  }));
  const exampleEffect = 10;
  const result = (value: number, sign: "+" | "−") =>
    `${sign}${(exampleEffect * value).toLocaleString("fr-FR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}`;

  return (
    <section className="border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5 className="text-sm font-medium text-[var(--foreground)]">Effet de la correction</h5>
        <p className="text-xs text-[var(--foreground-muted)]">
          {safeWeight === 0
            ? "Le niveau du pays est ignoré"
            : safeWeight === 100
              ? "Le niveau du pays est entièrement pris en compte"
              : `Le niveau du pays compte à ${safeWeight} %`}
        </p>
      </div>

      {adaptedEffectCount === 0 && (
        <p
          className="mt-2 rounded-lg border px-3 py-2 text-xs text-[var(--foreground)]"
          style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
        >
          Ce réglage ne modifie actuellement aucun effet de ce ministère. Activez « Corriger selon le niveau du pays » sur une ligne d’effet pour l’utiliser.
        </p>
      )}

      <div className="mt-3 hidden sm:block">
        <table className="w-full text-left text-xs">
          <thead className="text-[var(--foreground-muted)]">
            <tr>
              <th className="pb-2 pr-4 font-medium">Situation du pays</th>
              <th className="pb-2 px-4 font-medium">Si le gain normal est +10</th>
              <th className="pb-2 pl-4 font-medium">Si la perte normale est −10</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-muted)] text-[var(--foreground)]">
            {situations.map((situation) => (
              <tr key={situation.label}>
                <th className="py-2 pr-4 font-medium">{situation.label}</th>
                <td className="px-4 py-2">
                  <strong>{result(situation.bonusFactor, "+")}</strong>
                </td>
                <td className="py-2 pl-4">
                  <strong>{result(situation.malusFactor, "−")}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 divide-y divide-[var(--border-muted)] sm:hidden">
        {situations.map((situation) => (
          <div key={situation.label} className="py-2 text-xs">
            <p className="font-medium text-[var(--foreground)]">{situation.label}</p>
            <dl className="mt-1 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[var(--foreground-muted)]">Gain normal de +10</dt>
                <dd className="mt-0.5 font-semibold text-[var(--foreground)]">{result(situation.bonusFactor, "+")}</dd>
              </div>
              <div>
                <dt className="text-[var(--foreground-muted)]">Perte normale de −10</dt>
                <dd className="mt-0.5 font-semibold text-[var(--foreground)]">{result(situation.malusFactor, "−")}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
        Exemple avec une moyenne mondiale de 100. Le jeu refait ce calcul pour chaque statistique concernée.
      </p>
    </section>
  );
}

export function SphereRulePreview({
  values,
}: {
  values: { contested?: number; occupied?: number; annexed?: number };
}) {
  const exampleInfluence = 1_000;
  const rows = [
    { key: "contested", label: "Contesté", detail: "Contrôle partagé", value: values.contested ?? 50 },
    { key: "occupied", label: "Occupé", detail: "Contrôle total sans annexion", value: values.occupied ?? 80 },
    { key: "annexed", label: "Annexé", detail: "Intégration complète", value: values.annexed ?? 100 },
  ];
  return (
    <PreviewFrame
      title="Répartition de 1 000 points d’influence"
      description="Le vert est transféré au pays contrôleur. Le reste demeure dans le pays contrôlé."
    >
      <div className="space-y-4">
        {rows.map((row) => {
          const transferredPct = Math.max(0, Math.min(100, row.value));
          const transferred = Math.round(exampleInfluence * transferredPct / 100);
          const retained = exampleInfluence - transferred;
          return (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_12rem] sm:items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{row.detail} · {transferredPct} % transférés</p>
              </div>
              <div
                role="img"
                aria-label={`${row.label} : ${formatNumber(transferred)} points transférés au contrôleur et ${formatNumber(retained)} conservés par le pays contrôlé`}
                className="h-7 overflow-hidden rounded-md bg-[var(--background)]"
              >
                <div className="h-full bg-[var(--accent)]" style={{ width: `${transferredPct}%` }} />
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold text-[var(--foreground)]">{formatNumber(transferred)} transférés</p>
                <p className="text-xs text-[var(--foreground-muted)]">{formatNumber(retained)} conservés</p>
              </div>
            </div>
          );
        })}
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
  const afterSevenDays = values[7];
  const totalLoss = 100 - afterSevenDays;
  const espionageGain = Math.round(((config.espionage_intel_gain_base ?? 50) * 70) / 100);
  const afterEspionage = Math.min(100, afterSevenDays + espionageGain);
  const usefulGain = afterEspionage - afterSevenDays;
  const cappedGain = espionageGain - usefulGain;

  return (
    <PreviewFrame
      title="Exemple complet"
      description="Le même stock est suivi dans l’ordre : sept jours sans nouvelle action, puis un espionnage."
    >
      <ol
        className="grid overflow-hidden rounded-xl border divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      >
        <li className="p-4">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Aujourd’hui</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">100 / 100</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--background-panel)]">
            <div className="h-full w-full bg-[var(--accent)]" />
          </div>
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">Stock de départ</p>
        </li>
        <li className="p-4">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Après 7 jours sans agir</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{compact(afterSevenDays)} / 100</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--background-panel)]">
            <div className="h-full bg-[var(--warning)]" style={{ width: `${afterSevenDays}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">Perte totale : −{compact(totalLoss)} points</p>
        </li>
        <li className="p-4">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Puis espionnage · jet de conséquence 70/100</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">{compact(afterEspionage)} / 100</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--background-panel)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${afterEspionage}%` }} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
            Gain théorique : +{espionageGain}. Gain réellement ajouté : +{compact(usefulGain)}
            {cappedGain > 0 ? ` ; ${compact(cappedGain)} points sont perdus au plafond de 100.` : "."}
          </p>
        </li>
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-[var(--foreground-muted)]">
        Le renseignement baisse chaque jour sans nouvelle action. Un espionnage le fait remonter, sans jamais dépasser 100.
      </p>
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
  const targetScores = Object.fromEntries(IDEOLOGY_IDS.map((id) => [
    ideologyColumnName(id),
    id === selected ? 34 : id === "french_republicanism" || id === "nilotique_cultism" ? 33 : 0,
  ]));
  const favorableNeighborScores = Object.fromEntries(IDEOLOGY_IDS.map((id) => [
    ideologyColumnName(id),
    id === selected ? 50 : id === "french_republicanism" || id === "nilotique_cultism" ? 25 : 0,
  ]));
  const balancingNeighborScores = Object.fromEntries(IDEOLOGY_IDS.map((id) => [
    ideologyColumnName(id),
    id === selected ? 20 : id === "french_republicanism" || id === "nilotique_cultism" ? 40 : 0,
  ]));
  const countries = [
    {
      id: "target",
      name: "Pays observé",
      slug: "target",
      flag_url: null,
      regime: null,
      militarism: 5,
      industry: 5,
      science: 5,
      stability: 0,
      gdp: 1,
      population: 1,
      ...targetScores,
    } as unknown as IdeologyCountryInput,
    {
      id: "favorable-neighbor",
      name: "Voisin favorable",
      slug: "favorable-neighbor",
      flag_url: null,
      regime: null,
      militarism: 5,
      industry: 5,
      science: 5,
      stability: 0,
      gdp: 1,
      population: 1,
      ...favorableNeighborScores,
    } as unknown as IdeologyCountryInput,
    {
      id: "balancing-neighbor",
      name: "Voisin modéré",
      slug: "balancing-neighbor",
      flag_url: null,
      regime: null,
      militarism: 5,
      industry: 5,
      science: 5,
      stability: 0,
      gdp: 1,
      population: 1,
      ...balancingNeighborScores,
    } as unknown as IdeologyCountryInput,
  ];
  const drift = createZeroScores();
  const snap = createZeroScores();
  drift[selected] = 2;
  const result = computeWorldIdeologies({
    countries,
    config,
    relationMap: new Map([
      [relationKey("target", "favorable-neighbor"), 25],
      [relationKey("target", "balancing-neighbor"), 0],
    ]),
    influenceByCountry: new Map([
      ["target", 1000],
      ["favorable-neighbor", 1500],
      ["balancing-neighbor", 800],
    ]),
    neighborIdsByCountry: new Map([["target", ["favorable-neighbor", "balancing-neighbor"]]]),
    controlRows: [{ country_id: "target", controller_country_id: "favorable-neighbor", share_pct: 25, is_annexed: false }],
    effectsByCountry: new Map([["target", { drift, snap }]]),
    sphereInfluencePct: sphere,
  }).get("target");
  const before = 34;
  const after = result?.scores[selected] ?? before;
  const delta = after - before;
  const speedLabel = Math.abs(delta) >= 10 ? "très rapide" : Math.abs(delta) >= 3 ? "rapide" : "modéré";

  return (
    <PreviewFrame
      title="Évolution idéologique en un jour"
      description="Scénario de référence : pays à 34 %, deux voisins aux profils différents, influences de 800 à 1.500, relation +25 et contrôle à 25 %."
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
          <p className="mt-1 text-xs font-medium text-[var(--foreground)]">
            Rythme {speedLabel}
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
    config.target_major_ai ? "grandes puissances sans joueur" : null,
    config.target_minor_ai ? "puissances secondaires sans joueur" : null,
    config.target_players ? "pays avec joueur" : null,
  ].filter(Boolean);
  const automatic = Object.values(config.auto_accept_by_action_type ?? {}).filter(Boolean).length;

  return (
    <PreviewFrame
      title="Projection sur vingt-quatre heures"
      description="Estimation à rythme constant. Le déclenchement réel peut varier dans la plage aléatoire configurée."
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
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
            <dt className="text-[var(--foreground-muted)]">Actions appliquées sans validation</dt>
            <dd className="font-semibold text-[var(--foreground)]">{automatic}</dd>
          </div>
        </dl>
      </div>
    </PreviewFrame>
  );
}
