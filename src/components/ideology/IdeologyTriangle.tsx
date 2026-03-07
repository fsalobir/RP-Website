"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IDEOLOGY_LABELS } from "@/lib/ideology";

type IdeologyEntry = {
  id: string;
  name: string;
  slug: string;
  flag_url: string | null;
  regime: string | null;
  ai_status: string | null;
  isPlayer: boolean;
  influence: number;
  dominant: "monarchism" | "republicanism" | "cultism";
  centerDistance: number;
  point: { x: number; y: number };
  scores: {
    monarchism: number;
    republicanism: number;
    cultism: number;
  };
  drift: {
    monarchism: number;
    republicanism: number;
    cultism: number;
  };
  neighbors: {
    monarchism: number;
    republicanism: number;
    cultism: number;
  };
  effects: {
    monarchism: number;
    republicanism: number;
    cultism: number;
  };
  neighborContributors: Array<{
    countryId: string;
    name: string;
    slug: string;
    flag_url: string | null;
    ideology: "monarchism" | "republicanism" | "cultism";
    value: number;
    weight: number;
  }>;
};

const TRIANGLE_LAYOUT = {
  apexX: 0.5,
  apexY: 0.06,
  baseLeftX: 0.08,
  baseRightX: 0.92,
  baseY: 0.9,
  markerPaddingX: 0.018,
};

function formatScore(value: number): string {
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDisplayPoint(scores: IdeologyEntry["scores"]) {
  const monarchism = scores.monarchism / 100;
  const cultism = scores.cultism / 100;
  return {
    x: cultism + monarchism * 0.5,
    y: monarchism * 0.8660254038,
  };
}

function getMarkerPosition(point: { x: number; y: number }) {
  const heightRatio = clamp(point.y / 0.8660254038, 0, 1);
  const rowLeft = TRIANGLE_LAYOUT.baseLeftX + (TRIANGLE_LAYOUT.apexX - TRIANGLE_LAYOUT.baseLeftX) * heightRatio;
  const rowRight = TRIANGLE_LAYOUT.baseRightX + (TRIANGLE_LAYOUT.apexX - TRIANGLE_LAYOUT.baseRightX) * heightRatio;
  const normalizedRowLeft = heightRatio / 2;
  const normalizedRowRight = 1 - heightRatio / 2;
  const normalizedWidth = Math.max(0.0001, normalizedRowRight - normalizedRowLeft);
  const rowProgress = clamp((point.x - normalizedRowLeft) / normalizedWidth, 0, 1);
  const safeLeft = rowLeft + TRIANGLE_LAYOUT.markerPaddingX;
  const safeRight = rowRight - TRIANGLE_LAYOUT.markerPaddingX;
  const x = safeLeft + rowProgress * Math.max(0, safeRight - safeLeft);
  const y = TRIANGLE_LAYOUT.baseY - heightRatio * (TRIANGLE_LAYOUT.baseY - TRIANGLE_LAYOUT.apexY);
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

function getStrongestDirection(scores: IdeologyEntry["neighbors"] | IdeologyEntry["effects"]) {
  const ordered = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1]));
  return (ordered[0]?.[0] ?? null) as "monarchism" | "republicanism" | "cultism" | null;
}

function getInfluenceIntensity(value: number, maxValue: number): string {
  if (maxValue <= 0) return "légère";
  const ratio = value / maxValue;
  if (ratio >= 0.85) return "majeure";
  if (ratio >= 0.6) return "forte";
  if (ratio >= 0.35) return "modérée";
  return "légère";
}

export function IdeologyTriangle({ entries }: { entries: IdeologyEntry[] }) {
  const [showPlayers, setShowPlayers] = useState(true);
  const [showAiMajor, setShowAiMajor] = useState(true);
  const [showAiMinor, setShowAiMinor] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);

  const visibleEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        if (!showPlayers && entry.isPlayer) return false;
        if (!showAiMajor && entry.ai_status === "major") return false;
        if (!showAiMinor && entry.ai_status === "minor") return false;
        return true;
      })
      .sort((a, b) => b.influence - a.influence);
  }, [entries, showPlayers, showAiMajor, showAiMinor]);

  const selected = visibleEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;
  const strongestNeighborInfluence = Math.max(0, ...((selected?.neighborContributors ?? []).map((neighbor) => neighbor.value)));
  const strongestNeighborDirection = selected ? getStrongestDirection(selected.neighbors) : null;
  const strongestEffectDirection = selected ? getStrongestDirection(selected.effects) : null;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={showPlayers} onChange={(e) => setShowPlayers(e.target.checked)} />
            Joueurs
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={showAiMajor} onChange={(e) => setShowAiMajor(e.target.checked)} />
            IA majeures
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={showAiMinor} onChange={(e) => setShowAiMinor(e.target.checked)} />
            IA mineures
          </label>
          <span className="text-sm text-[var(--foreground-muted)]">
            {visibleEntries.length} pays affiché{visibleEntries.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <div className="mb-4 text-sm text-[var(--foreground-muted)]">
            Triangle d’alignement mondial. Les drapeaux les plus influents passent visuellement au-dessus.
          </div>
          <div className="relative mx-auto aspect-[1.3/0.82] max-w-3xl sm:aspect-[1.25/0.8]">
            <div
              className="absolute inset-0 rounded-lg opacity-90"
              style={{
                clipPath: "polygon(50% 6%, 8% 90%, 92% 90%)",
                background:
                  [
                    "radial-gradient(circle at 50% 8%, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.12) 18%, transparent 56%)",
                    "radial-gradient(circle at 10% 88%, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.1) 22%, transparent 60%)",
                    "radial-gradient(circle at 90% 88%, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.1) 22%, transparent 60%)",
                    "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, transparent 34%, rgba(34,197,94,0.05) 100%)",
                    "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.92) 52%, rgba(17,24,39,0.97) 100%)",
                  ].join(", "),
              }}
            />
            <div className="absolute left-1/2 top-[1%] -translate-x-1/2 text-center">
              <div className="text-xs font-semibold text-[var(--foreground)] sm:text-sm">Monarchisme</div>
            </div>
            <div className="absolute bottom-[0.5%] left-[5%] text-left">
              <div className="text-xs font-semibold text-[var(--foreground)] sm:text-sm">Républicanisme</div>
            </div>
            <div className="absolute bottom-[0.5%] right-[5%] text-right">
              <div className="text-xs font-semibold text-[var(--foreground)] sm:text-sm">Cultisme</div>
            </div>

            {visibleEntries.map((entry, index) => {
              const { left, top } = getMarkerPosition(getDisplayPoint(entry.scores));
              const isSelected = entry.id === selected?.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110"
                  style={{
                    left,
                    top,
                    zIndex: visibleEntries.length - index,
                    outline: isSelected ? "2px solid var(--accent)" : "none",
                    borderRadius: 6,
                  }}
                  title={`${entry.name} — ${IDEOLOGY_LABELS[entry.dominant]}`}
                >
                  {entry.flag_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.flag_url}
                      alt={entry.name}
                      width={24}
                      height={16}
                      className="h-4 w-6 rounded border object-cover shadow-sm sm:h-5 sm:w-7"
                      style={{ borderColor: isSelected ? "var(--accent)" : "var(--border)" }}
                    />
                  ) : (
                    <div
                      className="h-4 w-6 rounded border shadow-sm sm:h-5 sm:w-7"
                      style={{ borderColor: isSelected ? "var(--accent)" : "var(--border)", background: "var(--background-elevated)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selected.flag_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.flag_url}
                    alt={selected.name}
                    width={40}
                    height={27}
                    className="h-7 w-10 rounded border object-cover"
                    style={{ borderColor: "var(--border)" }}
                  />
                ) : (
                  <div
                    className="h-7 w-10 rounded border"
                    style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
                  />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--foreground)]">{selected.name}</div>
                  <div className="text-sm text-[var(--foreground-muted)]">{selected.regime ?? "—"}</div>
                </div>
              </div>

              <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                <div className="text-sm font-medium text-[var(--foreground)]">
                  Tendance dominante : {IDEOLOGY_LABELS[selected.dominant]}
                </div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Distance au centre : {Math.round(selected.centerDistance * 100)} %
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span>Monarchisme</span>
                  <span className="font-mono">{formatScore(selected.scores.monarchism)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Républicanisme</span>
                  <span className="font-mono">{formatScore(selected.scores.republicanism)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Cultisme</span>
                  <span className="font-mono">{formatScore(selected.scores.cultism)}</span>
                </div>
              </div>

              <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Dérive actuelle</div>
                <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
                  <div>Monarchisme : {formatScore(selected.drift.monarchism)}</div>
                  <div>Républicanisme : {formatScore(selected.drift.republicanism)}</div>
                  <div>Cultisme : {formatScore(selected.drift.cultism)}</div>
                </div>
              </div>

              <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Influences voisines</div>
                {selected.neighborContributors.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {selected.neighborContributors.map((neighbor) => (
                        <div
                          key={`${selected.id}-${neighbor.countryId}`}
                          className="flex items-center justify-between gap-3 rounded border px-2 py-2"
                          style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {neighbor.flag_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={neighbor.flag_url}
                                alt={neighbor.name}
                                width={24}
                                height={16}
                                className="h-4 w-6 rounded object-cover"
                              />
                            ) : (
                              <div className="h-4 w-6 rounded border" style={{ borderColor: "var(--border)" }} />
                            )}
                            <Link href={`/pays/${neighbor.slug}`} className="truncate text-sm text-[var(--accent)] hover:underline">
                              {neighbor.name}
                            </Link>
                          </div>
                          <div className="text-right text-xs text-[var(--foreground-muted)]">
                            <div className="text-[var(--foreground)]">
                              Influence {getInfluenceIntensity(neighbor.value, strongestNeighborInfluence)} vers le {IDEOLOGY_LABELS[neighbor.ideology]}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-[var(--foreground-muted)]">
                      {strongestNeighborDirection
                        ? `Dans l’ensemble, nos voisins nous poussent surtout vers le ${IDEOLOGY_LABELS[strongestNeighborDirection]}.`
                        : "Nos voisins n’exercent pas de direction idéologique nette."}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[var(--foreground-muted)]">Aucune influence voisine détectée.</div>
                )}
              </div>

              {Math.max(selected.effects.monarchism, selected.effects.republicanism, selected.effects.cultism) > 0 && (
                <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                  <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Effets idéologiques</div>
                  <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
                    <div>Monarchisme : {formatScore(selected.effects.monarchism)}</div>
                    <div>Républicanisme : {formatScore(selected.effects.republicanism)}</div>
                    <div>Cultisme : {formatScore(selected.effects.cultism)}</div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--foreground-muted)]">
                    {strongestEffectDirection
                      ? `Les effets administratifs poussent actuellement surtout vers le ${IDEOLOGY_LABELS[strongestEffectDirection]}.`
                      : "Les effets administratifs n’impriment pas de direction idéologique nette."}
                  </div>
                </div>
              )}

              <Link href={`/pays/${selected.slug}`} className="inline-block text-sm text-[var(--accent)] hover:underline">
                Voir la fiche pays
              </Link>
            </div>
          ) : (
            <div className="text-sm text-[var(--foreground-muted)]">
              Aucun pays ne correspond aux filtres actuels.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
