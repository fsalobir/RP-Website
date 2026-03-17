"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStateActionType } from "@/app/admin/actions-etat/actions";
import type { StateActionType } from "@/types/database";
import {
  getDefaultImpactMaximum,
  getStateActionMinRelationRequired,
  isMilitaryStateActionKey,
} from "@/lib/actionKeys";

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

const STAT_BONUS_KEYS = [
  { key: "militarism", label: "Militarisme" },
  { key: "industry", label: "Industrie" },
  { key: "science", label: "Science" },
  { key: "stability", label: "Stabilité" },
] as const;

function defaultStatBonus(paramsKey: string, params: Record<string, unknown>): Record<string, boolean> {
  const from = (params[paramsKey] ?? {}) as Record<string, boolean>;
  return Object.fromEntries(
    STAT_BONUS_KEYS.map(({ key }) => [key, from[key] !== false])
  );
}

type EquilibreDesForces = {
  ratioEquilibre: number;
  malusMax: number;
  bonusMax: number;
  ratioMin: number;
  ratioMax: number;
};

function defaultEquilibre(params: Record<string, unknown>): EquilibreDesForces {
  const e = (params.equilibre_des_forces ?? {}) as Record<string, number>;
  return {
    ratioEquilibre: typeof e.ratio_equilibre === "number" ? e.ratio_equilibre : 1,
    malusMax: typeof e.malus_max === "number" ? e.malus_max : 20,
    bonusMax: typeof e.bonus_max === "number" ? e.bonus_max : 20,
    ratioMin: typeof e.ratio_min === "number" ? e.ratio_min : 0.5,
    ratioMax: typeof e.ratio_max === "number" ? e.ratio_max : 2,
  };
}

type EditState = {
  cost: number;
  impactMaximum: number;
  minRelationRequired: number;
  statBonus: Record<string, boolean>;
  statBonusUpNombre: Record<string, boolean>;
  statBonusUpTech: Record<string, boolean>;
  equilibreDesForces: EquilibreDesForces;
  amplitudeRelations: number;
  amplitudeInfluence: number;
};

function initEditForType(type: StateActionType): EditState {
  const params = (type.params_schema ?? {}) as Record<string, unknown>;
  const statBonusFromParams = (params.stat_bonus ?? {}) as Record<string, boolean>;
  const defaultImpact = getDefaultImpactMaximum(type.key);
  return {
    cost: type.cost,
    impactMaximum: typeof params.impact_maximum === "number" ? params.impact_maximum : defaultImpact,
    minRelationRequired: getStateActionMinRelationRequired(type.key, params) ?? 0,
    statBonus: Object.fromEntries(
      STAT_BONUS_KEYS.map(({ key }) => [key, statBonusFromParams[key] !== false])
    ),
    statBonusUpNombre: defaultStatBonus("stat_bonus_up_nombre", params),
    statBonusUpTech: defaultStatBonus("stat_bonus_up_tech", params),
    equilibreDesForces: defaultEquilibre(params),
    amplitudeRelations: typeof params.amplitude_relations === "number" ? params.amplitude_relations : 0,
    amplitudeInfluence: typeof params.amplitude_influence === "number" ? params.amplitude_influence : 0,
  };
}

function hasChanges(type: StateActionType, edit: EditState): boolean {
  const params = (type.params_schema ?? {}) as Record<string, unknown>;
  const defaultImpactMax = typeof params.impact_maximum === "number" ? params.impact_maximum : getDefaultImpactMaximum(type.key);
  const minRelationDefault = getStateActionMinRelationRequired(type.key, params);
  const statBonusFromParams = (params.stat_bonus ?? {}) as Record<string, boolean>;
  const statBonusChanged = STAT_BONUS_KEYS.some(
    ({ key }) => edit.statBonus[key] !== (statBonusFromParams[key] !== false)
  );
  if (type.key === "demande_up") {
    const upNombreChanged = STAT_BONUS_KEYS.some(
      ({ key }) =>
        edit.statBonusUpNombre[key] !==
        ((params.stat_bonus_up_nombre as Record<string, boolean>)?.[key] !== false)
    );
    const upTechChanged = STAT_BONUS_KEYS.some(
      ({ key }) =>
        edit.statBonusUpTech[key] !==
        ((params.stat_bonus_up_tech as Record<string, boolean>)?.[key] !== false)
    );
    return edit.cost !== type.cost || upNombreChanged || upTechChanged;
  }
  if (type.key === "prise_influence") {
    const defaultPriseImpact = typeof params.impact_maximum === "number" ? params.impact_maximum : 100;
    const eq = (params.equilibre_des_forces ?? {}) as Record<string, number>;
    const equilibreChanged =
      edit.equilibreDesForces.ratioEquilibre !== (eq.ratio_equilibre ?? 1) ||
      edit.equilibreDesForces.malusMax !== (eq.malus_max ?? 20) ||
      edit.equilibreDesForces.bonusMax !== (eq.bonus_max ?? 20) ||
      edit.equilibreDesForces.ratioMin !== (eq.ratio_min ?? 0.5) ||
      edit.equilibreDesForces.ratioMax !== (eq.ratio_max ?? 2);
    const amplitudeDefault = typeof params.amplitude_relations === "number" ? params.amplitude_relations : 0;
    const amplitudeInfDefault = typeof params.amplitude_influence === "number" ? params.amplitude_influence : 0;
    return (
      edit.cost !== type.cost ||
      edit.impactMaximum !== defaultPriseImpact ||
      edit.amplitudeRelations !== amplitudeDefault ||
      edit.amplitudeInfluence !== amplitudeInfDefault ||
      equilibreChanged
    );
  }
  if (isMilitaryStateActionKey(type.key)) {
    return (
      edit.cost !== type.cost ||
      edit.impactMaximum !== defaultImpactMax ||
      edit.minRelationRequired !== (minRelationDefault ?? 0)
    );
  }
  return (
    edit.cost !== type.cost ||
    ((type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique") &&
      edit.impactMaximum !== defaultImpactMax) ||
    statBonusChanged
  );
}

function buildPatch(type: StateActionType, edit: EditState): { cost: number; params_schema?: Record<string, unknown> } {
  const params = (type.params_schema ?? {}) as Record<string, unknown>;
  const defaultImpactMax = typeof params.impact_maximum === "number" ? params.impact_maximum : getDefaultImpactMaximum(type.key);
  const patch: { cost: number; params_schema?: Record<string, unknown> } = { cost: edit.cost };
  if (type.key === "demande_up") {
    patch.params_schema = {
      ...params,
      stat_bonus_up_nombre: edit.statBonusUpNombre,
      stat_bonus_up_tech: edit.statBonusUpTech,
    };
    return patch;
  }
  if (type.key === "prise_influence") {
    patch.params_schema = {
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
    return patch;
  }
  if (isMilitaryStateActionKey(type.key)) {
    patch.params_schema = {
      ...params,
      impact_maximum: edit.impactMaximum,
      min_relation_required: edit.minRelationRequired,
    };
    return patch;
  }
  const needsParams =
    (type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique") &&
    edit.impactMaximum !== defaultImpactMax;
  const statBonusFromParams = (params.stat_bonus ?? {}) as Record<string, boolean>;
  const statBonusChanged = STAT_BONUS_KEYS.some(
    ({ key }) => edit.statBonus[key] !== (statBonusFromParams[key] !== false)
  );
  if (needsParams || statBonusChanged) {
    patch.params_schema = {
      ...params,
      stat_bonus: edit.statBonus,
      ...((type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique") && {
        impact_maximum: edit.impactMaximum,
      }),
    };
  }
  return patch;
}

type Props = {
  types: StateActionType[];
};

export function StateActionTypesForm({ types }: Props) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(types.map((t) => [t.id, initEditForType(t)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(() => types[0]?.id ?? null);

  const hasAnyChanges = types.some((t) => hasChanges(t, edits[t.id] ?? initEditForType(t)));

  async function handleSaveAll() {
    if (!hasAnyChanges || saving) return;
    setSaving(true);
    setError(null);
    for (const t of types) {
      const edit = edits[t.id];
      if (!edit || !hasChanges(t, edit)) continue;
      const patch = buildPatch(t, edit);
      const result = await updateStateActionType(t.id, patch);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    router.refresh();
  }

  function setEdit(id: string, update: Partial<EditState>) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? initEditForType(types.find((t) => t.id === id)!)), ...update },
    }));
  }

  return (
    <div className="space-y-6">
      <section className={panelClass} style={panelStyle}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Types d'actions d'État
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Coût en « actions » et paramètres par type.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={!hasAnyChanges || saving}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <ul className="space-y-1">
          {types.map((t) => (
            <TypeRow
              key={t.id}
              type={t}
              edit={edits[t.id] ?? initEditForType(t)}
              onEditChange={(update) => setEdit(t.id, update)}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId((prev) => (prev === t.id ? null : t.id))}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatBonusCheckboxes({
  label,
  statBonus,
  onStatBonusChange,
  edit,
  onEditChange,
  field,
}: {
  label: string;
  statBonus: Record<string, boolean>;
  onStatBonusChange?: (v: Record<string, boolean>) => void;
  edit?: EditState;
  onEditChange?: (u: Partial<EditState>) => void;
  field?: "statBonus" | "statBonusUpNombre" | "statBonusUpTech";
}) {
  const setKey = (key: string, value: boolean) => {
    if (field && edit && onEditChange)
      onEditChange({ [field]: { ...statBonus, [key]: value } } as Partial<EditState>);
    else if (onStatBonusChange) onStatBonusChange({ ...statBonus, [key]: value });
  };
  return (
    <div className="flex flex-col gap-0.5">
      <label className="block text-xs text-[var(--foreground-muted)]">{label}</label>
      <div className="flex flex-wrap gap-2">
        {STAT_BONUS_KEYS.map(({ key, label: l }) => (
          <label key={key} className="flex cursor-pointer items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={statBonus[key] !== false}
              onChange={(e) => setKey(key, e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            <span className="text-[var(--foreground)]">{l}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TypeRow({
  type,
  edit,
  onEditChange,
  expanded,
  onToggle,
}: {
  type: StateActionType;
  edit: EditState;
  onEditChange: (update: Partial<EditState>) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isDiplo = type.key === "insulte_diplomatique" || type.key === "ouverture_diplomatique";
  const isDemandeUp = type.key === "demande_up";
  const isPriseInfluence = type.key === "prise_influence";
  const isMilitary = isMilitaryStateActionKey(type.key);

  return (
    <li className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 py-2 px-3 text-left hover:bg-[var(--background)] transition-colors"
        style={{ background: expanded ? "var(--background)" : "transparent" }}
      >
        <span
          className="shrink-0 text-[var(--foreground-muted)] transition-transform duration-200"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          ▸
        </span>
        <span className="flex-1 text-sm font-medium text-[var(--foreground)]">{type.label_fr}</span>
        <span className="text-xs text-[var(--foreground-muted)]">Coût : {edit.cost}</span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 gap-y-2 border-t py-3 px-3 text-sm" style={{ borderColor: "var(--border)" }}>
        <div className="w-20">
          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Coût</label>
          <input
            type="number"
            min={0}
            value={edit.cost}
            onChange={(e) => onEditChange({ cost: Number(e.target.value) || 0 })}
            className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        {(isDiplo || isPriseInfluence || isMilitary) && (
          <div className="w-32">
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]" title={isPriseInfluence ? "Pourcentage maximum d'impact." : "Valeur max de variation de relation par action ; le jet d'impact (0–100) applique ce pourcentage."}>
              Impact max {isPriseInfluence ? "(%)" : ""}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={edit.impactMaximum}
              onChange={(e) => onEditChange({ impactMaximum: Number(e.target.value) ?? 50 })}
              className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        )}
        {isMilitary && (
          <div className="w-36">
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]" title="Relation bilatérale maximale requise pour autoriser l'action (ex. -75 = hostilité extrême).">
              Relation max requise
            </label>
            <input
              type="number"
              min={-100}
              max={100}
              value={edit.minRelationRequired}
              onChange={(e) => onEditChange({ minRelationRequired: Number(e.target.value) || 0 })}
              className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        )}
        {isDiplo && (
          <div className="flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
            <StatBonusCheckboxes
              label="Bonus stats"
              statBonus={edit.statBonus}
              edit={edit}
              onEditChange={onEditChange}
              field="statBonus"
            />
          </div>
        )}
        {isDemandeUp && (
          <div className="flex flex-wrap gap-4 border-l pl-3" style={{ borderColor: "var(--border)" }}>
            <StatBonusCheckboxes
              label="Up nombre"
              statBonus={edit.statBonusUpNombre}
              edit={edit}
              onEditChange={onEditChange}
              field="statBonusUpNombre"
            />
            <StatBonusCheckboxes
              label="Up tech"
              statBonus={edit.statBonusUpTech}
              edit={edit}
              onEditChange={onEditChange}
              field="statBonusUpTech"
            />
          </div>
        )}
        {isPriseInfluence && (
          <>
          <div className="w-28">
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]" title="Si 20 : relation -100 → -20 au jet, relation 0 → 0, relation +100 → +20.">
              Amplitude relations
            </label>
            <input
              type="number"
              min={0}
              value={edit.amplitudeRelations}
              onChange={(e) => onEditChange({ amplitudeRelations: Number(e.target.value) || 0 })}
              className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="w-28">
            <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]" title="Rang d'influence du pays émetteur (0–100 %) : si 15, top influence → +15 au jet, plus faible → 0.">
              Amplitude influence
            </label>
            <input
              type="number"
              min={0}
              value={edit.amplitudeInfluence}
              onChange={(e) => onEditChange({ amplitudeInfluence: Number(e.target.value) || 0 })}
              className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="flex flex-col gap-1.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-medium text-[var(--foreground-muted)]" title="Ratio = influence émetteur / cible. Équilibre = ni malus ni bonus ; min/max = bornes.">
              Équilibre des forces
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="w-28">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ratio équilibre</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={edit.equilibreDesForces.ratioEquilibre}
                  onChange={(e) =>
                    onEditChange({
                      equilibreDesForces: {
                        ...edit.equilibreDesForces,
                        ratioEquilibre: Number(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="w-20">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Malus max %</label>
                <input
                  type="number"
                  min={0}
                  value={edit.equilibreDesForces.malusMax}
                  onChange={(e) =>
                    onEditChange({
                      equilibreDesForces: {
                        ...edit.equilibreDesForces,
                        malusMax: Number(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="w-20">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Bonus max %</label>
                <input
                  type="number"
                  min={0}
                  value={edit.equilibreDesForces.bonusMax}
                  onChange={(e) =>
                    onEditChange({
                      equilibreDesForces: {
                        ...edit.equilibreDesForces,
                        bonusMax: Number(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="w-24">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ratio min</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={edit.equilibreDesForces.ratioMin}
                  onChange={(e) =>
                    onEditChange({
                      equilibreDesForces: {
                        ...edit.equilibreDesForces,
                        ratioMin: Number(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="w-24">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ratio max</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={edit.equilibreDesForces.ratioMax}
                  onChange={(e) =>
                    onEditChange({
                      equilibreDesForces: {
                        ...edit.equilibreDesForces,
                        ratioMax: Number(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full rounded border bg-[var(--background)] px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
            </div>
          </div>
          </>
        )}
          </div>
        </div>
      </div>
    </li>
  );
}
