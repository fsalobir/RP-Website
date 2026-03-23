"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { getMapProtoMockDataset } from "@/components/map/proto/data/mapProtoDataSource";
import { fetchMapTileManifest } from "@/lib/mapBinaryTilePipeline";
import { createCarteVIStyle } from "@/components/map/proto/carte-vi/carteVIStyle";

type Props = { initialDataset: MapProtoDataset };
type Mode = "navigation" | "ajout-ville" | "ajout-route";

function injectMapLibreCssOnce() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("maplibre-proto-css-base")) {
    const style = document.createElement("style");
    style.id = "maplibre-proto-css-base";
    style.textContent = `
      .maplibregl-map { position: relative; overflow: hidden; -webkit-tap-highlight-color: transparent; }
      .maplibregl-canvas-container { position: absolute; inset: 0; }
      .maplibregl-canvas { position: absolute; left: 0; top: 0; }
    `;
    document.head.appendChild(style);
  }
  if (!document.getElementById("maplibre-proto-css-cdn")) {
    const link = document.createElement("link");
    link.id = "maplibre-proto-css-cdn";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.css";
    document.head.appendChild(link);
  }
}

function fitMapToCities(map: MapLibreMap, cities: MapProtoDataset["cities"]) {
  if (cities.length === 0) return;
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const city of cities) {
    if (!Number.isFinite(city.lon) || !Number.isFinite(city.lat)) continue;
    minLon = Math.min(minLon, city.lon);
    minLat = Math.min(minLat, city.lat);
    maxLon = Math.max(maxLon, city.lon);
    maxLat = Math.max(maxLat, city.lat);
  }
  if (!Number.isFinite(minLon)) return;
  if (minLon === maxLon && minLat === maxLat) {
    const pad = 0.35;
    minLon -= pad;
    maxLon += pad;
    minLat -= pad;
    maxLat += pad;
  }
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: 72, duration: 0, maxZoom: 8 }
  );
}

function pickNearestCityId(map: MapLibreMap, dataset: MapProtoDataset, event: MapMouseEvent): string | null {
  const click = map.project(event.lngLat);
  let bestId: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const city of dataset.cities) {
    const p = map.project([city.lon, city.lat]);
    const d = Math.hypot(p.x - click.x, p.y - click.y);
    if (d < best) {
      best = d;
      bestId = city.id;
    }
  }
  return best <= 18 ? bestId : null;
}

export function CarteVIMapLibre({ initialDataset }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const safeDataset = useMemo(
    () => (initialDataset.cities.length || initialDataset.routes.length ? initialDataset : getMapProtoMockDataset()),
    [initialDataset]
  );
  const [dataset, setDataset] = useState<MapProtoDataset>(safeDataset);
  const [mode, setMode] = useState<Mode>("navigation");
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [tileTemplate, setTileTemplate] = useState<string | null>(null);
  const [manifestReady, setManifestReady] = useState(false);
  const [manifestLabel, setManifestLabel] = useState<string>("Chargement manifeste...");
  const [selectedLabel, setSelectedLabel] = useState<string>("Aucune sélection");
  const [overlaySize, setOverlaySize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [overlayCities, setOverlayCities] = useState<Array<{ id: string; name: string; x: number; y: number }>>([]);
  const [overlayRoutes, setOverlayRoutes] = useState<Array<{ id: string; d: string }>>([]);
  const [mapCanvasReady, setMapCanvasReady] = useState(false);

  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;

  useEffect(() => {
    injectMapLibreCssOnce();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMapTileManifest()
      .then((manifest) => {
        if (cancelled) return;
        const active = manifest?.active;
        const template =
          typeof active?.tileUrlTemplate === "string" ? active.tileUrlTemplate.trim() : "";
        if (template.length > 0) {
          setTileTemplate(template);
          setManifestLabel(`Version active: ${active?.versionHash ?? "—"}`);
        } else {
          setTileTemplate(null);
          setManifestLabel("Aucune tuile active, fallback raster");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTileTemplate(null);
          setManifestLabel("Manifeste introuvable, fallback raster");
        }
      })
      .finally(() => {
        if (!cancelled) setManifestReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifestReady) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    setMapCanvasReady(false);
    async function mount() {
      if (!containerRef.current || mapRef.current) return;
      const lib = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      const map = new lib.Map({
        container: containerRef.current,
        style: createCarteVIStyle(tileTemplate),
        center: [0, 20],
        zoom: 2.6,
        attributionControl: true,
      });
      mapRef.current = map;
      map.on("load", () => {
        if (cancelled) return;
        fitMapToCities(map, datasetRef.current.cities);
        map.resize();
        setMapCanvasReady(true);
      });
      map.on("error", (event) => {
        const msg = event?.error instanceof Error ? event.error.message : "Erreur MapLibre";
        setSelectedLabel(`Erreur carte: ${msg}`);
      });
      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(containerRef.current);
    }
    mount();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [manifestReady, tileTemplate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    fitMapToCities(map, dataset.cities);
  }, [dataset.cities]);

  useEffect(() => {
    if (!mapCanvasReady) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const recomputeOverlay = () => {
      const container = map.getContainer();
      setOverlaySize({ w: Math.max(container.clientWidth, 1), h: Math.max(container.clientHeight, 1) });
      const cities = dataset.cities.map((city) => {
        const p = map.project([city.lon, city.lat]);
        return { id: city.id, name: city.name, x: p.x, y: p.y };
      });
      setOverlayCities(cities);
      const routes = dataset.routes
        .filter((route) => route.points.length >= 2)
        .map((route) => {
          const d = route.points
            .map((point, idx) => {
              const p = map.project([point.lon, point.lat]);
              return `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
            })
            .join(" ");
          return { id: route.id, d };
        });
      setOverlayRoutes(routes);
    };

    recomputeOverlay();
    map.on("move", recomputeOverlay);
    map.on("zoom", recomputeOverlay);
    map.on("resize", recomputeOverlay);
    return () => {
      map.off("move", recomputeOverlay);
      map.off("zoom", recomputeOverlay);
      map.off("resize", recomputeOverlay);
    };
  }, [mapCanvasReady, dataset.cities, dataset.routes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (event: MapMouseEvent) => {
      const cityId = pickNearestCityId(map, dataset, event);
      const city = cityId ? dataset.cities.find((item) => item.id === cityId) : null;
      if (mode === "navigation") {
        setSelectedLabel(city ? `Ville: ${city.name}` : "Aucune sélection");
        return;
      }
      if (mode === "ajout-ville") {
        const nextIdx = dataset.cities.length + 1;
        setDataset((prev) => ({
          ...prev,
          cities: [...prev.cities, { id: `carte6-city-${Date.now()}`, name: `Ville ${nextIdx}`, lon: event.lngLat.lng, lat: event.lngLat.lat }],
        }));
        setSelectedLabel(`Ville créée: Ville ${nextIdx}`);
        return;
      }
      if (!cityId) {
        setSelectedLabel("Sélectionne une ville existante pour la route.");
        return;
      }
      if (!firstRouteCityId) {
        setFirstRouteCityId(cityId);
        setSelectedLabel(`Départ route: ${city?.name ?? cityId}`);
        return;
      }
      if (firstRouteCityId === cityId) return;
      const a = dataset.cities.find((item) => item.id === firstRouteCityId);
      const b = dataset.cities.find((item) => item.id === cityId);
      if (!a || !b) return;
      const routeName = `Route ${dataset.routes.length + 1}`;
      setDataset((prev) => ({
        ...prev,
        routes: [
          ...prev.routes,
          {
            id: `carte6-route-${Date.now()}`,
            name: routeName,
            cityAId: a.id,
            cityBId: b.id,
            points: [{ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat }],
          },
        ],
      }));
      setFirstRouteCityId(null);
      setSelectedLabel(`Route créée: ${routeName}`);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [dataset, firstRouteCityId, mode]);

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/35 px-3 py-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "navigation" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("navigation")}>Navigation</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-ville" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-ville")}>Ajouter une ville</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-route" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-route")}>Ajouter une route</button>
        <span className="ml-auto text-xs text-white/65">{manifestLabel}</span>
      </div>
      <div className="rounded-xl border border-amber-500/20 bg-black/30 p-2 text-xs text-white/70">
        {selectedLabel}
      </div>
      <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-2xl border border-amber-500/20 bg-black/45">
        <div ref={containerRef} className="h-full w-full min-h-[420px]" />
        <svg
          className="pointer-events-none absolute inset-0 z-20"
          viewBox={`0 0 ${overlaySize.w} ${overlaySize.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {overlayRoutes.map((route) => (
            <path key={route.id} d={route.d} stroke="#fbbf24" strokeWidth={4} fill="none" opacity={0.98} />
          ))}
          {overlayCities.map((city) => (
            <g key={city.id}>
              <circle cx={city.x} cy={city.y} r={8} fill="#34d399" stroke="#ecfeff" strokeWidth={2} />
              <text x={city.x + 10} y={city.y - 10} fill="#f8fafc" fontSize={12}>
                {city.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
