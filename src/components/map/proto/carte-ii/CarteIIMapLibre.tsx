"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { buildGeoJsonBundle } from "@/components/map/proto/carte-ii/carteIIGeoJson";
import { getMapProtoMockDataset } from "@/components/map/proto/data/mapProtoDataSource";

type Props = {
  initialDataset: MapProtoDataset;
};

type Mode = "navigation" | "ajout-ville" | "ajout-route";
type BasemapMode = "osm" | "minimal";

function ensureDataLayers(
  map: MapLibreMap,
  bundle: ReturnType<typeof buildGeoJsonBundle>
) {
  if (!map.getSource("cities")) {
    map.addSource("cities", { type: "geojson", data: bundle.cities });
  }
  if (!map.getSource("routes")) {
    map.addSource("routes", { type: "geojson", data: bundle.routes });
  }

  if (!map.getLayer("routes-line")) {
    map.addLayer({
      id: "routes-line",
      type: "line",
      source: "routes",
      paint: {
        "line-color": [
          "match",
          ["get", "tier"],
          "national",
          "#f59e0b",
          "regional",
          "#22c55e",
          "#93c5fd",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3, 6, 6, 10, 10],
        "line-opacity": 0.98,
      },
    });
  }

  if (!map.getLayer("cities-circle")) {
    map.addLayer({
      id: "cities-circle",
      type: "circle",
      source: "cities",
      paint: {
        "circle-color": "#34d399",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 5, 8, 10],
        "circle-stroke-color": "#ecfeff",
        "circle-stroke-width": 2.5,
      },
    });
  }

  // Keep data overlays above raster basemap layers.
  map.moveLayer("routes-line");
  map.moveLayer("cities-circle");
}

function pickNearestCityId(
  map: MapLibreMap,
  dataset: MapProtoDataset,
  lng: number,
  lat: number,
  maxDistancePx = 18
): string | null {
  if (dataset.cities.length === 0) return null;
  const click = map.project([lng, lat]);
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const city of dataset.cities) {
    const p = map.project([city.lon, city.lat]);
    const dist = Math.hypot(p.x - click.x, p.y - click.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = city.id;
    }
  }
  if (bestDist <= maxDistancePx) return bestId;
  return null;
}

function createStyle(mode: BasemapMode): StyleSpecification {
  const showRaster = mode === "osm";
  const showLocalWorld = true;
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
      local_world: {
        type: "image",
        url: "/images/maps/world-map-equirectangular-v3.png?v=4",
        coordinates: [
          [-180, 85],
          [180, 85],
          [180, -85],
          [-180, -85],
        ],
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#0b1a22",
        },
      },
      {
        id: "local-world-layer",
        type: "raster",
        source: "local_world",
        layout: { visibility: showLocalWorld ? "visible" : "none" },
        paint: { "raster-opacity": mode === "osm" ? 0.38 : 0.9 },
      },
      {
        id: "osm-base",
        type: "raster",
        source: "osm",
        layout: { visibility: showRaster ? "visible" : "none" },
        paint: { "raster-opacity": showRaster ? 0.9 : 0 },
      },
    ],
  };
}

function injectMapLibreCssOnce() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("maplibre-proto-css-base")) {
    const style = document.createElement("style");
    style.id = "maplibre-proto-css-base";
    style.textContent = `
      .maplibregl-map { position: relative; overflow: hidden; -webkit-tap-highlight-color: transparent; }
      .maplibregl-canvas-container { position: absolute; inset: 0; }
      .maplibregl-canvas { position: absolute; left: 0; top: 0; }
      .maplibregl-control-container { position: absolute; inset: 0; pointer-events: none; }
      .maplibregl-ctrl { pointer-events: auto; }
    `;
    document.head.appendChild(style);
  }
  if (!document.getElementById("maplibre-proto-css-cdn")) {
    const link = document.createElement("link");
    link.id = "maplibre-proto-css-cdn";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.css";
    link.onerror = () => {
      // Carte utilisable même sans CSS MapLibre, avec style de contrôle dégradé.
    };
    document.head.appendChild(link);
  }
}

export function CarteIIMapLibre({ initialDataset }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasIncomingData = initialDataset.cities.length > 0 || initialDataset.routes.length > 0;
  const safeInitialDataset = useMemo(
    () => (hasIncomingData ? initialDataset : getMapProtoMockDataset()),
    [hasIncomingData, initialDataset]
  );
  const [mode, setMode] = useState<Mode>("navigation");
  const [basemap, setBasemap] = useState<BasemapMode>("minimal");
  const [dataset, setDataset] = useState<MapProtoDataset>(safeInitialDataset);
  const [selectedLabel, setSelectedLabel] = useState<string>("Aucune sélection");
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [zoom, setZoom] = useState<number>(2.7);
  const [centerLabel, setCenterLabel] = useState<string>("0.00, 20.00");
  const [renderedCounts, setRenderedCounts] = useState<{ cities: number; routes: number }>({ cities: 0, routes: 0 });
  const [overlaySize, setOverlaySize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [overlayCities, setOverlayCities] = useState<Array<{ id: string; name: string; x: number; y: number }>>([]);
  const [overlayRoutes, setOverlayRoutes] = useState<Array<{ id: string; d: string }>>([]);
  const bundle = useMemo(() => buildGeoJsonBundle(dataset), [dataset]);
  const counts = useMemo(
    () => ({
      cities: bundle.cities.features.length,
      routes: bundle.routes.features.length,
      labels: bundle.routeLabels.features.length,
    }),
    [bundle]
  );

  useEffect(() => {
    injectMapLibreCssOnce();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    async function mount() {
      if (!containerRef.current || mapRef.current) return;
      const lib = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      const map = new lib.Map({
        container: containerRef.current,
        style: createStyle(basemap),
        center: [0, 20],
        zoom: 2.7,
        attributionControl: {},
      });
      mapRef.current = map;
      map.on("error", (event) => {
        const msg = event?.error instanceof Error ? event.error.message : "Erreur MapLibre inconnue";
        setSelectedLabel(`Erreur carte: ${msg}`);
      });

      const initDataLayers = () => {
        if (!map.isStyleLoaded()) return;
        try {
          ensureDataLayers(map, bundle);

          map.on("moveend", () => {
            setZoom(Number(map.getZoom().toFixed(2)));
            const center = map.getCenter();
            setCenterLabel(`${center.lng.toFixed(2)}, ${center.lat.toFixed(2)}`);
            const renderedCities = map.queryRenderedFeatures({ layers: ["cities-circle"] }).length;
            const renderedRoutes = map.queryRenderedFeatures({ layers: ["routes-line"] }).length;
            setRenderedCounts({ cities: renderedCities, routes: renderedRoutes });
          });
          map.resize();

          if (bundle.cities.features.length > 0) {
            let minLon = Number.POSITIVE_INFINITY;
            let minLat = Number.POSITIVE_INFINITY;
            let maxLon = Number.NEGATIVE_INFINITY;
            let maxLat = Number.NEGATIVE_INFINITY;
            for (const city of dataset.cities) {
              minLon = Math.min(minLon, city.lon);
              minLat = Math.min(minLat, city.lat);
              maxLon = Math.max(maxLon, city.lon);
              maxLat = Math.max(maxLat, city.lat);
            }
            if (Number.isFinite(minLon) && Number.isFinite(minLat) && Number.isFinite(maxLon) && Number.isFinite(maxLat)) {
              map.fitBounds(
                [
                  [minLon, minLat],
                  [maxLon, maxLat],
                ],
                { padding: 60, duration: 0 }
              );
            }
          }

          resizeObserver = new ResizeObserver(() => {
            map.resize();
          });
          resizeObserver.observe(containerRef.current as Element);
          const renderedCities = map.queryRenderedFeatures({ layers: ["cities-circle"] }).length;
          const renderedRoutes = map.queryRenderedFeatures({ layers: ["routes-line"] }).length;
          setRenderedCounts({ cities: renderedCities, routes: renderedRoutes });
          setIsReady(true);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Erreur d'initialisation des couches";
          setSelectedLabel(`Erreur couches: ${msg}`);
        }
      };

      // `load` can be delayed by remote raster issues. Initialize layers as soon as style is ready.
      map.on("styledata", initDataLayers);
      map.on("load", initDataLayers);
      map.on("idle", initDataLayers);
      if (map.isStyleLoaded()) {
        initDataLayers();
      }
    }
    mount();

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const onClick = (event: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["routes-line"],
      });
      const routeFeature = features.find((f) => f.layer.id === "routes-line");
      const nearestCityId = pickNearestCityId(map, dataset, event.lngLat.lng, event.lngLat.lat);
      const nearestCity = nearestCityId ? dataset.cities.find((city) => city.id === nearestCityId) : undefined;

      if (mode === "navigation") {
        if (nearestCity) {
          const name = nearestCity.name;
          setSelectedLabel(`Ville: ${name}`);
          return;
        }
        if (routeFeature) {
          const name = String(routeFeature.properties?.name ?? "Route");
          setSelectedLabel(`Route: ${name}`);
          return;
        }
        setSelectedLabel("Aucune sélection");
        return;
      }

      if (mode === "ajout-ville") {
        const idx = dataset.cities.length + 1;
        const name = `Ville ${idx}`;
        const id = `carte2-city-${Date.now()}`;
        setDataset((prev) => ({
          ...prev,
          cities: [...prev.cities, { id, name, lon: event.lngLat.lng, lat: event.lngLat.lat, iconKey: "city" }],
        }));
        setSelectedLabel(`Ville créée: ${name}`);
        return;
      }

      if (mode === "ajout-route") {
        if (!nearestCityId) {
          setSelectedLabel("Sélectionne une ville (clic proche d’un marqueur).");
          return;
        }
        const cityId = nearestCityId;
        if (!firstRouteCityId) {
          setFirstRouteCityId(cityId);
          const name = nearestCity?.name ?? cityId;
          setSelectedLabel(`Départ route: ${name}`);
          return;
        }
        if (firstRouteCityId === cityId) return;
        const cityA = dataset.cities.find((city) => city.id === firstRouteCityId);
        const cityB = dataset.cities.find((city) => city.id === cityId);
        if (!cityA || !cityB) return;
        const routeId = `carte2-route-${Date.now()}`;
        const routeName = `Route ${dataset.routes.length + 1}`;
        setDataset((prev) => ({
          ...prev,
          routes: [
            ...prev.routes,
            {
              id: routeId,
              name: routeName,
              cityAId: cityA.id,
              cityBId: cityB.id,
              points: [
                { lon: cityA.lon, lat: cityA.lat },
                { lon: cityB.lon, lat: cityB.lat },
              ],
            },
          ],
        }));
        setSelectedLabel(`Route créée: ${routeName}`);
        setFirstRouteCityId(null);
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [dataset, firstRouteCityId, isReady, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      try {
        ensureDataLayers(map, bundle);
      } catch {
        // Ignore transient style rebuild races; next styledata/idle will retry.
      }
    }
    const source = map.getSource("cities") as { setData?: (d: unknown) => void } | undefined;
    source?.setData?.(bundle.cities);
    const routeSource = map.getSource("routes") as { setData?: (d: unknown) => void } | undefined;
    routeSource?.setData?.(bundle.routes);
  }, [bundle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || dataset.cities.length === 0) return;
    let minLon = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const city of dataset.cities) {
      minLon = Math.min(minLon, city.lon);
      minLat = Math.min(minLat, city.lat);
      maxLon = Math.max(maxLon, city.lon);
      maxLat = Math.max(maxLat, city.lat);
    }
    if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) return;
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 60, duration: 300 }
    );
  }, [dataset.cities, isReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

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
  }, [dataset.cities, dataset.routes, isReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const osmVis = basemap === "osm" ? "visible" : "none";
    const localVis = "visible";
    if (map.getLayer("osm-base")) map.setLayoutProperty("osm-base", "visibility", osmVis);
    if (map.getLayer("local-world-layer")) map.setLayoutProperty("local-world-layer", "visibility", localVis);
    if (map.getLayer("local-world-layer")) {
      map.setPaintProperty("local-world-layer", "raster-opacity", basemap === "osm" ? 0.38 : 0.9);
    }
  }, [basemap]);

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/35 px-3 py-2">
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${mode === "navigation" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`}
          onClick={() => setMode("navigation")}
        >
          Navigation
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-ville" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`}
          onClick={() => setMode("ajout-ville")}
        >
          Ajouter une ville
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-route" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`}
          onClick={() => setMode("ajout-route")}
        >
          Ajouter une route
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${basemap === "osm" ? "bg-emerald-500/80 text-black" : "bg-white/10 text-white/80"}`}
          onClick={() => setBasemap("osm")}
        >
          Fond OSM
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${basemap === "minimal" ? "bg-emerald-500/80 text-black" : "bg-white/10 text-white/80"}`}
          onClick={() => setBasemap("minimal")}
        >
          Fond minimal
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
          <span>Zoom: {zoom}</span>
          <span>Centre: {centerLabel}</span>
          <span>Villes: {counts.cities}</span>
          <span>Routes: {counts.routes}</span>
          <span>Rendues V/R: {renderedCounts.cities}/{renderedCounts.routes}</span>
          <span>Couches: {isReady ? "ok" : "init"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-black/30 p-2 text-sm text-white/75">
        <p>
          Mode actif: <span className="font-semibold text-amber-200">{mode}</span>
          {firstRouteCityId ? " · Étape route: sélectionne la ville d’arrivée" : ""}
          {isReady ? " · Carte prête" : " · Initialisation en cours"}
          {!hasIncomingData ? " · Source vide, affichage sur jeu de test" : ""}
        </p>
        <p className="mt-1 text-xs text-white/60">{selectedLabel}</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-2xl border border-amber-500/20 bg-black/45">
          <div ref={containerRef} className="h-full w-full" />
          <svg
            className="pointer-events-none absolute inset-0 z-20"
            viewBox={`0 0 ${overlaySize.w} ${overlaySize.h}`}
            preserveAspectRatio="none"
          >
            {overlayRoutes.map((route) => (
              <path key={route.id} d={route.d} stroke="#fcd34d" strokeWidth={3} fill="none" opacity={0.95} />
            ))}
            {overlayCities.map((city) => (
              <g key={city.id}>
                <circle cx={city.x} cy={city.y} r={6} fill="#34d399" stroke="#ecfeff" strokeWidth={2} />
                <text x={city.x + 8} y={city.y - 8} fill="#f8fafc" fontSize="12">
                  {city.name}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <h3 className="text-base font-semibold text-white">Grille de comparaison DeckGL vs MapLibre</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>DeckGL actuel : plus riche mais pipeline historique complexe (SVG/WebGL, workers, gouverneur qualité).</li>
            <li>MapLibre proto : pipeline simple et lisible, interactions de base plus faciles à stabiliser.</li>
            <li>Validation visée : fluidité navigation, sélection fiable, ajout local d’entités rapide.</li>
            <li>Hors périmètre v1 : rendu fantasy final, provinces complexes, édition avancée MJ.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/60">
            Seuils de test proto: jusqu’à 2 000 villes et 1 500 routes chargées.
          </div>
        </div>
      </div>
    </div>
  );
}
