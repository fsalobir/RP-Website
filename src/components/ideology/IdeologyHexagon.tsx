"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IDEOLOGY_IDS,
  IDEOLOGY_LABELS,
  IDEOLOGY_INFOBOX_HEADER_IMAGE,
  IDEOLOGY_INFOBOX_LONG_DESCRIPTION,
  IDEOLOGY_HEX_LAYER_IMAGE,
  type IdeologyId,
} from "@/lib/ideology";
import { EFFECT_KIND_LABELS, formatEffectValue, isEffectDisplayPositive, STAT_LABELS } from "@/lib/countryEffects";

const flagLoader = ({ src }: { src: string }) => src;

export type IdeologyHexagonEntry = {
  id: string;
  name: string;
  slug: string;
  flag_url: string | null;
  regime: string | null;
  ai_status: string | null;
  isPlayer: boolean;
  influence: number;
  dominant: IdeologyId;
  centerDistance: number;
  point: { x: number; y: number };
  scores: Record<IdeologyId, number>;
  drift: Record<IdeologyId, number>;
  neighbors: Record<IdeologyId, number>;
  effects: Record<IdeologyId, number>;
  neighborContributors: Array<{
    countryId: string;
    name: string;
    slug: string;
    flag_url: string | null;
    ideology: IdeologyId;
    value: number;
    weight: number;
  }>;
};

/** Sommets de l'hexagone (pointy-top), même ordre que IDEOLOGY_IDS, rayon 1. */
const HEX_VERTICES: Array<{ x: number; y: number }> = [];
for (let k = 0; k < 6; k++) {
  const angle = Math.PI / 2 - (k * Math.PI) / 3;
  HEX_VERTICES.push({ x: Math.cos(angle), y: Math.sin(angle) });
}

const HEX_RADIUS = 0.42;
/** Décalage des labels vers l’extérieur par rapport au sommet (en unités viewBox). */
const LABEL_OFFSET_DEFAULT = 0.12;
const LABEL_OFFSET_TOP_BOTTOM = 0.04;
const CENTER_X = 0.5;
const CENTER_Y = 0.5;

/** Polygon pour clip-path CSS (même forme que l’hexagone), en pourcentages. */
const HEX_CLIP_POLYGON = HEX_VERTICES.map(
  (v) => `${(CENTER_X + v.x * HEX_RADIUS) * 100}% ${(CENTER_Y - v.y * HEX_RADIUS) * 100}%`
).join(", ");

function formatScore(value: number): string {
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function getMarkerPosition(point: { x: number; y: number }): { left: string; top: string } {
  const left = (CENTER_X + point.x * HEX_RADIUS) * 100;
  const top = (CENTER_Y - point.y * HEX_RADIUS) * 100;
  return { left: `${left}%`, top: `${top}%` };
}

function getStrongestDirection(scores: Record<IdeologyId, number>): IdeologyId | null {
  let best: IdeologyId = IDEOLOGY_IDS[0];
  let bestVal = scores[best] ?? 0;
  for (const id of IDEOLOGY_IDS) {
    const v = scores[id] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = id;
    }
  }
  return bestVal > 0 ? best : null;
}

function getInfluenceIntensity(value: number, maxValue: number): string {
  if (maxValue <= 0) return "légère";
  const ratio = value / maxValue;
  if (ratio >= 0.85) return "majeure";
  if (ratio >= 0.6) return "forte";
  if (ratio >= 0.35) return "modérée";
  return "légère";
}

function hexVertexInViewBox(k: number): { x: number; y: number } {
  const v = HEX_VERTICES[k];
  return { x: CENTER_X + v.x * HEX_RADIUS, y: CENTER_Y - v.y * HEX_RADIUS };
}

function HexagonSvg() {
  const points = HEX_VERTICES.map((v) => `${CENTER_X + v.x * HEX_RADIUS},${CENTER_Y - v.y * HEX_RADIUS}`).join(" ");
  const cx = CENTER_X;
  const cy = CENTER_Y;
  return (
    <svg viewBox="0 0 1 1" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="hexFill" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="var(--background-panel)" />
          <stop offset="100%" stopColor="var(--background-elevated)" />
        </linearGradient>
        {IDEOLOGY_IDS.map((_, k) => {
          const next = (k + 1) % 6;
          const v0 = hexVertexInViewBox(k);
          const v1 = hexVertexInViewBox(next);
          const points = `${cx},${cy} ${v0.x},${v0.y} ${v1.x},${v1.y}`;
          return <clipPath key={k} id={`hex-sector-${k}`}><polygon points={points} /></clipPath>;
        })}
        {IDEOLOGY_IDS.map((_, k) => {
          const vK = hexVertexInViewBox(k);
          const vNext = hexVertexInViewBox((k + 1) % 6);
          const vPrev = hexVertexInViewBox((k - 1 + 6) % 6);
          const midNext = { x: (vK.x + vNext.x) / 2, y: (vK.y + vNext.y) / 2 };
          const midPrev = { x: (vK.x + vPrev.x) / 2, y: (vK.y + vPrev.y) / 2 };
          const wedgePoints = `${vK.x},${vK.y} ${midNext.x},${midNext.y} ${cx},${cy} ${midPrev.x},${midPrev.y}`;
          return <clipPath key={`wedge-${k}`} id={`hex-vertex-wedge-${k}`}><polygon points={wedgePoints} /></clipPath>;
        })}
      </defs>
      <polygon points={points} fill="url(#hexFill)" stroke="var(--border)" strokeWidth="0.01" />
      {IDEOLOGY_IDS.map((id, k) => {
        const src = IDEOLOGY_HEX_LAYER_IMAGE[id];
        if (!src) return null;
        const vK = hexVertexInViewBox(k);
        const vNext = hexVertexInViewBox((k + 1) % 6);
        const vPrev = hexVertexInViewBox((k - 1 + 6) % 6);
        const midNext = { x: (vK.x + vNext.x) / 2, y: (vK.y + vNext.y) / 2 };
        const midPrev = { x: (vK.x + vPrev.x) / 2, y: (vK.y + vPrev.y) / 2 };
        const minX = Math.min(vK.x, midNext.x, cx, midPrev.x);
        const minY = Math.min(vK.y, midNext.y, cy, midPrev.y);
        const maxX = Math.max(vK.x, midNext.x, cx, midPrev.x);
        const maxY = Math.max(vK.y, midNext.y, cy, midPrev.y);
        const w = maxX - minX;
        const h = maxY - minY;
        return (
          <g key={id} clipPath={`url(#hex-vertex-wedge-${k})`}>
            <image
              href={src}
              x="0"
              y="0"
              width="1"
              height="1"
              preserveAspectRatio="xMidYMid slice"
              opacity="0.35"
              transform={`translate(${minX},${minY}) scale(${w},${h})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

const INFOBOX_FADEOUT_MS = 2500;

export type IdeologyEffectEntry = { ideology_id: string; effect_kind: string; effect_target: string | null; value: number };

export function IdeologyHexagon({
  entries,
  ideologyEffectsConfig = [],
}: {
  entries: IdeologyHexagonEntry[];
  ideologyEffectsConfig?: IdeologyEffectEntry[];
}) {
  const glassPanelStyle: React.CSSProperties = { background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" };
  const glassPanelClass = "rounded-xl border border-white/25";
  const glassSubStyle: React.CSSProperties = { background: "rgba(255,255,255,0.08)" };
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
  const glassMutedClass = "text-white/90";

  const [showPlayers, setShowPlayers] = useState(true);
  const [showAiMajor, setShowAiMajor] = useState(true);
  const [showAiMinor, setShowAiMinor] = useState(true);
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned_only">("all");
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [hoveredIdeology, setHoveredIdeology] = useState<IdeologyId | null>(null);
  const [displayedIdeology, setDisplayedIdeology] = useState<IdeologyId | null>(null);
  const [infoboxFadingOut, setInfoboxFadingOut] = useState(false);
  const [infoboxFadeIn, setInfoboxFadeIn] = useState(false);
  const infoboxLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!displayedIdeology) {
      setInfoboxFadeIn(false);
      return;
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setInfoboxFadeIn(true));
    });
    return () => cancelAnimationFrame(t);
  }, [displayedIdeology]);

  const handleIdeologyEnter = useCallback((id: IdeologyId) => {
    if (infoboxLeaveTimeoutRef.current) {
      clearTimeout(infoboxLeaveTimeoutRef.current);
      infoboxLeaveTimeoutRef.current = null;
    }
    setInfoboxFadingOut(false);
    setHoveredIdeology(id);
    setDisplayedIdeology(id);
  }, []);

  const handleIdeologyLeave = useCallback(() => {
    setHoveredIdeology(null);
    setInfoboxFadingOut(true);
    infoboxLeaveTimeoutRef.current = setTimeout(() => {
      setDisplayedIdeology(null);
      setInfoboxFadingOut(false);
      infoboxLeaveTimeoutRef.current = null;
    }, INFOBOX_FADEOUT_MS);
  }, []);

  const visibleEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        if (assignmentFilter === "assigned_only") {
          const assigned = entry.isPlayer || entry.ai_status === "major" || entry.ai_status === "minor";
          if (!assigned) return false;
        }
        if (!showPlayers && entry.isPlayer) return false;
        if (!showAiMajor && entry.ai_status === "major") return false;
        if (!showAiMinor && entry.ai_status === "minor") return false;
        return true;
      })
      .sort((a, b) => b.influence - a.influence);
  }, [entries, showPlayers, showAiMajor, showAiMinor, assignmentFilter]);

  const selected = visibleEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;
  const strongestNeighborInfluence = Math.max(0, ...(selected?.neighborContributors?.map((n) => n.value) ?? []));
  const strongestNeighborDirection = selected ? getStrongestDirection(selected.neighbors) : null;
  const strongestEffectDirection = selected ? getStrongestDirection(selected.effects) : null;

  return (
    <div className="space-y-6">
      <div
        className={`${glassPanelClass} p-4`}
        style={glassPanelStyle}
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className={`text-sm ${glassMutedClass}`}>Afficher :</span>
          <button
            type="button"
            onClick={() => setAssignmentFilter("all")}
            className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${assignmentFilter === "all"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-white/25 text-white/90 hover:border-white/40 hover:text-white"}`}
            style={assignmentFilter !== "all" ? glassSubStyle : undefined}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setAssignmentFilter("assigned_only")}
            className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${assignmentFilter === "assigned_only"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-white/25 text-white/90 hover:border-white/40 hover:text-white"}`}
            style={assignmentFilter !== "assigned_only" ? glassSubStyle : undefined}
          >
            Assignés uniquement
          </button>
          <span className="mx-2 text-white/30">|</span>
          <label className={`flex items-center gap-2 text-sm ${glassTextClass}`}>
            <input type="checkbox" checked={showPlayers} onChange={(e) => setShowPlayers(e.target.checked)} />
            Joueurs
          </label>
          <label className={`flex items-center gap-2 text-sm ${glassTextClass}`}>
            <input type="checkbox" checked={showAiMajor} onChange={(e) => setShowAiMajor(e.target.checked)} />
            IA majeures
          </label>
          <label className={`flex items-center gap-2 text-sm ${glassTextClass}`}>
            <input type="checkbox" checked={showAiMinor} onChange={(e) => setShowAiMinor(e.target.checked)} />
            IA mineures
          </label>
          <span className={`text-sm ${glassMutedClass}`}>
            {visibleEntries.length} pays affiché{visibleEntries.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="mx-auto w-[85%] max-w-[85%]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_272px]">
          <div
            className={`${glassPanelClass} p-4`}
            style={glassPanelStyle}
          >
            <div className="relative mx-auto aspect-square max-w-[35.7rem]">
            <HexagonSvg />
            <div className="absolute inset-0 z-[100] pointer-events-none" aria-hidden>
              {IDEOLOGY_IDS.map((id, k) => {
                const v = HEX_VERTICES[k];
                const isTopOrBottom = k === 0 || k === 3;
                const labelOffset = isTopOrBottom ? LABEL_OFFSET_TOP_BOTTOM : LABEL_OFFSET_DEFAULT;
                const labelRadius = HEX_RADIUS + labelOffset;
                const left = (CENTER_X + v.x * labelRadius) * 100;
                const top = (CENTER_Y - v.y * labelRadius) * 100;
                const isHovered = hoveredIdeology === id;
                return (
                  <div
                    key={id}
                    className="absolute w-24 -translate-x-1/2 -translate-y-1/2 pointer-events-auto sm:w-28"
                    style={{ left: `${left}%`, top: `${top}%` }}
                  >
                    <div
                      className="rounded border px-1.5 py-1 text-center text-[10px] font-medium leading-tight transition-colors sm:text-xs"
                      style={{
                        borderColor: isHovered ? "var(--accent)" : "rgba(255,255,255,0.25)",
                        background: isHovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
                        backdropFilter: "blur(12px)",
                        color: "rgba(255,255,255,0.92)",
                      }}
                      onMouseEnter={() => handleIdeologyEnter(id)}
                      onMouseLeave={handleIdeologyLeave}
                    >
                      {IDEOLOGY_LABELS[id]}
                    </div>
                  </div>
                );
              })}
            </div>
            {displayedIdeology && (
              <div
                className="absolute inset-0 z-[200] flex flex-col border shadow-lg transition-opacity duration-[2000ms]"
                style={{
                  clipPath: `polygon(${HEX_CLIP_POLYGON})`,
                  WebkitClipPath: `polygon(${HEX_CLIP_POLYGON})`,
                  borderColor: "rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  color: "#fff",
                  opacity: infoboxFadingOut ? 0 : infoboxFadeIn ? 1 : 0,
                  overflow: "hidden",
                }}
              >
                {(() => {
                  const id = displayedIdeology;
                  const headerImage = IDEOLOGY_INFOBOX_HEADER_IMAGE[id];
                  const longDesc = IDEOLOGY_INFOBOX_LONG_DESCRIPTION[id];
                  const effectsForIdeology = ideologyEffectsConfig.filter((e) => e.ideology_id === id);
                  return (
                    <>
                      {headerImage && (
                        <div
                          className="relative shrink-0 overflow-hidden border-b"
                          style={{ borderColor: "rgba(255,255,255,0.25)", height: "40%" }}
                        >
                          <Image src={headerImage} alt="" fill className="object-cover object-top" sizes="(max-width: 640px) 256px, 320px" />
                        </div>
                      )}
                      <div
                        className="flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto overflow-x-hidden p-2"
                        style={{ maxHeight: headerImage ? "60%" : "100%" }}
                      >
                        <div className="w-full text-center text-xs" style={{ maxWidth: "calc(62% + 10px)" }}>
                          {longDesc && (
                            <p className="text-white/90 leading-tight break-words" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
                              {longDesc}
                            </p>
                          )}
                          {effectsForIdeology.length > 0 && (
                            <div className="mt-2">
                              <div className="font-bold text-[var(--accent)]">Effets maximums</div>
                              <ul className="mt-0.5 list-inside list-disc font-medium" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
                                {effectsForIdeology.map((e, i) => {
                                  const effectLabel =
                                    e.effect_kind === "stat_delta" && e.effect_target
                                      ? STAT_LABELS[e.effect_target as keyof typeof STAT_LABELS] ?? e.effect_target
                                      : EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
                                  return (
                                    <li
                                      key={`${e.effect_kind}-${e.effect_target ?? ""}-${i}`}
                                      style={{ color: isEffectDisplayPositive(e) ? "var(--accent)" : "var(--danger)" }}
                                    >
                                      {effectLabel} : {formatEffectValue(e.effect_kind, e.value)}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            <div className="absolute inset-0 z-10" aria-hidden>
              {visibleEntries.map((entry, index) => {
                const { left, top } = getMarkerPosition(entry.point);
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
                    <Image
                      loader={flagLoader}
                      unoptimized
                      src={entry.flag_url}
                      alt={entry.name}
                      width={24}
                      height={16}
                      className="h-4 w-6 rounded border object-cover shadow-sm sm:h-5 sm:w-7"
                      style={{ borderColor: isSelected ? "var(--accent)" : "rgba(255,255,255,0.25)" }}
                    />
                  ) : (
                    <div
                      className="h-4 w-6 rounded border shadow-sm sm:h-5 sm:w-7"
                      style={{ borderColor: isSelected ? "var(--accent)" : "rgba(255,255,255,0.25)", ...glassSubStyle }}
                    />
                  )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

          <div
            className={`${glassPanelClass} p-4`}
            style={glassPanelStyle}
          >
            {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selected.flag_url ? (
                  <Image
                    loader={flagLoader}
                    unoptimized
                    src={selected.flag_url}
                    alt={selected.name}
                    width={40}
                    height={27}
                    className="h-7 w-10 rounded border object-cover"
                    style={{ borderColor: "rgba(255,255,255,0.25)" }}
                  />
                ) : (
                  <div
                    className="h-7 w-10 rounded border"
                    style={{ borderColor: "rgba(255,255,255,0.25)", ...glassSubStyle }}
                  />
                )}
                <div className="min-w-0">
                  <div className={`font-semibold ${glassTextClass}`}>{selected.name}</div>
                  <div className={`text-sm ${glassMutedClass}`}>{selected.regime ?? "—"}</div>
                </div>
              </div>

              <div className="rounded border border-white/25 p-3" style={glassSubStyle}>
                <div className={`text-sm font-medium ${glassTextClass}`}>
                  Tendance dominante : {IDEOLOGY_LABELS[selected.dominant]}
                </div>
                <div className={`mt-1 text-sm ${glassMutedClass}`}>
                  Distance au centre : {Math.round(selected.centerDistance * 100)} %
                </div>
              </div>

              <div className={`space-y-2 text-sm ${glassTextClass}`}>
                {IDEOLOGY_IDS.map((id) => (
                  <div key={id} className="flex justify-between gap-4">
                    <span>{IDEOLOGY_LABELS[id]}</span>
                    <span className="font-mono">{formatScore(selected.scores[id] ?? 0)}</span>
                  </div>
                ))}
              </div>

              <div className="rounded border border-white/25 p-3" style={glassSubStyle}>
                <div className={`mb-2 text-sm font-medium ${glassTextClass}`}>Dérive actuelle</div>
                <div className={`space-y-1 text-sm ${glassMutedClass}`}>
                  {IDEOLOGY_IDS.map((id) => (
                    <div key={id}>{IDEOLOGY_LABELS[id]} : {formatScore(selected.drift[id] ?? 0)}</div>
                  ))}
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
                        ? `Dans l'ensemble, nos voisins nous poussent surtout vers le ${IDEOLOGY_LABELS[strongestNeighborDirection]}.`
                        : "Nos voisins n'exercent pas de direction idéologique nette."}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[var(--foreground-muted)]">Aucune influence voisine détectée.</div>
                )}
              </div>

              {Math.max(...IDEOLOGY_IDS.map((id) => selected.effects[id] ?? 0)) > 0 && (
                <div className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                  <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Effets idéologiques</div>
                  <div className="space-y-1 text-sm text-[var(--foreground-muted)]">
                    {IDEOLOGY_IDS.map((id) => (
                      <div key={id}>{IDEOLOGY_LABELS[id]} : {formatScore(selected.effects[id] ?? 0)}</div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-[var(--foreground-muted)]">
                    {strongestEffectDirection
                      ? `Les effets administratifs poussent actuellement surtout vers le ${IDEOLOGY_LABELS[strongestEffectDirection]}.`
                      : "Les effets administratifs n'impriment pas de direction idéologique nette."}
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
    </div>
  );
}
