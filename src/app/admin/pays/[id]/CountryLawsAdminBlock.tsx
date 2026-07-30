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
  const activeLevel = getLawLevelKeyFromScore(initialScore, levelThresholds, def.levels, def.lawKey);
  const previewLevel = getLawLevelKeyFromScore(scoreNum, levelThresholds, def.levels, def.lawKey);
  const targetLevel = getLawLevelKeyFromScore(initialTargetScore, levelThresholds, def.levels, def.lawKey);
  const activeLabel = def.levels.find((l) => l.key === activeLevel)?.label ?? activeLevel;
  const previewLabel = def.levels.find((l) => l.key === previewLevel)?.label ?? previewLevel;
  const targetLabel = def.levels.find((l) => l.key === targetLevel)?.label ?? targetLevel;

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const result = await updateLawScore(countryId, def.lawKey, scoreNum);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(`Impossible d’enregistrer « ${def.title_fr} ». Vérifiez votre connexion puis réessayez.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 border-b py-3 last:border-b-0 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.5fr)_6rem_7rem] md:items-center" style={{ borderColor: "var(--border-muted)" }}>
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{def.title_fr}</h3>
          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
            <strong className="text-[var(--foreground)]">{activeLabel}</strong>
            {activeLabel !== targetLabel ? ` → ${targetLabel}` : " · cible atteinte"}
          </p>
          {scoreNum !== initialScore && (
            <span className="mt-1 inline-flex rounded bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-xs text-[var(--accent)]">
              Aperçu : {previewLabel}
            </span>
          )}
        </div>
        <label htmlFor={`law-score-range-${def.lawKey}`} className="block text-xs text-[var(--foreground-muted)]">
          Score {scoreNum}/500
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
          <label htmlFor={`law-score-${def.lawKey}`} className="mb-1 block text-xs text-[var(--foreground-muted)]">Précis</label>
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
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || scoreNum === initialScore}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] disabled:opacity-35"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
      {error && <p className="text-xs text-[var(--danger)] md:col-span-4" role="alert">{error}</p>}
      {saved && <p className="text-xs text-[var(--accent)] md:col-span-4" role="status">Loi mise à jour.</p>}
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
      className="admin-settings-form border-y"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Lois nationales</h2>
        <p className="text-xs text-[var(--foreground-muted)]">Palier actif → cible du joueur</p>
      </div>
      <div>
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
