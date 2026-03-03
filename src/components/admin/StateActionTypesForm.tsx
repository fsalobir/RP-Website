"use client";

import { useState } from "react";
import { updateStateActionType } from "@/app/admin/actions-etat/actions";
import type { StateActionType } from "@/types/database";

const panelClass = "rounded-lg border p-6";
const panelStyle = { background: "var(--background-panel)", borderColor: "var(--border)" };

type Props = {
  types: StateActionType[];
};

export function StateActionTypesForm({ types }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(
    id: string,
    patch: { label_fr?: string; cost?: number; params_schema?: Record<string, unknown> }
  ) {
    setSavingId(id);
    setError(null);
    const result = await updateStateActionType(id, patch);
    setSavingId(null);
    if (result.error) setError(result.error);
  }

  return (
    <div className="space-y-6">
      <section className={panelClass} style={panelStyle}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Types d'actions d'État
        </h2>
        <p className="mb-6 text-sm text-[var(--foreground-muted)]">
          Coût en « actions » et paramètres par type (ex. relation_delta pour Insulte diplomatique).
        </p>
        {error && (
          <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <ul className="space-y-6">
          {types.map((t) => (
            <TypeRow
              key={t.id}
              type={t}
              onSave={handleSave}
              saving={savingId === t.id}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TypeRow({
  type,
  onSave,
  saving,
}: {
  type: StateActionType;
  onSave: (id: string, patch: { label_fr?: string; cost?: number; params_schema?: Record<string, unknown> }) => Promise<void>;
  saving: boolean;
}) {
  const [labelFr, setLabelFr] = useState(type.label_fr);
  const [cost, setCost] = useState(type.cost);
  const params = (type.params_schema ?? {}) as Record<string, number>;
  const [relationDelta, setRelationDelta] = useState<number>(
    typeof params.relation_delta === "number" ? params.relation_delta : -10
  );

  const hasChanges =
    labelFr !== type.label_fr ||
    cost !== type.cost ||
    (type.key === "insulte_diplomatique" && relationDelta !== (params.relation_delta ?? -10));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || saving) return;
    const patch: { label_fr?: string; cost?: number; params_schema?: Record<string, unknown> } = {
      label_fr: labelFr,
      cost,
    };
    if (type.key === "insulte_diplomatique") {
      patch.params_schema = { relation_delta: relationDelta };
    }
    onSave(type.id, patch);
  }

  return (
    <li className="rounded border p-4" style={{ borderColor: "var(--border)" }}>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Clé</label>
          <span className="text-sm font-mono text-[var(--foreground)]">{type.key}</span>
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Libellé</label>
          <input
            type="text"
            value={labelFr}
            onChange={(e) => setLabelFr(e.target.value)}
            className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Coût</label>
          <input
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(Number(e.target.value) || 0)}
            className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        {type.key === "insulte_diplomatique" && (
          <div className="w-32">
            <label className="mb-1 block text-sm text-[var(--foreground-muted)]">relation_delta</label>
            <input
              type="number"
              value={relationDelta}
              onChange={(e) => setRelationDelta(Number(e.target.value) ?? -10)}
              className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={!hasChanges || saving}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </li>
  );
}
