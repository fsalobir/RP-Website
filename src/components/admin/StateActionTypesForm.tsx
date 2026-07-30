"use client";

import { useMemo, useState } from "react";
import { updateStateActionTypes } from "@/app/admin/actions-etat/actions";
import { AdminSaveBar, AdminSectionNav, AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";
import {
  actionRequiresTarget,
  actionRequiresTargetAcceptance,
  getDefaultImpactMaximum,
  getStateActionImpactPreviewLabel,
  getStateActionMinRelationRequired,
  isMilitaryStateActionKey,
} from "@/lib/actionKeys";
import {
  computePowerBalanceModifier,
  computeRelationModifier,
  type PowerBalanceConfig,
} from "@/lib/stateActionModifiers";
import { matchesSearchText } from "@/lib/searchText";
import type { StateActionType } from "@/types/database";

const STAT_BONUS_KEYS = [
  { key: "militarism", label: "Militarisme" },
  { key: "industry", label: "Industrie" },
  { key: "science", label: "Science" },
  { key: "stability", label: "Stabilité" },
] as const;

const ACTION_GROUPS = [
  {
    id: "interne",
    label: "Actions internes",
    description: "Développement et défense du pays",
    keys: ["demande_up", "investissements", "effort_fortifications"],
  },
  {
    id: "diplomatie",
    label: "Diplomatie",
    description: "Relations, accords et influence",
    keys: [
      "ouverture_diplomatique",
      "accord_commercial_politique",
      "cooperation_militaire",
      "alliance",
      "insulte_diplomatique",
      "prise_influence",
    ],
  },
  {
    id: "militaire",
    label: "Conflits",
    description: "Escarmouches, conflits et guerres",
    keys: ["escarmouche_militaire", "conflit_arme", "guerre_ouverte"],
  },
  {
    id: "secret",
    label: "Opérations secrètes",
    description: "Espionnage et sabotage",
    keys: ["espionnage", "sabotage"],
  },
] as const;

const ACTION_DESCRIPTIONS: Record<string, string> = {
  demande_up: "Le joueur demande au MJ d’améliorer ses effectifs ou son niveau technologique.",
  investissements: "Le joueur engage une action de développement intérieur.",
  effort_fortifications: "Le joueur renforce les défenses de son pays.",
  ouverture_diplomatique: "Une réussite améliore la relation bilatérale avec le pays ciblé.",
  accord_commercial_politique: "La cible doit accepter l’accord avant la décision finale du MJ.",
  cooperation_militaire: "La cible doit accepter la coopération avant la décision finale du MJ.",
  alliance: "La cible doit accepter l’alliance avant la décision finale du MJ.",
  insulte_diplomatique: "Une réussite dégrade la relation bilatérale avec le pays ciblé.",
  prise_influence: "Une réussite augmente l’influence de l’émetteur sur le pays ciblé.",
  escarmouche_militaire: "Action hostile limitée, disponible selon la relation entre les deux pays.",
  conflit_arme: "Conflit important, réservé aux relations fortement dégradées.",
  guerre_ouverte: "Niveau maximal d’hostilité et conséquences majeures.",
  espionnage: "Opération secrète qui peut révéler des informations sur le pays ciblé.",
  sabotage: "Opération secrète dont les conséquences sont décidées par le MJ.",
};

type PowerBalanceEdit = {
  ratioEquilibre: number;
  malusMax: number;
  bonusMax: number;
  ratioMin: number;
  ratioMax: number;
};

type EditState = {
  cost: number;
  impactMaximum: number;
  minRelationRequired: number;
  statBonus: Record<string, boolean>;
  statBonusUpNombre: Record<string, boolean>;
  statBonusUpTech: Record<string, boolean>;
  equilibreDesForces: PowerBalanceEdit;
  amplitudeRelations: number;
  amplitudeInfluence: number;
};

function defaultStatBonus(paramsKey: string, params: Record<string, unknown>): Record<string, boolean> {
  const values = (params[paramsKey] ?? {}) as Record<string, boolean>;
  return Object.fromEntries(STAT_BONUS_KEYS.map(({ key }) => [key, values[key] !== false]));
}

function defaultPowerBalance(params: Record<string, unknown>): PowerBalanceEdit {
  const values = (params.equilibre_des_forces ?? {}) as Record<string, number>;
  return {
    ratioEquilibre: typeof values.ratio_equilibre === "number" ? values.ratio_equilibre : 1,
    malusMax: typeof values.malus_max === "number" ? values.malus_max : 20,
    bonusMax: typeof values.bonus_max === "number" ? values.bonus_max : 20,
    ratioMin: typeof values.ratio_min === "number" ? values.ratio_min : 0.5,
    ratioMax: typeof values.ratio_max === "number" ? values.ratio_max : 2,
  };
}

function initEditForType(type: StateActionType): EditState {
  const params = (type.params_schema ?? {}) as Record<string, unknown>;
  return {
    cost: type.cost,
    impactMaximum:
      typeof params.impact_maximum === "number"
        ? params.impact_maximum
        : getDefaultImpactMaximum(type.key),
    minRelationRequired: getStateActionMinRelationRequired(type.key, params) ?? 0,
    statBonus: defaultStatBonus("stat_bonus", params),
    statBonusUpNombre: defaultStatBonus("stat_bonus_up_nombre", params),
    statBonusUpTech: defaultStatBonus("stat_bonus_up_tech", params),
    equilibreDesForces: defaultPowerBalance(params),
    amplitudeRelations:
      typeof params.amplitude_relations === "number" ? params.amplitude_relations : 0,
    amplitudeInfluence:
      typeof params.amplitude_influence === "number" ? params.amplitude_influence : 0,
  };
}

function buildPatch(type: StateActionType, edit: EditState): Record<string, unknown> {
  const params = (type.params_schema ?? {}) as Record<string, unknown>;

  if (type.key === "demande_up") {
    return {
      ...params,
      stat_bonus_up_nombre: edit.statBonusUpNombre,
      stat_bonus_up_tech: edit.statBonusUpTech,
    };
  }
  if (type.key === "prise_influence") {
    return {
      ...params,
      impact_maximum: edit.impactMaximum,
      amplitude_relations: edit.amplitudeRelations,
      amplitude_influence: edit.amplitudeInfluence,
      equilibre_des_forces: {
        ratio_equilibre: edit.equilibreDesForces.ratioEquilibre,
        malus_max: edit.equilibreDesForces.malusMax,
        bonus_max: edit.equilibreDesForces.bonusMax,
        ratio_min: edit.equilibreDesForces.ratioMin,
        ratio_max: edit.equilibreDesForces.ratioMax,
      },
    };
  }
  if (isMilitaryStateActionKey(type.key)) {
    return {
      ...params,
      impact_maximum: edit.impactMaximum,
      min_relation_required: edit.minRelationRequired,
    };
  }
  if (type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique") {
    return {
      ...params,
      impact_maximum: edit.impactMaximum,
      stat_bonus: edit.statBonus,
    };
  }
  return params;
}

function editsEqual(a: EditState, b: EditState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describeEditChanges(before: EditState, after: EditState): string {
  const changes: string[] = [];
  if (before.cost !== after.cost) changes.push(`coût ${before.cost} → ${after.cost} PA`);
  if (before.impactMaximum !== after.impactMaximum) {
    changes.push(`impact ${before.impactMaximum} → ${after.impactMaximum}`);
  }
  if (before.minRelationRequired !== after.minRelationRequired) {
    changes.push(`relation ${formatSigned(before.minRelationRequired)} → ${formatSigned(after.minRelationRequired)}`);
  }

  const advancedBefore = { ...before, cost: 0, impactMaximum: 0, minRelationRequired: 0 };
  const advancedAfter = { ...after, cost: 0, impactMaximum: 0, minRelationRequired: 0 };
  if (JSON.stringify(advancedBefore) !== JSON.stringify(advancedAfter)) {
    changes.push("calcul avancé modifié");
  }
  return changes.join(" · ");
}

function validateEdit(type: StateActionType, edit: EditState): string | null {
  if (!Number.isInteger(edit.cost) || edit.cost < 0) {
    return `${type.label_fr} : le coût doit être un nombre entier positif ou nul.`;
  }

  const hasImpact =
    type.key === "prise_influence" ||
    type.key === "insulte_diplomatique" ||
    type.key === "ouverture_diplomatique" ||
    isMilitaryStateActionKey(type.key);
  if (hasImpact && (!Number.isFinite(edit.impactMaximum) || edit.impactMaximum < 0 || edit.impactMaximum > 100)) {
    return `${type.label_fr} : l’impact maximal doit rester entre 0 et 100.`;
  }
  if (
    isMilitaryStateActionKey(type.key) &&
    (edit.minRelationRequired < -100 || edit.minRelationRequired > 100)
  ) {
    return `${type.label_fr} : la relation autorisée doit rester entre −100 et +100.`;
  }
  if (type.key === "prise_influence") {
    const balance = edit.equilibreDesForces;
    if (
      !Number.isFinite(edit.amplitudeRelations) ||
      edit.amplitudeRelations < 0 ||
      edit.amplitudeRelations > 100
    ) {
      return "Prise d’influence : le poids de la relation doit rester entre 0 et 100.";
    }
    if (
      balance.ratioMin < 0 ||
      balance.ratioMin >= balance.ratioEquilibre ||
      balance.ratioEquilibre >= balance.ratioMax
    ) {
      return "Prise d’influence : le rapport minimal doit être inférieur au rapport neutre, lui-même inférieur au rapport maximal.";
    }
    if (
      balance.malusMax < 0 ||
      balance.malusMax > 100 ||
      balance.bonusMax < 0 ||
      balance.bonusMax > 100
    ) {
      return "Prise d’influence : le bonus et le malus doivent rester entre 0 et 100.";
    }
  }
  return null;
}

function NumberField({
  id,
  label,
  help,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block min-w-0">
      <span className="block text-sm font-medium text-[var(--foreground)]">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug text-[var(--foreground-muted)]">{help}</span>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />
      {hint ? <span className="mt-1 block text-xs leading-snug text-[var(--foreground-muted)]">{hint}</span> : null}
    </label>
  );
}

function StatBonusCheckboxes({
  label,
  statBonus,
  onChange,
}: {
  label: string;
  statBonus: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-[var(--foreground)]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {STAT_BONUS_KEYS.map(({ key, label: statLabel }) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm text-[var(--foreground)]"
            style={{ borderColor: "var(--border-muted)" }}
          >
            <input
              type="checkbox"
              checked={statBonus[key] !== false}
              onChange={(event) => onChange({ ...statBonus, [key]: event.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {statLabel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function ActionPreview({ type, edit }: { type: StateActionType; edit: EditState }) {
  const [roll, setRoll] = useState(60);
  const [relation, setRelation] = useState(0);
  const [emitterInfluence, setEmitterInfluence] = useState(1000);
  const [targetInfluence, setTargetInfluence] = useState(1000);
  const isInfluence = type.key === "prise_influence";
  const hasImpact =
    isInfluence ||
    type.key === "insulte_diplomatique" ||
    type.key === "ouverture_diplomatique" ||
    isMilitaryStateActionKey(type.key);

  const relationModifier = isInfluence
    ? computeRelationModifier(relation, edit.amplitudeRelations)
    : 0;
  const ratio = targetInfluence > 0 ? emitterInfluence / targetInfluence : 0;
  const balanceConfig: PowerBalanceConfig = {
    neutralRatio: edit.equilibreDesForces.ratioEquilibre,
    minimumRatio: edit.equilibreDesForces.ratioMin,
    maximumRatio: edit.equilibreDesForces.ratioMax,
    maximumPenalty: edit.equilibreDesForces.malusMax,
    maximumBonus: edit.equilibreDesForces.bonusMax,
  };
  const balanceModifier = isInfluence
    ? computePowerBalanceModifier(ratio, balanceConfig)
    : 0;
  const finalRoll = Math.max(1, Math.min(100, roll + relationModifier + balanceModifier));
  const impactLabel = hasImpact
    ? getStateActionImpactPreviewLabel(type.key, edit.impactMaximum, finalRoll)
    : null;

  return (
    <aside
      aria-label={`Aperçu de ${type.label_fr}`}
      className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
      style={{ borderColor: "var(--border-muted)" }}
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Aperçu côté joueur</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
        Scénario de référence. Il ne modifie aucune donnée.
      </p>

      <div className="mt-3">
        <p className="text-sm text-[var(--foreground-muted)]">Coût affiché</p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {edit.cost} point{edit.cost > 1 ? "s" : ""} d’action
        </p>
      </div>

      {hasImpact ? (
        <>
          <label className="mt-5 block text-sm text-[var(--foreground)]">
            Jet de départ : <strong>{roll}/100</strong>
            <input
              type="range"
              min={1}
              max={100}
              value={roll}
              onChange={(event) => setRoll(Number(event.target.value))}
              className="mt-2 block min-h-11 w-full accent-[var(--accent)]"
            />
          </label>

          {isInfluence ? (
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-[var(--foreground)]">
                Relation actuelle : <strong>{formatSigned(relation)}</strong>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={relation}
                  onChange={(event) => setRelation(Number(event.target.value))}
                  className="mt-2 block min-h-11 w-full accent-[var(--accent)]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--foreground-muted)]">
                  Influence émetteur
                  <input
                    type="number"
                    min={0}
                    value={emitterInfluence}
                    onChange={(event) => setEmitterInfluence(Math.max(0, Number(event.target.value)))}
                    className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <label className="text-xs text-[var(--foreground-muted)]">
                  Influence cible
                  <input
                    type="number"
                    min={0.01}
                    value={targetInfluence}
                    onChange={(event) => setTargetInfluence(Math.max(0.01, Number(event.target.value)))}
                    className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
              </div>
              <dl className="space-y-2 border-y py-3 text-sm" style={{ borderColor: "var(--border-muted)" }}>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--foreground-muted)]">Bonus ou malus de relation</dt>
                  <dd className="font-medium text-[var(--foreground)]">{formatSigned(relationModifier)} au jet</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--foreground-muted)]">Rapport de force ({ratio.toFixed(2)}×)</dt>
                  <dd className="font-medium text-[var(--foreground)]">{formatSigned(balanceModifier)} au jet</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--foreground-muted)]">Jet final</dt>
                  <dd className="font-semibold text-[var(--foreground)]">{finalRoll}/100</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="mt-5">
            <p className="text-sm text-[var(--foreground-muted)]">Conséquence estimée</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">
              {impactLabel ?? `${finalRoll}/100`}
            </p>
            {isMilitaryStateActionKey(type.key) ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                L’action apparaît si la relation est inférieure ou égale à {formatSigned(edit.minRelationRequired)}.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            {ACTION_DESCRIPTIONS[type.key] ?? "Le MJ contrôle la résolution et les conséquences de cette action."}
          </p>
          {actionRequiresTargetAcceptance(type.key, type.params_schema) ? (
            <p className="mt-3 text-xs text-[var(--accent)]">La cible doit accepter avant la validation du MJ.</p>
          ) : actionRequiresTarget(type.key) ? (
            <p className="mt-3 text-xs text-[var(--foreground-muted)]">Le joueur doit choisir un pays cible.</p>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function TypeRow({
  type,
  edit,
  baseline,
  onEditChange,
  onReset,
  expanded,
  onToggle,
}: {
  type: StateActionType;
  edit: EditState;
  baseline: EditState;
  onEditChange: (update: Partial<EditState>) => void;
  onReset: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isDiplo = type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique";
  const isDemandeUp = type.key === "demande_up";
  const isPriseInfluence = type.key === "prise_influence";
  const isMilitary = isMilitaryStateActionKey(type.key);
  const dirty = !editsEqual(edit, baseline);

  return (
    <li
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: dirty ? "var(--accent)" : "var(--border)", background: "var(--background-panel)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
            className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--background-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <DisclosureChevron open={expanded} direction="right" className="shrink-0 text-[var(--foreground-muted)]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--foreground)]">{type.label_fr}</span>
            {dirty ? (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-[#0f1419]">
                Modifié
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-[var(--foreground-muted)] sm:text-sm">
            {ACTION_DESCRIPTIONS[type.key] ?? "Action dont la résolution finale reste contrôlée par le MJ."}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm text-[var(--foreground-muted)] sm:block">
          {edit.cost} PA
        </span>
      </button>

      {expanded && (
      <div className="grid">
        <div className="min-h-0 overflow-hidden">
          <div className="border-t p-3" style={{ borderColor: "var(--border-muted)" }}>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--foreground)]">Réglages essentiels</h3>
                    <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                      Ce que le joueur paie, voit et peut déclencher.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={!dirty}
                    className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] disabled:opacity-40"
                  >
                    Réinitialiser
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <NumberField
                    id={`action-${type.id}-cost`}
                    label="Coût en points d’action"
                    help="Nombre de points retirés au joueur dès l’envoi de la demande."
                    value={edit.cost}
                    min={0}
                    step={1}
                    onChange={(cost) => onEditChange({ cost })}
                  />
                  {(isDiplo || isPriseInfluence || isMilitary) ? (
                    <NumberField
                      id={`action-${type.id}-impact`}
                      label={isPriseInfluence ? "Gain maximal d’influence (%)" : "Variation maximale"}
                      help={
                        isPriseInfluence
                          ? "Gain obtenu avec un jet final de 100 sur 100."
                          : "Variation obtenue avec un jet final de 100 sur 100."
                      }
                      value={edit.impactMaximum}
                      min={0}
                      max={100}
                      onChange={(impactMaximum) => onEditChange({ impactMaximum })}
                    />
                  ) : null}
                  {isMilitary ? (
                    <NumberField
                      id={`action-${type.id}-relation`}
                      label="Relation maximale autorisée"
                      help="L’action est disponible lorsque la relation est inférieure ou égale à cette valeur."
                      value={edit.minRelationRequired}
                      min={-100}
                      max={100}
                      onChange={(minRelationRequired) => onEditChange({ minRelationRequired })}
                      hint="−100 = hostilité totale · +100 = alliance totale"
                    />
                  ) : null}
                </div>

                {isDemandeUp ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <StatBonusCheckboxes
                      label="Pour une hausse d’effectifs"
                      statBonus={edit.statBonusUpNombre}
                      onChange={(statBonusUpNombre) => onEditChange({ statBonusUpNombre })}
                    />
                    <StatBonusCheckboxes
                      label="Pour une hausse technologique"
                      statBonus={edit.statBonusUpTech}
                      onChange={(statBonusUpTech) => onEditChange({ statBonusUpTech })}
                    />
                  </div>
                ) : null}

                {isDiplo ? (
                  <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      Réglages avancés du jet
                      <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
                    </summary>
                    <div className="pt-3">
                      <StatBonusCheckboxes
                        label="Statistiques prises en compte"
                        statBonus={edit.statBonus}
                        onChange={(statBonus) => onEditChange({ statBonus })}
                      />
                    </div>
                  </details>
                ) : null}

                {isPriseInfluence ? (
                  <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      Réglages avancés du rapport de force
                      <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
                    </summary>
                    <div className="grid gap-3 pt-3 sm:grid-cols-2">
                      <NumberField
                        id={`action-${type.id}-relations-amplitude`}
                        label="Poids de la relation"
                        help="Amplitude du bonus ou du malus lié à la relation actuelle. Exemple : 20 transforme une relation de −50 en malus de −10."
                        value={edit.amplitudeRelations}
                        min={0}
                        max={100}
                        onChange={(amplitudeRelations) => onEditChange({ amplitudeRelations })}
                      />
                      <NumberField
                        id={`action-${type.id}-balance-ratio`}
                        label="Rapport sans bonus ni malus"
                        help="Rapport entre l’influence de l’émetteur et celle de la cible qui ne donne ni bonus ni malus."
                        value={edit.equilibreDesForces.ratioEquilibre}
                        min={0}
                        step={0.1}
                        onChange={(ratioEquilibre) =>
                          onEditChange({
                            equilibreDesForces: { ...edit.equilibreDesForces, ratioEquilibre },
                          })
                        }
                      />
                      <NumberField
                        id={`action-${type.id}-min-ratio`}
                        label="Rapport qui atteint le malus maximal"
                        help="À ce rapport ou en dessous, le malus maximal est appliqué."
                        value={edit.equilibreDesForces.ratioMin}
                        min={0}
                        step={0.1}
                        onChange={(ratioMin) =>
                          onEditChange({
                            equilibreDesForces: { ...edit.equilibreDesForces, ratioMin },
                          })
                        }
                      />
                      <NumberField
                        id={`action-${type.id}-max-penalty`}
                        label="Malus maximal"
                        help="Nombre de points retirés au jet lorsque l’émetteur est nettement moins influent que la cible."
                        value={edit.equilibreDesForces.malusMax}
                        min={0}
                        max={100}
                        onChange={(malusMax) =>
                          onEditChange({
                            equilibreDesForces: { ...edit.equilibreDesForces, malusMax },
                          })
                        }
                      />
                      <NumberField
                        id={`action-${type.id}-max-ratio`}
                        label="Rapport qui atteint le bonus maximal"
                        help="À ce rapport ou au-dessus, le bonus maximal est appliqué."
                        value={edit.equilibreDesForces.ratioMax}
                        min={0}
                        step={0.1}
                        onChange={(ratioMax) =>
                          onEditChange({
                            equilibreDesForces: { ...edit.equilibreDesForces, ratioMax },
                          })
                        }
                      />
                      <NumberField
                        id={`action-${type.id}-max-bonus`}
                        label="Bonus maximal"
                        help="Nombre de points ajoutés au jet lorsque l’émetteur est nettement plus influent que la cible."
                        value={edit.equilibreDesForces.bonusMax}
                        min={0}
                        max={100}
                        onChange={(bonusMax) =>
                          onEditChange({
                            equilibreDesForces: { ...edit.equilibreDesForces, bonusMax },
                          })
                        }
                      />
                    </div>
                    <div
                      className="mt-5 rounded-lg bg-[var(--background-elevated)] p-3 text-sm leading-relaxed text-[var(--foreground)]"
                    >
                      <p className="font-medium">Paramètre hérité sans effet actuel</p>
                      <p className="mt-1 text-[var(--foreground-muted)]">
                        Le « poids de l’influence » est encore stocké, mais aucun calcul du jeu ne l’utilise. Il reste visible pour ne pas masquer une donnée existante.
                      </p>
                      <label htmlFor={`action-${type.id}-legacy-influence`} className="mt-3 block text-xs text-[var(--foreground-muted)]">
                        Poids de l’influence (hérité)
                      </label>
                      <input
                        id={`action-${type.id}-legacy-influence`}
                        type="number"
                        min={0}
                        value={edit.amplitudeInfluence}
                        onChange={(event) => onEditChange({ amplitudeInfluence: Number(event.target.value) })}
                        className="mt-1 min-h-11 w-full max-w-40 rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>
                  </details>
                ) : null}
              </div>

              <ActionPreview type={type} edit={edit} />
            </div>
          </div>
        </div>
      </div>
      )}
    </li>
  );
}

export function StateActionTypesForm({ types }: { types: StateActionType[] }) {
  const initialEdits = useMemo(
    () => Object.fromEntries(types.map((type) => [type.id, initEditForType(type)])),
    [types]
  );
  const [edits, setEdits] = useState<Record<string, EditState>>(initialEdits);
  const [savedEdits, setSavedEdits] = useState<Record<string, EditState>>(initialEdits);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(() => types[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string>(ACTION_GROUPS[0].id);

  const dirtyTypes = types.filter((type) => {
    const edit = edits[type.id] ?? initEditForType(type);
    const baseline = savedEdits[type.id] ?? initEditForType(type);
    return !editsEqual(edit, baseline);
  });

  const visibleGroups = ACTION_GROUPS.map((group) => ({
    ...group,
    types: types.filter(
      (type) =>
        group.keys.some((key) => key === type.key) &&
        matchesSearchText(query, [
          type.label_fr,
          type.key,
          ACTION_DESCRIPTIONS[type.key] ?? "",
          group.label,
        ])
    ),
  })).filter((group) => group.types.length > 0);

  const knownKeys = new Set<string>(ACTION_GROUPS.flatMap((group) => [...group.keys]));
  const otherTypes = types.filter(
    (type) =>
      !knownKeys.has(type.key) &&
      matchesSearchText(query, [type.label_fr, type.key, ACTION_DESCRIPTIONS[type.key] ?? ""])
  );

  function setEdit(id: string, update: Partial<EditState>) {
    setSuccess(null);
    setError(null);
    setEdits((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? initialEdits[id]), ...update },
    }));
  }

  async function saveAll() {
    if (dirtyTypes.length === 0 || saving) return;
    setError(null);
    setSuccess(null);

    for (const type of dirtyTypes) {
      const validationError = validateEdit(type, edits[type.id]);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSaving(true);
    const result = await updateStateActionTypes(
      dirtyTypes.map((type) => ({
        id: type.id,
        key: type.key,
        label_fr: type.label_fr,
        cost: edits[type.id].cost,
        params_schema: buildPatch(type, edits[type.id]),
        sort_order: type.sort_order,
      }))
    );
    setSaving(false);

    if (result.error) {
      setError(`${result.error} Aucun changement de ce lot n’a été appliqué.`);
      return;
    }
    setSavedEdits(edits);
    setSuccess(`${dirtyTypes.length} action${dirtyTypes.length > 1 ? "s" : ""} mise${dirtyTypes.length > 1 ? "s" : ""} à jour.`);
  }

  function resetAll() {
    setEdits(savedEdits);
    setError(null);
    setSuccess(null);
  }

  const groupsToRender = [
    ...visibleGroups,
    ...(otherTypes.length > 0
      ? [{ id: "autres", label: "Autres actions", description: "Actions non classées", keys: [], types: otherTypes }]
      : []),
  ];
  const groupNavigationItems = [
    ...ACTION_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      description: group.description,
      count: types.filter((type) => group.keys.some((key) => key === type.key)).length,
    })),
    ...(types.some((type) => !knownKeys.has(type.key))
      ? [{
          id: "autres",
          label: "Autres actions",
          description: "Actions non classées",
          count: types.filter((type) => !knownKeys.has(type.key)).length,
        }]
      : []),
  ];
  const displayedGroups = query
    ? groupsToRender
    : groupsToRender.filter((group) => group.id === activeGroupId);
  const reviewItems = dirtyTypes.map((type) => ({
    key: type.id,
    label: type.label_fr,
    detail: describeEditChanges(
      savedEdits[type.id] ?? initialEdits[type.id],
      edits[type.id] ?? initialEdits[type.id]
    ),
  }));

  return (
    <div className="space-y-4">
      <AdminSettingsGuide
        purpose="Ces réglages définissent le coût, les conditions d’accès et l’ampleur maximale de chaque action."
        impact="Le coût est visible avant l’envoi. Les seuils et valeurs maximales modifient ensuite les jets et leurs conséquences."
        check="Testez au moins un cas faible, neutre et fort dans l’aperçu. Aucun exemple affiché ici n’est enregistré."
        warning="Une modification s’applique aux prochaines demandes. Les demandes déjà résolues ne sont pas recalculées."
      />

      <section
        className="min-w-0"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Paramètres des actions</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Comparez les actions d’un même usage, puis ouvrez celle que vous voulez régler.
            </p>
          </div>
          <label className="w-full sm:max-w-sm">
            <span className="sr-only">Rechercher une action</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une action…"
              className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <AdminSectionNav
            label="Familles d’actions"
            items={groupNavigationItems}
            activeId={activeGroupId}
            onSelect={(id) => {
              setActiveGroupId(id);
              const nextGroup = groupsToRender.find((group) => group.id === id);
              setExpandedId(nextGroup?.types[0]?.id ?? null);
            }}
          />
          <div className="min-w-0 space-y-5">
            {displayedGroups.map((group) => (
              <section key={group.id} aria-labelledby={`action-group-${group.id}`}>
                <div className="mb-3">
                  <h3 id={`action-group-${group.id}`} className="text-base font-semibold text-[var(--foreground)]">
                    {group.label}
                  </h3>
                  <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">{group.description}</p>
                </div>
                <ul className="space-y-2">
                  {group.types.map((type) => (
                    <TypeRow
                      key={type.id}
                      type={type}
                      edit={edits[type.id] ?? initialEdits[type.id]}
                      baseline={savedEdits[type.id] ?? initialEdits[type.id]}
                      onEditChange={(update) => setEdit(type.id, update)}
                      onReset={() => {
                        setEdit(type.id, savedEdits[type.id] ?? initialEdits[type.id]);
                      }}
                      expanded={expandedId === type.id}
                      onToggle={() => setExpandedId((current) => current === type.id ? null : type.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {displayedGroups.length === 0 ? (
              <p className="border-y px-4 py-8 text-center text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>
                Aucune action ne correspond à cette recherche.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <AdminSaveBar
        dirtyCount={dirtyTypes.length}
        saving={saving}
        onSave={saveAll}
        onReset={resetAll}
        error={error}
        success={success}
        noun="action"
        reviewItems={reviewItems}
        saveLabel="Appliquer aux prochaines demandes"
      />
    </div>
  );
}
