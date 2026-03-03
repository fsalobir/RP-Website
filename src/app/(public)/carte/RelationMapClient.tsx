"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
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

const styleInactive = {
  default: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
  hover: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
  pressed: { fill: "var(--background-elevated)", outline: "none", ...borderStroke },
};

export type RegionControlInfo = { status: "Contesté" | "Occupé" | "Annexé"; controllerName: string; controllerRegionId: string };

export function RelationMapClient({
  geoJson,
  regionRelationMap,
  regionNames,
  regionCountryNames = {},
  defaultSelectedRegionId = null,
  regionControl = {},
}: {
  geoJson: WorldGeoJSONFeatureCollection;
  regionRelationMap: Record<string, number>;
  regionNames: Record<string, string>;
  regionCountryNames?: Record<string, string[]>;
  defaultSelectedRegionId?: string | null;
  /** Contrôle / occupation / annexion par région (pour hachures et tooltip). */
  regionControl?: Record<string, RegionControlInfo>;
}) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(defaultSelectedRegionId ?? null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [mapFilter, setMapFilter] = useState<"relations" | "spheres">("relations");

  const map = useMemo(() => {
    const m = new Map<string, number>();
    Object.entries(regionRelationMap).forEach(([k, v]) => m.set(k, v));
    return m;
  }, [regionRelationMap]);

  const getStyle = (regionId: string) => {
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
          Sphères d&apos;influences
        </button>
      </div>
      <p className="text-sm text-[var(--foreground-muted)]">
        {mapFilter === "relations"
          ? "Cliquez sur une région pour afficher ses relations avec les autres. Couleur : rouge = hostile, vert = amical (moyenne entre pays des régions). Les pays non présents en base sont en gris."
          : "Vue Sphères d'influences — Bientôt disponible."}
      </p>
      {!hasData && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Données géographiques indisponibles. Vérifiez que le paquet <code className="rounded bg-black/20 px-1">world-atlas</code> est installé et que le serveur peut y accéder.
        </p>
      )}
      {selectedRegionName && (
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
                const g = geo as { properties?: { regionId?: string | null; name?: string }; id?: string | number };
                const regionId = g.properties?.regionId ?? null;
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
                const tooltipContent = selectedRegionId
                  ? regionId === selectedRegionId
                    ? [name + " (sélectionné)", controlLine].filter(Boolean).join(" — ")
                    : [name + " — " + getRelationLabel(value) + " (" + value + ")", controlLine].filter(Boolean).join(" — ")
                  : [name ? name + ". Sélectionnez une région pour voir les relations." : "Sélectionnez une région pour voir les relations.", controlLine].filter(Boolean).join(" — ");
                return (
                  <Geography
                    key={key}
                    geography={geo}
                    style={getStyle(regionId)}
                    onClick={() => setSelectedRegionId((prev) => (prev === regionId ? null : regionId))}
                    onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseLeave={() => setTooltip(null)}
                    title={[name, regionCountryNames[regionId]?.length ? `Pays : ${regionCountryNames[regionId].join(", ")}` : null, selectedRegionId && regionId !== selectedRegionId ? String(value) : null].filter(Boolean).join(" — ")}
                  />
                );
              })
            }
          </Geographies>
            </g>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--foreground-muted)]">
        <span style={{ color: getRelationColor(-100) }}>−100 ({getRelationLabel(-100)})</span>
        <span style={{ color: getRelationColor(0) }}>0 ({getRelationLabel(0)})</span>
        <span style={{ color: getRelationColor(100) }}>+100 ({getRelationLabel(100)})</span>
        <span style={{ color: "var(--background-elevated)" }}>Gris = pays non en base</span>
      </div>
    </div>
  );
}
