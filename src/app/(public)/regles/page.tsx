import { createAnonClientForCache } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";
import { formatWorldDate } from "@/lib/worldDate";
import {
  EFFECT_KIND_LABELS,
  STAT_LABELS,
  MILITARY_BRANCH_EFFECT_LABELS,
  formatEffectValue,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
} from "@/lib/countryEffects";
import { BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import {
  buildPublicRulesModel,
  ruleNumber,
  ruleObject,
} from "@/lib/publicRules";
import {
  PublicPageHeader,
  PublicPageIconGlyph,
  type PublicPageIcon,
} from "@/components/ui/PublicPageHeader";

export const revalidate = 60;

type GlobalGrowthEntry = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
};

function formatGlobalGrowthEntry(entry: GlobalGrowthEntry): string {
  const kindLabel = EFFECT_KIND_LABELS[entry.effect_kind] ?? entry.effect_kind;
  let targetLabel: string | null = null;

  if (entry.effect_target) {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(entry.effect_kind)) {
      targetLabel =
        STAT_LABELS[entry.effect_target as keyof typeof STAT_LABELS] ?? entry.effect_target;
    } else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(entry.effect_kind)) {
      targetLabel = BUDGET_MINISTRY_LABELS[entry.effect_target] ?? entry.effect_target;
    } else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(entry.effect_kind)) {
      targetLabel =
        MILITARY_BRANCH_EFFECT_LABELS[entry.effect_target] ?? entry.effect_target;
    } else {
      targetLabel = entry.effect_target;
    }
  }

  const value = formatEffectValue(entry.effect_kind, Number(entry.value));
  return targetLabel ? `${kindLabel} — ${targetLabel} : ${value}` : `${kindLabel} : ${value}`;
}

function Section({
  id,
  title,
  intro,
  icon,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  icon: PublicPageIcon;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-white/15 bg-[#101820]/95 p-5 shadow-2xl sm:p-6"
    >
      <div className="mb-5 flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/12 text-[var(--accent)]"
          aria-hidden
        >
          <PublicPageIconGlyph icon={icon} className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/70">{intro}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FactCard({
  title,
  value,
  detail,
  className = "",
  headingLevel = 3,
}: {
  title: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";

  return (
    <div className={`rounded-xl bg-white/[0.055] p-4 ${className}`}>
      <Heading className="text-sm font-medium text-white/70">{title}</Heading>
      <div className="mt-2 font-semibold leading-6 text-white">{value}</div>
      {detail ? <div className="mt-2 text-sm leading-6 text-white/65">{detail}</div> : null}
    </div>
  );
}

function formatRange(min: number, max: number): string {
  return `${formatNumber(min)} à ${max > 0 ? "+" : ""}${formatNumber(max)}`;
}

export default async function ReglesPage() {
  const supabase = createAnonClientForCache();
  const { data: rules, error } = await supabase
    .from("rule_parameters")
    .select("key, value")
    .order("key");

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--danger)]">Les règles ne peuvent pas être chargées.</p>
      </div>
    );
  }

  const { values, budgets, laws } = buildPublicRulesModel(rules ?? []);
  const worldDate = ruleObject(values.world_date);
  const month = ruleNumber(worldDate.month, Number.NaN);
  const year = ruleNumber(worldDate.year, Number.NaN);
  const worldDateLabel =
    Number.isFinite(month) && Number.isFinite(year)
      ? formatWorldDate({ month, year })
      : "Date non définie";
  const advanceMonths = ruleNumber(values.world_date_advance_months);
  const growthEffects = Array.isArray(values.global_growth_effects)
    ? (values.global_growth_effects as GlobalGrowthEntry[])
    : [];

  const staff = ruleObject(values.etat_major_config);
  const staffDesign = ruleObject(staff.design);
  const staffRecruitment = ruleObject(staff.recrutement);
  const staffProcurement = ruleObject(staff.procuration);
  const staffStock = ruleObject(staff.stock);

  const diceRanges = ruleObject(values.stats_dice_modifier_ranges);
  const militarismDice = ruleObject(diceRanges.militarism);
  const industryDice = ruleObject(diceRanges.industry);
  const scienceDice = ruleObject(diceRanges.science);
  const stabilityDice = ruleObject(diceRanges.stability);

  const ideology = ruleObject(values.ideology_config);
  const influence = ruleObject(values.influence_config);
  const sphere = ruleObject(values.sphere_influence_pct);
  const intel = ruleObject(values.intel_config);
  const aiMajorEffects = Array.isArray(values.ai_major_effects)
    ? values.ai_major_effects.length
    : 0;
  const aiMinorEffects = Array.isArray(values.ai_minor_effects)
    ? values.ai_minor_effects.length
    : 0;
  const isPaused = values.cron_paused === true;

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url(/images/site/fiche-pays-bg.webp)",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-[#05090d]/78" />
      </div>

      <div
        className="relative z-10 mx-auto max-w-6xl px-4 py-10"
        style={{ isolation: "isolate" }}
      >
        <PublicPageHeader title="Règles de simulation" icon="rules" />
        <p className="-mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">
          Les règles qui font évoluer les pays, présentées par effet de jeu plutôt que par
          paramètre technique.
        </p>

        <nav
          aria-label="Sections des règles"
          className="my-6 flex flex-wrap gap-2 rounded-2xl border border-white/15 bg-[#101820]/95 p-2 shadow-xl"
        >
          {[
            { href: "#monde", label: "Monde", icon: "world" as const },
            { href: "#budget", label: "Budget", icon: "budget" as const },
            { href: "#lois", label: "Lois", icon: "law" as const },
            { href: "#relations", label: "Relations", icon: "relations" as const },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <PublicPageIconGlyph icon={item.icon} className="h-4 w-4 text-[var(--accent)]" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="space-y-6">
          <Section
            id="monde"
            title="Évolution du monde"
            intro="La date, le rythme de la simulation et les bonus appliqués à tous les pays."
            icon="world"
          >
            <div
              className={`mb-4 rounded-xl border px-4 py-3 ${
                isPaused
                  ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              }`}
              role="status"
            >
              <p className="font-semibold">
                {isPaused
                  ? "L’évolution automatique est actuellement en pause."
                  : "L’évolution automatique est active."}
              </p>
              <p className="mt-1 text-sm opacity-80">
                {isPaused
                  ? "Les valeurs restent consultables, mais le monde n’avance pas tant que la partie n’est pas relancée."
                  : "Les pays évoluent au rythme défini ci-dessous."}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FactCard
                title="Date du monde"
                value={worldDateLabel}
                detail={`Chaque mise à jour fait avancer la date de ${formatNumber(
                  advanceMonths
                )} mois.`}
              />
              <FactCard
                title="Effets mondiaux"
                value={
                  growthEffects.length > 0 ? (
                    <ul className="space-y-1">
                      {growthEffects.map((effect, index) => (
                        <li key={`${effect.effect_kind}-${effect.effect_target}-${index}`}>
                          {formatGlobalGrowthEntry(effect)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Aucun effet commun"
                  )
                }
                detail="Ces variations s’appliquent à tous les pays lors de l’évolution du monde."
              />
              <FactCard
                title="Effet des statistiques sur les jets"
                className="md:col-span-2"
                value={
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span>
                      Militarisme :{" "}
                      {formatRange(
                        ruleNumber(militarismDice.min),
                        ruleNumber(militarismDice.max)
                      )}
                    </span>
                    <span>
                      Industrie :{" "}
                      {formatRange(
                        ruleNumber(industryDice.min),
                        ruleNumber(industryDice.max)
                      )}
                    </span>
                    <span>
                      Science :{" "}
                      {formatRange(
                        ruleNumber(scienceDice.min),
                        ruleNumber(scienceDice.max)
                      )}
                    </span>
                    <span>
                      Stabilité :{" "}
                      {formatRange(
                        ruleNumber(stabilityDice.min),
                        ruleNumber(stabilityDice.max)
                      )}
                    </span>
                  </div>
                }
                detail="Chaque action choisit les statistiques qui entrent dans son jet. Ces fourchettes définissent seulement l’effet de chacune."
              />
            </div>
          </Section>

          <Section
            id="budget"
            title="Budget et institutions"
            intro="Le seuil indique la part minimale à consacrer à un ministère pour éviter son malus et profiter de ses effets."
            icon="budget"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {budgets.map((budget) => (
                <FactCard
                  key={budget.key}
                  title={budget.title}
                  value={`Seuil : ${formatNumber(budget.minPct)} % du budget`}
                  detail={
                    budget.effects.length > 0
                      ? `Agit sur : ${budget.effects.join(" · ")}`
                      : "Aucun effet public configuré."
                  }
                />
              ))}
            </div>

            <h3 className="mb-3 mt-6 text-base font-semibold text-white">Progression de l’état-major</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FactCard
                title="Bureau de design"
                headingLevel={4}
                value={`${formatNumber(
                  ruleNumber(staffDesign.min_points_per_tick)
                )} à ${formatNumber(
                  ruleNumber(staffDesign.max_points_per_tick)
                )} points`}
                detail="Par mise à jour."
              />
              <FactCard
                title="Recrutement"
                headingLevel={4}
                value={`${formatNumber(
                  ruleNumber(staffRecruitment.min_points_per_tick)
                )} à ${formatNumber(
                  ruleNumber(staffRecruitment.max_points_per_tick)
                )} points`}
                detail={`+ ${formatNumber(
                  ruleNumber(staffRecruitment.points_per_pct_defense)
                )} point par % consacré à la Défense.`}
              />
              <FactCard
                title="Procuration"
                headingLevel={4}
                value={`${formatNumber(
                  ruleNumber(staffProcurement.base_points_per_tick)
                )} points de base`}
                detail={`+ ${formatNumber(
                  ruleNumber(staffProcurement.points_per_pct_budget)
                )} point par % du budget dédié.`}
              />
              <FactCard
                title="Stock stratégique"
                headingLevel={4}
                value={`${formatNumber(
                  ruleNumber(staffStock.min_points_per_tick)
                )} à ${formatNumber(
                  ruleNumber(staffStock.max_points_per_tick)
                )} points`}
                detail="Par mise à jour."
              />
            </div>
          </Section>

          <Section
            id="lois"
            title="Lois nationales"
            intro="Chaque loi progresse vers la cible choisie par le joueur. Ses effets changent quand un nouveau niveau est atteint."
            icon="law"
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {laws.map((law) => (
                <article key={law.key} className="rounded-xl bg-white/[0.055] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-white">{law.title}</h3>
                    <span className="text-xs font-medium text-[var(--accent)]">
                      {formatNumber(law.dailyStep)} points par jour
                    </span>
                  </div>
                  <ol className="mt-4 space-y-2">
                    {law.levels.map((level, index) => (
                      <li key={level} className="flex min-w-0 items-start gap-3 text-sm text-white/75">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/80"
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 break-words pt-0.5">{level}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-xs leading-5 text-white/55">
                    {formatNumber(law.effectCount)} effets de jeu sont répartis entre ces niveaux.
                  </p>
                </article>
              ))}
            </div>
          </Section>

          <Section
            id="relations"
            title="Diplomatie, influence et renseignement"
            intro="Ce qui détermine le poids d’un pays, ses relations et les informations qu’il conserve."
            icon="relations"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <FactCard
                title="Relations bilatérales"
                value="Une échelle de −100 à +100"
                detail="−100 représente une hostilité extrême ; +100, une loyauté absolue. Cette relation modifie les jets et certaines actions diplomatiques."
              />
              <FactCard
                title="Influence"
                value="PIB, population et puissance militaire"
                detail={`La stabilité ajuste ensuite le résultat entre × ${formatNumber(
                  ruleNumber(influence.stability_modifier_min)
                )} et × ${formatNumber(
                  ruleNumber(influence.stability_modifier_max)
                )}.`}
              />
              <FactCard
                title="Évolution idéologique"
                value={`${formatNumber(ruleNumber(ideology.daily_step))} point par jour au maximum`}
                detail="Les voisins, les relations, l’influence et le contrôle territorial attirent progressivement le pays vers d’autres idéologies."
              />
              <FactCard
                title="Renseignement"
                value={`Perte de ${formatNumber(
                  ruleNumber(intel.decay_pct_per_day)
                )} % par jour`}
                detail={`Une action d’espionnage réussie rapporte ${formatNumber(
                  ruleNumber(intel.espionage_intel_gain_base)
                )} points de renseignement de base.`}
              />
              <FactCard
                title="Influence transmise par une sphère"
                value={
                  <ul className="space-y-1">
                    <li>Contrôle contesté : {formatNumber(ruleNumber(sphere.contested))} %</li>
                    <li>Occupation : {formatNumber(ruleNumber(sphere.occupied))} %</li>
                    <li>Annexion : {formatNumber(ruleNumber(sphere.annexed))} %</li>
                  </ul>
                }
                detail="Une part de l’influence du pays contrôlé revient à son contrôleur."
              />
              <FactCard
                title="Pays gérés par le jeu"
                value={
                  aiMajorEffects + aiMinorEffects === 0
                    ? "Aucun avantage automatique spécifique"
                    : `${formatNumber(aiMajorEffects)} effets pour les puissances majeures · ${formatNumber(
                        aiMinorEffects
                      )} pour les puissances mineures`
                }
                detail="Le statut IA ne remplace pas les autres règles du pays."
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
