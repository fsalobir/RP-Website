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
  const [saved, setSaved] = useState(false);

  const scoreNum = Math.max(0, Math.min(500, Math.round(Number(score) || 0)));
  const currentLevel = getLawLevelKeyFromScore(scoreNum, levelThresholds, def.levels, def.lawKey);
  const targetLevel = getLawLevelKeyFromScore(initialTargetScore, levelThresholds, def.levels, def.lawKey);
  const currentLabel = def.levels.find((l) => l.key === currentLevel)?.label ?? currentLevel;
  const targetLabel = def.levels.find((l) => l.key === targetLevel)?.label ?? targetLevel;

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const result = await updateLawScore(countryId, def.lawKey, scoreNum);
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="border-b py-4 last:border-b-0" style={{ borderColor: "var(--border-muted)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{def.title_fr}</h3>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Niveau calculé : <strong className="text-[var(--foreground)]">{currentLabel}</strong>
            {currentLabel !== targetLabel ? ` · cible actuelle : ${targetLabel}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || scoreNum === initialScore}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-end">
        <label htmlFor={`law-score-range-${def.lawKey}`} className="block text-xs text-[var(--foreground-muted)]">
          Position sur l’échelle : {scoreNum}/500
          <input
            id={`law-score-range-${def.lawKey}`}
            type="range"
            min={0}
            max={500}
            value={scoreNum}
            onChange={(e) => setScore(e.target.value)}
            className="mt-1 block min-h-11 w-full accent-[var(--accent)]"
          />
        </label>
        <div>
          <label htmlFor={`law-score-${def.lawKey}`} className="mb-1 block text-xs text-[var(--foreground-muted)]">Valeur précise</label>
          <input
            id={`law-score-${def.lawKey}`}
            type="number"
            min={0}
            max={500}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-[var(--danger)]" role="alert">{error}</p>}
      {saved && <p className="mt-2 text-xs text-[var(--accent)]" role="status">Loi mise à jour.</p>}
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
      className="admin-settings-form rounded-lg border p-4 sm:p-6"
      style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
    >
      <h2 className="text-lg font-semibold text-[var(--foreground)]">
        Lois nationales
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
        Déplacez une loi sur son échelle. Le niveau et ses effets sont recalculés à partir des seuils définis dans les règles.
      </p>
      <div className="mt-4">
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
