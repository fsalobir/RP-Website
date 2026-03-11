"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";
import { geoMercator, geoPath } from "d3-geo";
import { getRegionRelationFromMap } from "@/lib/mapRegions";
import type { WorldGeoJSONFeatureCollection } from "@/lib/mapRegions";
import { getRelationColor, getRelationLabel } from "@/lib/relationScale";

const ComposableMap = dynamic(
  () => import("react-simple-maps").then((m) => m.ComposableMap),
  { ssr: false }
);
const Geographies = dynamic(
  () => import("react-simple-maps").then((m) => m.Geographies),
  { ssr: false }
);
const Geography = dynamic(
  () => import("react-simple-maps").then((m) => m.Geography),
  { ssr: false }
);
const ZoomableGroup = dynamic(
  () => import("react-simple-maps").then((m) => m.ZoomableGroup),
  { ssr: false }
);

/** Frontières : épaisseur encore réduite (−25 %). */
const borderStroke = { stroke: "#fff", strokeWidth: 0.94, strokeLinejoin: "round" as const };
const sphereNeutralColor = "var(--background-elevated)";
const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
const MAP_SCALE = 147;
const MAP_CENTER: [number, number] = [0, 20];

const styleInactive = {
  default: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
  hover: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
  pressed: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
};

export type RegionControlInfo = { status: "Contesté" | "Occupé" | "Annexé"; controllerName: string; controllerRegionId: string };
export type SphereCountryControl = {
  is100Single: boolean;
  controllerId?: string;
  slices: Array<{ controllerId: string; sharePct: number }>;
};
export type SphereData = {
  empires: Array<{ id: string; name: string; color: string }>;
  countryControl: Record<string, SphereCountryControl>;
  countryNames: Record<string, string>;
  empireCoreCountryIds: string[];
};

function formatPercent(value: number): string {
  return `${Number(value.toFixed(1)).toString().replace(".", ",")} %`;
}

export function RelationMapClient({
  geoJson,
  regionRelationMap,
  regionNames,
  regionCountryNames = {},
  defaultSelectedRegionId = null,
  regionControl = {},
  sphereData,
}: {
  geoJson: WorldGeoJSONFeatureCollection;
  regionRelationMap: Record<string, number>;
  regionNames: Record<string, string>;
  regionCountryNames?: Record<string, string[]>;
  defaultSelectedRegionId?: string | null;
  /** Contrôle / occupation / annexion par région (pour hachures et tooltip). */
  regionControl?: Record<string, RegionControlInfo>;
  sphereData?: SphereData;
}) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(defaultSelectedRegionId ?? null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [mapFilter, setMapFilter] = useState<"relations" | "spheres">("relations");

  const map = useMemo(() => {
    const m = new Map<string, number>();
    Object.entries(regionRelationMap).forEach(([k, v]) => m.set(k, v));
    return m;
  }, [regionRelationMap]);

  const sphereColorByEmpire = useMemo(() => {
    const out: Record<string, string> = {};
    for (const empire of sphereData?.empires ?? []) out[empire.id] = empire.color;
    return out;
  }, [sphereData]);

  // Aligné sur react-simple-maps : scale + translate uniquement, pas de center
  // (la lib utilise projectionConfig.scale et défaut center [0,0] ; ZoomableGroup centre [0,20] via transform)
  const projection = useMemo(
    () =>
      geoMercator()
        .scale(MAP_SCALE)
        .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]),
    []
  );
  const pathBuilder = useMemo(() => geoPath(projection), [projection]);

  const isSphereMode = mapFilter === "spheres";
  const sphereCoreCountryIds = useMemo(
    () => new Set<string>(sphereData?.empireCoreCountryIds ?? []),
    [sphereData]
  );

  const getStyle = (regionId: string) => {
    if (isSphereMode) {
      return {
        default: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
        hover: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
        pressed: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
      };
    }

    const control = regionControl[regionId];
    const showHachures = control && selectedRegionId === control.controllerRegionId;
    const value =
      selectedRegionId && regionId !== selectedRegionId
        ? getRegionRelationFromMap(map, selectedRegionId, regionId)
        : 0;

    if (regionId === selectedRegionId) {
      const fill = showHachures ? `url(#pattern-${control.status === "Contesté" ? "conteste" : control.status === "Occupé" ? "occupe" : "annexe"})` : "#2563eb";
      return {
        default: { fill, outline: "none", ...borderStroke },
        hover: { fill, outline: "none", ...borderStroke },
        pressed: { fill, outline: "none", ...borderStroke },
      };
    }

    const fill = showHachures
      ? `url(#pattern-${control.status === "Contesté" ? "conteste" : control.status === "Occupé" ? "occupe" : "annexe"})`
      : getRelationColor(value);
    return {
      default: { fill, outline: "none", ...borderStroke },
      hover: { fill, outline: "none", ...borderStroke },
      pressed: { fill, outline: "none", ...borderStroke },
    };
  };

  const selectedRegionName = selectedRegionId ? regionNames[selectedRegionId] ?? null : null;
  const selectedRegionCountries = selectedRegionId ? regionCountryNames[selectedRegionId] ?? [] : [];

  const features = geoJson?.features ?? [];
  const hasData = features.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--foreground-muted)]">Affichage :</span>
        <button
          type="button"
          onClick={() => setMapFilter("relations")}
          className="rounded border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: mapFilter === "relations" ? "var(--accent)" : "var(--border)",
            background: mapFilter === "relations" ? "var(--accent-muted)" : "transparent",
            color: "var(--foreground)",
          }}
        >
          Relations
        </button>
        <button
          type="button"
          onClick={() => setMapFilter("spheres")}
          className="rounded border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: mapFilter === "spheres" ? "var(--accent)" : "var(--border)",
            background: mapFilter === "spheres" ? "var(--accent-muted)" : "transparent",
            color: "var(--foreground)",
          }}
        >
          Sphères d&apos;influence
        </button>
      </div>
      <p className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
        <span>
          {mapFilter === "relations"
            ? "Cliquez sur une région pour afficher ses relations avec les autres. Couleur : rouge = hostile, vert = amical (moyenne entre pays des régions). Les pays non présents en base sont en gris."
            : "Vue de consultation des sphères d'influence : une couleur par empire, gris pour l'influence non prise, hachures proportionnelles pour les pays contestés."}
        </span>
        <InfoTooltipWithWikiLink
          text="Deux modes : Relations (niveau d'amitié entre régions) et Sphères d'influence (qui domine quelle région). Cliquez sur une région pour le détail."
          wikiSectionId="carte-modes"
          side="bottom"
        />
      </p>
      {!hasData && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Données géographiques indisponibles. Vérifiez que le paquet <code className="rounded bg-black/20 px-1">world-atlas</code> est installé et que le serveur peut y accéder.
        </p>
      )}
      {selectedRegionName && !isSphereMode && (
        <p
          className="rounded border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
        >
          Région sélectionnée : <strong style={{ color: "#2563eb" }}>{selectedRegionName}</strong>
          {selectedRegionCountries.length > 0 && (
            <span className="text-[var(--foreground-muted)]"> — Pays : {selectedRegionCountries.join(", ")}</span>
          )}
        </p>
      )}
      <div
        className="relative overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
      >
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-xs rounded border px-2 py-1.5 text-sm shadow-lg"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y + 8,
              borderColor: "var(--border)",
              background: "var(--background-panel)",
              color: "var(--foreground)",
            }}
          >
            {tooltip.content}
          </div>
        )}
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 147 }}
          width={800}
          height={500}
          style={{ width: "100%", height: "auto" }}
        >
          <defs>
            <filter id="borderGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Hachures bleues parallèles : Contesté (traits en pointillés / trous), Occupé et Annexé (continues, −25 % épaisseur) */}
            <pattern id="pattern-conteste" patternUnits="userSpaceOnUse" width="8" height="8">
              <line x1="0" y1="0" x2="8" y2="8" stroke="rgba(59,130,246,0.55)" strokeWidth="0.6" strokeDasharray="2 1.2" />
              <line x1="-4" y1="4" x2="4" y2="12" stroke="rgba(59,130,246,0.55)" strokeWidth="0.6" strokeDasharray="2 1.2" />
            </pattern>
            <pattern id="pattern-occupe" patternUnits="userSpaceOnUse" width="8" height="8">
              <line x1="0" y1="0" x2="8" y2="8" stroke="rgba(59,130,246,0.6)" strokeWidth="0.6" />
            </pattern>
            <pattern id="pattern-annexe" patternUnits="userSpaceOnUse" width="8" height="8">
              <line x1="0" y1="0" x2="8" y2="8" stroke="rgba(59,130,246,0.85)" strokeWidth="1.5" />
            </pattern>
          </defs>
          <ZoomableGroup center={[0, 20]} minZoom={0.5} maxZoom={8}>
            <g style={{ filter: "url(#borderGlow)" }}>
            <Geographies geography={hasData ? geoJson : { type: "FeatureCollection", features: [] }}>
            {({ geographies }) =>
              geographies.map((geo, i) => {
                const g = geo as { properties?: { regionId?: string | null; countryId?: string | null; name?: string }; id?: string | number; geometry?: unknown };
                const regionId = g.properties?.regionId ?? null;
                const countryId = g.properties?.countryId ?? null;
                const name = (regionId ? regionNames[regionId] : null) ?? g.properties?.name ?? "";
                const key = typeof g.id !== "undefined" ? String(g.id) : `geo-${i}`;

                if (regionId == null) {
                  return (
                    <Geography
                      key={key}
                      geography={geo}
                      style={styleInactive}
                      title={name ? `${name} (non présent en base)` : undefined}
                    />
                  );
                }

                const value =
                  selectedRegionId && regionId !== selectedRegionId
                    ? getRegionRelationFromMap(map, selectedRegionId, regionId)
                    : 0;
                const control = regionControl[regionId];
                const controlLine = control
                  ? `Contrôle : ${control.status}${control.controllerName ? ` par ${control.controllerName}` : ""}`
                  : "";
                const sphereControl = countryId ? sphereData?.countryControl[countryId] : undefined;
                const tooltipContent = isSphereMode
                  ? (() => {
                      if (!sphereControl) {
                        if (countryId && sphereCoreCountryIds.has(countryId)) {
                          const empireName = sphereData?.countryNames[countryId] ?? "Empire";
                          return `${name} — Cœur de l'empire ${empireName}`;
                        }
                        return `${name} — Influence non prise`;
                      }
                      if (sphereControl.is100Single && sphereControl.controllerId) {
                        const empireName = sphereData?.countryNames[sphereControl.controllerId] ?? "Empire";
                        return `${name} — Dominé par ${empireName} (100 %)`;
                      }
                      const totalTaken = sphereControl.slices.reduce((sum, slice) => sum + slice.sharePct, 0);
                      const rest = Math.max(0, 100 - totalTaken);
                      const parts = sphereControl.slices.map((slice) => {
                        const empireName = sphereData?.countryNames[slice.controllerId] ?? "Empire";
                        return `${empireName} ${formatPercent(slice.sharePct)}`;
                      });
                      if (rest > 0) parts.push(`Non prise ${formatPercent(rest)}`);
                      return `${name} — ${parts.join(" | ")}`;
                    })()
                  : selectedRegionId
                    ? regionId === selectedRegionId
                      ? [name + " (sélectionné)", controlLine].filter(Boolean).join(" — ")
                      : [name + " — " + getRelationLabel(value) + " (" + value + ")", controlLine].filter(Boolean).join(" — ")
                    : [name ? name + ". Sélectionnez une région pour voir les relations." : "Sélectionnez une région pour voir les relations.", controlLine].filter(Boolean).join(" — ");

                const sphereStyle = (() => {
                  if (!isSphereMode) return getStyle(regionId);
                  if (sphereControl?.is100Single && sphereControl.controllerId) {
                    const fill = sphereColorByEmpire[sphereControl.controllerId] ?? sphereNeutralColor;
                    return {
                      default: { fill, outline: "none", ...borderStroke },
                      hover: { fill, outline: "none", ...borderStroke },
                      pressed: { fill, outline: "none", ...borderStroke },
                    };
                  }
                  if (!sphereControl && countryId && sphereCoreCountryIds.has(countryId)) {
                    const fill = sphereColorByEmpire[countryId] ?? sphereNeutralColor;
                    return {
                      default: { fill, outline: "none", ...borderStroke },
                      hover: { fill, outline: "none", ...borderStroke },
                      pressed: { fill, outline: "none", ...borderStroke },
                    };
                  }
                  return {
                    default: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
                    hover: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
                    pressed: { fill: sphereNeutralColor, outline: "none", ...borderStroke },
                  };
                })();

                return (
                  <React.Fragment key={key}>
                    <Geography
                      geography={geo}
                      style={sphereStyle}
                      onClick={isSphereMode ? undefined : () => setSelectedRegionId((prev) => (prev === regionId ? null : regionId))}
                      onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                      onMouseLeave={() => setTooltip(null)}
                      title={
                        isSphereMode
                          ? tooltipContent
                          : [name, regionCountryNames[regionId]?.length ? `Pays : ${regionCountryNames[regionId].join(", ")}` : null, selectedRegionId && regionId !== selectedRegionId ? String(value) : null].filter(Boolean).join(" — ")
                      }
                    />
                    {(isSphereMode && sphereControl && !sphereControl.is100Single && g.geometry && (() => {
                      const bounds = pathBuilder.bounds(g.geometry as never);
                      const geoPathD = pathBuilder(g.geometry as never);
                      if (!geoPathD) return null;
                      const xMin = bounds[0][0];
                      const yMin = bounds[0][1];
                      const xMax = bounds[1][0];
                      const yMax = bounds[1][1];
                      const bboxWidth = Math.max(0, xMax - xMin);
                      const bboxHeight = Math.max(0, yMax - yMin);
                      if (bboxWidth <= 0 || bboxHeight <= 0) return null;

                      const totalTaken = sphereControl.slices.reduce((sum, slice) => sum + slice.sharePct, 0);
                      const remaining = Math.max(0, 100 - totalTaken);
                      const parts = [
                        ...sphereControl.slices.map((slice) => ({
                          sharePct: Math.max(0, slice.sharePct),
                          color: sphereColorByEmpire[slice.controllerId] ?? sphereNeutralColor,
                        })),
                        ...(remaining > 0 ? [{ sharePct: remaining, color: sphereNeutralColor }] : []),
                      ].filter((p) => p.sharePct > 0);

                      // Taille du motif adaptée au pays et à la bande la plus étroite : hachures
                      // bien serrées pour être visibles, avec au moins ~2 hachures par bande.
                      const minBandWidth = Math.min(
                        ...parts.map((p) => (p.sharePct / 100) * bboxWidth),
                        bboxWidth
                      );
                      const patternSize = Math.max(2, Math.min(3, minBandWidth / 2));
                      const hatchStrokeWidth = Math.max(0.8, patternSize * 0.38);

                      const clipPathId = `sphere-clip-${key}`;
                      const hatchAngles = [35, -35, 0, 90, 20, -20, 55, -55];
                      let cumulX = 0;
                      return (
                        <g pointerEvents="none">
                          <defs>
                            <clipPath id={clipPathId}>
                              <path d={geoPathD} />
                            </clipPath>
                            {parts.map((part, index) => {
                              const patternId = `sphere-hatch-${key}-${index}`;
                              const angle = hatchAngles[index % hatchAngles.length];
                              return (
                                <pattern
                                  key={patternId}
                                  id={patternId}
                                  patternUnits="userSpaceOnUse"
                                  width={patternSize}
                                  height={patternSize}
                                  patternTransform={`rotate(${angle})`}
                                >
                                  <rect x={0} y={0} width={patternSize} height={patternSize} fill="transparent" />
                                  <line x1={0} y1={0} x2={0} y2={patternSize} stroke={part.color} strokeWidth={hatchStrokeWidth} />
                                </pattern>
                              );
                            })}
                          </defs>
                          <g clipPath={`url(#${clipPathId})`}>
                            {parts.map((part, index) => {
                              const bandWidth = (part.sharePct / 100) * bboxWidth;
                              const patternId = `sphere-hatch-${key}-${index}`;
                              const bandX = xMin + cumulX;
                              cumulX += bandWidth;
                              return (
                                <g key={`${key}-hatch-band-${index}`}>
                                  <rect
                                    x={bandX}
                                    y={yMin}
                                    width={bandWidth}
                                    height={bboxHeight}
                                    fill="rgba(0,0,0,0.12)"
                                  />
                                  <rect
                                    x={bandX}
                                    y={yMin}
                                    width={bandWidth}
                                    height={bboxHeight}
                                    fill={`url(#${patternId})`}
                                  />
                                  <rect
                                    x={bandX}
                                    y={yMin}
                                    width={bandWidth}
                                    height={bboxHeight}
                                    fill="transparent"
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth={0.5}
                                  />
                                </g>
                              );
                            })}
                          </g>
                        </g>
                      );
                    })()) as React.ReactNode}
                  </React.Fragment>
                );
              })
            }
          </Geographies>
            </g>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      {isSphereMode ? (
        <div className="flex flex-col items-center">
          <table className="text-xs text-[var(--foreground-muted)] border border-[var(--border)] rounded-md border-collapse">
            <tbody>
              {(sphereData?.empires ?? []).map((empire) => (
                <tr key={empire.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="p-2 w-12 align-middle border-r border-[var(--border)]">
                    <span
                      className="block w-6 h-6 rounded-sm border border-[rgba(255,255,255,0.4)]"
                      style={{ background: empire.color }}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle font-medium">
                    {empire.name}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-[var(--border)] last:border-b-0">
                <td className="p-2 w-12 align-middle border-r border-[var(--border)]">
                  <span
                    className="block w-6 h-6 rounded-sm border border-[rgba(255,255,255,0.4)]"
                    style={{ background: sphereNeutralColor }}
                  />
                </td>
                <td className="px-3 py-2 align-middle font-medium">
                  Souverain
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--foreground-muted)]">
          <span style={{ color: getRelationColor(-100) }}>−100 ({getRelationLabel(-100)})</span>
          <span style={{ color: getRelationColor(0) }}>0 ({getRelationLabel(0)})</span>
          <span style={{ color: getRelationColor(100) }}>+100 ({getRelationLabel(100)})</span>
          <span style={{ color: "var(--background-elevated)" }}>Gris = pays non en base</span>
        </div>
      )}
    </div>
  );
}
