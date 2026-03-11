"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LAW_DEFINITIONS, getLawLevelKeyFromScore, type LawDefinition } from "@/lib/laws";
import { updateLawScore } from "./actions";

function LawScoreRow({
  def,
  countryId,
  initialScore,
  initialTargetScore,
  levelThresholds,
}: {
  def: LawDefinition;
  countryId: string;
  initialScore: number;
  initialTargetScore: number;
  levelThresholds: Record<string, number> | undefined;
}) {
  const router = useRouter();
  const [score, setScore] = useState(String(initialScore));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreNum = Math.max(0, Math.min(500, Math.round(Number(score) || 0)));
  const currentLevel = getLawLevelKeyFromScore(scoreNum, levelThresholds, def.levels);
  const targetLevel = getLawLevelKeyFromScore(initialTargetScore, levelThresholds, def.levels);
  const currentLabel = def.levels.find((l) => l.key === currentLevel)?.label ?? currentLevel;
  const targetLabel = def.levels.find((l) => l.key === targetLevel)?.label ?? targetLevel;

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await updateLawScore(countryId, def.lawKey, scoreNum);
    setSaving(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
    >
      <h3 className="mb-2 text-sm font-semibold text-[var(--foreground)]">{def.title_fr}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Score (0–500)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-20 rounded border bg-[var(--background)] px-2 py-1 font-mono text-sm text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div className="text-xs text-[var(--foreground-muted)]">
          <span className="text-[var(--foreground)]">Niveau :</span> {currentLabel}
        </div>
        <div className="text-xs text-[var(--foreground-muted)]">
          <span className="text-[var(--foreground)]">Cible :</span> {targetLabel}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded py-1.5 px-3 text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0f1419" }}
        >
          {saving ? "…" : "Enregistrer"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function CountryLawsAdminBlock({
  countryId,
  lawRows,
  configsByKey,
}: {
  countryId: string;
  lawRows: Array<{ law_key: string; score: number; target_score: number }>;
  configsByKey: Record<string, { level_thresholds?: Record<string, number> }>;
}) {
  return (
    <div
      className="rounded-lg border p-6"
      style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
    >
      <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
        Lois nationales
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAW_DEFINITIONS.map((def) => {
          const row = lawRows.find((r) => r.law_key === def.lawKey);
          const config = configsByKey[def.configRuleKey];
          return (
            <LawScoreRow
              key={def.lawKey}
              def={def}
              countryId={countryId}
              initialScore={Number(row?.score ?? 0)}
              initialTargetScore={Number(row?.target_score ?? 0)}
              levelThresholds={config?.level_thresholds}
            />
          );
        })}
      </div>
    </div>
  );
}
