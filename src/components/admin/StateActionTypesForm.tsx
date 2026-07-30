"use client";

import { useMemo, useState } from "react";
import { updateStateActionTypes } from "@/app/admin/actions-etat/actions";
import { AdminSaveBar, AdminSectionNav } from "@/components/admin/AdminSettingsUi";
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
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
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
  demande_up: "Le joueur demande à l’administration d’améliorer ses effectifs ou son niveau technologique.",
  investissements: "Le joueur engage une action de développement intérieur.",
  effort_fortifications: "Le joueur renforce les défenses de son pays.",
  ouverture_diplomatique: "Une réussite améliore la relation bilatérale avec le pays ciblé.",
  accord_commercial_politique: "La cible doit accepter l’accord avant la décision finale de l’administration.",
  cooperation_militaire: "La cible doit accepter la coopération avant la décision finale de l’administration.",
  alliance: "La cible doit accepter l’alliance avant la décision finale de l’administration.",
  insulte_diplomatique: "Une réussite dégrade la relation bilatérale avec le pays ciblé.",
  prise_influence: "Une réussite augmente l’influence de l’émetteur sur le pays ciblé.",
  escarmouche_militaire: "Action hostile limitée, disponible selon la relation entre les deux pays.",
  conflit_arme: "Conflit important, réservé aux relations fortement dégradées.",
  guerre_ouverte: "Niveau maximal d’hostilité et conséquences majeures.",
  espionnage: "Opération secrète qui peut révéler des informations sur le pays ciblé.",
  sabotage: "Opération secrète dont les conséquences sont décidées par l’administration.",
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
  if (before.cost !== after.cost) changes.push(`coût ${before.cost} → ${after.cost} points d’action`);
  if (before.impactMaximum !== after.impactMaximum) {
    changes.push(`conséquence maximale ${before.impactMaximum} → ${after.impactMaximum}`);
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
    return `${type.label_fr} : la conséquence maximale doit rester entre 0 et 100.`;
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
      return "Prise d’influence : l’effet maximal de la relation sur le jet doit rester entre 0 et 100.";
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
    <label htmlFor={id} className="grid min-w-0 gap-2 border-b py-2 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center" style={{ borderColor: "var(--border-muted)" }}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--foreground)]">{label}</span>
        <span id={`${id}-help`} className="mt-0.5 block text-xs leading-snug text-[var(--foreground-muted)]">{help}</span>
        {hint ? <span className="mt-1 block text-xs leading-snug text-[var(--foreground-muted)]">{hint}</span> : null}
      </span>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-10 w-full rounded-lg border bg-[var(--background)] px-3 text-base font-medium text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />
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
      <legend className="text-sm font-medium text-[var(--foreground)]">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {STAT_BONUS_KEYS.map(({ key, label: statLabel }) => (
          <label
            key={key}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm text-[var(--foreground)]"
            style={{
              borderColor: statBonus[key] !== false ? "var(--accent)" : "var(--border-muted)",
              background: statBonus[key] !== false ? "var(--background-elevated)" : "transparent",
            }}
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
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Exemple de résultat</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
        Modifiez les valeurs proposées pour voir la conséquence. Cet exemple n’est pas enregistré.
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
            Jet de conséquence de l’exemple : <strong>{roll}/100</strong>
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
                  Influence du pays émetteur
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
                  Influence du pays cible
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
                  <dt className="text-[var(--foreground-muted)]">Rapport d’influence : émetteur ÷ cible ({ratio.toFixed(2)}×)</dt>
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
            {ACTION_DESCRIPTIONS[type.key] ?? "L’administration décide du résultat et des conséquences de cette action."}
          </p>
          {actionRequiresTargetAcceptance(type.key, type.params_schema) ? (
            <p className="mt-3 text-xs text-[var(--accent)]">La cible doit accepter avant la décision de l’administration.</p>
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
}: {
  type: StateActionType;
  edit: EditState;
  baseline: EditState;
  onEditChange: (update: Partial<EditState>) => void;
  onReset: () => void;
}) {
  const isDiplo = type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique";
  const isDemandeUp = type.key === "demande_up";
  const isPriseInfluence = type.key === "prise_influence";
  const isMilitary = isMilitaryStateActionKey(type.key);
  const dirty = !editsEqual(edit, baseline);

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: dirty ? "var(--accent)" : "var(--border)", background: "var(--background-panel)" }}
    >
      <header className="flex min-h-14 items-center gap-3 border-b px-3 py-2" style={{ borderColor: "var(--border-muted)" }}>
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
            {ACTION_DESCRIPTIONS[type.key] ?? "L’administration décide du résultat final de cette action."}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm text-[var(--foreground-muted)] sm:block">
          {edit.cost} point{edit.cost > 1 ? "s" : ""} d’action
        </span>
      </header>

      <div className="grid">
        <div className="min-h-0 overflow-hidden">
          <div className="p-3">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Paramètres</h3>
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={!dirty}
                    className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] disabled:opacity-40"
                  >
                    Rétablir
                  </button>
                </div>

                <div className="mt-2">
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
                      label={
                        isPriseInfluence
                          ? "Gain maximal d’influence (%)"
                          : type.key === "ouverture_diplomatique"
                            ? "Gain maximal de relation (points)"
                            : "Baisse maximale de relation (points)"
                      }
                      help={
                        isPriseInfluence
                          ? "Gain obtenu avec un jet de conséquence de 100 sur 100."
                          : "Variation obtenue avec un jet de conséquence de 100 sur 100."
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
                  <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      Statistiques des demandes d’amélioration
                      <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
                    </summary>
                    <div className="grid gap-4 pt-3 sm:grid-cols-2">
                      <StatBonusCheckboxes
                        label="Hausse d’effectifs"
                        statBonus={edit.statBonusUpNombre}
                        onChange={(statBonusUpNombre) => onEditChange({ statBonusUpNombre })}
                      />
                      <StatBonusCheckboxes
                        label="Hausse technologique"
                        statBonus={edit.statBonusUpTech}
                        onChange={(statBonusUpTech) => onEditChange({ statBonusUpTech })}
                      />
                    </div>
                  </details>
                ) : null}

                {isDiplo ? (
                  <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      Réglages avancés du jet
                      <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
                    </summary>
                    <div className="pt-3">
                      <StatBonusCheckboxes
                        label="Statistiques qui modifient le jet"
                        statBonus={edit.statBonus}
                        onChange={(statBonus) => onEditChange({ statBonus })}
                      />
                    </div>
                  </details>
                ) : null}

                {isPriseInfluence ? (
                  <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-muted)" }}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      Rapport d’influence
                      <span aria-hidden className="text-[var(--foreground-muted)]">▾</span>
                    </summary>
                    <p className="pt-3 text-xs leading-snug text-[var(--foreground-muted)]">
                      Le rapport divise l’influence de l’émetteur par celle de la cible : 2 signifie qu’il est deux fois plus influent.
                    </p>
                    <div className="grid gap-3 pt-3 sm:grid-cols-2">
                      <NumberField
                        id={`action-${type.id}-relations-amplitude`}
                        label="Effet maximal de la relation sur le jet"
                        help="Nombre maximal de points ajoutés ou retirés au jet. Exemple : 20 transforme une relation de −50 en malus de −10."
                        value={edit.amplitudeRelations}
                        min={0}
                        max={100}
                        onChange={(amplitudeRelations) => onEditChange({ amplitudeRelations })}
                      />
                      <NumberField
                        id={`action-${type.id}-influence-amplitude`}
                        label="Amplitude d’influence (paramètre hérité)"
                        help="Valeur conservée dans la configuration, mais non utilisée par le calcul actuel. Ne la modifiez que pour compatibilité."
                        value={edit.amplitudeInfluence}
                        min={0}
                        onChange={(amplitudeInfluence) => onEditChange({ amplitudeInfluence })}
                      />
                      <NumberField
                        id={`action-${type.id}-balance-ratio`}
                        label="Rapport sans bonus ni malus"
                        help="Influence de l’émetteur divisée par celle de la cible. À ce rapport, aucun bonus ni malus n’est appliqué."
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
                        help="Influence de l’émetteur divisée par celle de la cible. À ce rapport ou en dessous, le malus maximal est appliqué."
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
                        help="Influence de l’émetteur divisée par celle de la cible. À ce rapport ou au-dessus, le bonus maximal est appliqué."
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
                  </details>
                ) : null}
              </div>

              <ActionPreview type={type} edit={edit} />
            </div>
          </div>
        </div>
      </div>
    </section>
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
  useUnsavedChangesGuard(dirtyTypes.length > 0);

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
    try {
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

      if (result.error) {
        setError(`${result.error} Aucun changement de ce lot n’a été appliqué.`);
        return;
      }
      setSavedEdits(edits);
      setSuccess(`${dirtyTypes.length} action${dirtyTypes.length > 1 ? "s" : ""} mise${dirtyTypes.length > 1 ? "s" : ""} à jour.`);
    } catch {
      setError("Les actions n’ont pas pu être enregistrées. Vérifiez la connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
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
  const activeTypes = query
    ? groupsToRender.flatMap((group) => group.types)
    : groupsToRender.find((group) => group.id === activeGroupId)?.types ?? [];
  const selectedType = activeTypes.find((type) => type.id === expandedId) ?? activeTypes[0];
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
      <section className="min-w-0">
        <div className="border-y py-3" style={{ borderColor: "var(--border)" }}>
          <label className="block w-full sm:max-w-md">
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

        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
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
          <div className="grid min-w-0 gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
            {activeTypes.length > 0 ? (
              <nav aria-label="Actions de la famille">
                <label className="block xl:hidden">
                  <span className="sr-only">Action à régler</span>
                  <select
                    value={selectedType?.id ?? ""}
                    onChange={(event) => setExpandedId(event.target.value)}
                    className="min-h-11 w-full rounded-lg border bg-[var(--background-panel)] px-3 text-sm font-semibold text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {activeTypes.map((type) => {
                      const edit = edits[type.id] ?? initialEdits[type.id];
                      const dirty = !editsEqual(edit, savedEdits[type.id] ?? initialEdits[type.id]);
                      return (
                        <option key={type.id} value={type.id}>
                          {type.label_fr}{dirty ? " • modifiée" : ` · coût ${edit.cost}`}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="hidden xl:flex xl:flex-col">
                  {activeTypes.map((type) => {
                    const edit = edits[type.id] ?? initialEdits[type.id];
                    const active = type.id === selectedType?.id;
                    const dirty = !editsEqual(edit, savedEdits[type.id] ?? initialEdits[type.id]);
                    return (
                      <button
                        key={type.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        onClick={() => setExpandedId(type.id)}
                        className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition-colors"
                        style={{
                          background: active ? "var(--background-elevated)" : "transparent",
                          color: active ? "var(--foreground)" : "var(--foreground-muted)",
                          boxShadow: active ? "inset 0 0 0 1px var(--border)" : undefined,
                        }}
                      >
                        <span className="min-w-0 truncate font-medium">{type.label_fr}</span>
                        <span className={dirty ? "text-[var(--accent)]" : "text-xs"}>{dirty ? "●" : edit.cost}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            ) : null}

            {selectedType ? (
              <TypeRow
                key={selectedType.id}
                type={selectedType}
                edit={edits[selectedType.id] ?? initialEdits[selectedType.id]}
                baseline={savedEdits[selectedType.id] ?? initialEdits[selectedType.id]}
                onEditChange={(update) => setEdit(selectedType.id, update)}
                onReset={() => setEdit(selectedType.id, savedEdits[selectedType.id] ?? initialEdits[selectedType.id])}
              />
            ) : (
              <p className="border-y px-4 py-8 text-center text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border-muted)" }}>
                Aucune action ne correspond à cette recherche.
              </p>
            )}
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
