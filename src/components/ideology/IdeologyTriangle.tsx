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
  topFactors: Array<{ label: string; ideology: "monarchism" | "republicanism" | "cultism"; value: number }>;
};

function formatScore(value: number): string {
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
            Triangle d’alignement mondial. Le centre représente les pays non alignés. Les drapeaux les plus influents passent visuellement au-dessus.
          </div>
          <div className="relative mx-auto aspect-[1.1/1] max-w-4xl">
            <div
              className="absolute inset-0 rounded-lg opacity-90"
              style={{
                clipPath: "polygon(50% 4%, 6% 94%, 94% 94%)",
                background:
                  "linear-gradient(180deg, rgba(249,168,37,0.22) 0%, rgba(239,68,68,0.18) 50%, rgba(59,130,246,0.18) 100%)",
              }}
            />
            <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-center">
              <div className="text-sm font-semibold text-[var(--foreground)]">Cultisme</div>
            </div>
            <div className="absolute bottom-[3%] left-[7%] text-left">
              <div className="text-sm font-semibold text-[var(--foreground)]">Monarchisme</div>
            </div>
            <div className="absolute bottom-[3%] right-[7%] text-right">
              <div className="text-sm font-semibold text-[var(--foreground)]">Républicanisme</div>
            </div>
            <div
              className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: "var(--border-muted)", background: "rgba(15,20,25,0.55)" }}
            >
              Non-aligné
            </div>

            {visibleEntries.map((entry, index) => {
              const left = `${entry.point.x * 100}%`;
              const top = `${(1 - entry.point.y) * 100}%`;
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
                      width={28}
                      height={19}
                      className="h-5 w-7 rounded border object-cover shadow-sm"
                      style={{ borderColor: isSelected ? "var(--accent)" : "var(--border)" }}
                    />
                  ) : (
                    <div
                      className="h-5 w-7 rounded border shadow-sm"
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
                <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Principales causes</div>
                <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
                  {selected.topFactors.map((factor) => (
                    <div key={`${selected.id}-${factor.label}`}>
                      {factor.label} : {IDEOLOGY_LABELS[factor.ideology]}
                    </div>
                  ))}
                </div>
              </div>

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
