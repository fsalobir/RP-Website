"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMobilisationScore } from "./actions";

const MOBILISATION_LEVEL_KEYS = [
  "demobilisation",
  "reserve_active",
  "mobilisation_partielle",
  "mobilisation_generale",
  "guerre_patriotique",
] as const;
const MOBILISATION_LEVEL_LABELS: Record<string, string> = {
  demobilisation: "Démobilisation",
  reserve_active: "Réserve active",
  mobilisation_partielle: "Mobilisation partielle",
  mobilisation_generale: "Mobilisation générale",
  guerre_patriotique: "Guerre patriotique",
};

function getLevelKeyFromScore(score: number, thresholds: Record<string, number> | undefined): string {
  if (!thresholds) return "demobilisation";
  let best = "demobilisation";
  let bestVal = -1;
  for (const key of MOBILISATION_LEVEL_KEYS) {
    const t = thresholds[key] ?? 0;
    if (t <= score && t >= bestVal) {
      best = key;
      bestVal = t;
    }
  }
  return best;
}

export function MobilisationAdminBlock({
  countryId,
  initialScore,
  initialTargetScore,
  levelThresholds,
}: {
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
  const currentLevelKey = getLevelKeyFromScore(scoreNum, levelThresholds);
  const targetLevelKey = getLevelKeyFromScore(initialTargetScore, levelThresholds);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const result = await updateMobilisationScore(countryId, scoreNum);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible d’enregistrer la mobilisation. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
    >
      <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">
        Mobilisation
      </h2>
      <p className="mb-4 text-sm leading-snug text-[var(--foreground-muted)]">
        Vous corrigez ici le score actuel. Chaque jour, il se rapproche de la cible choisie par le joueur ; le niveau actif et ses effets suivent ce score.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="mobilisation-score" className="mb-1 block text-xs text-[var(--foreground-muted)]">Score actuel (0–500)</label>
          <input
            id="mobilisation-score"
            type="number"
            min={0}
            max={500}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-24 rounded border bg-[var(--background)] px-2 py-1.5 font-mono text-sm text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div className="text-sm text-[var(--foreground-muted)]">
          <span className="text-[var(--foreground)]">Niveau actuel :</span> {MOBILISATION_LEVEL_LABELS[currentLevelKey]}
        </div>
        <div className="text-sm text-[var(--foreground-muted)]">
          <span className="text-[var(--foreground)]">Niveau cible du joueur :</span> {MOBILISATION_LEVEL_LABELS[targetLevelKey]}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0f1419" }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </div>
  );
}
