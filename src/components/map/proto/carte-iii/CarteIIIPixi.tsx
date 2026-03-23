"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { getMapProtoMockDataset } from "@/components/map/proto/data/mapProtoDataSource";
import { createCarteIIIScene, type CarteIIIScene } from "@/components/map/proto/carte-iii/carteIIIScene";
import { pickNearestCityId, pickNearestRouteId } from "@/components/map/proto/carte-iii/carteIIIInteractions";
import { CARTE_III_BOUNDS } from "@/components/map/proto/carte-iii/carteIIIProjection";

type Props = {
  initialDataset: MapProtoDataset;
};

type Mode = "navigation" | "ajout-ville" | "ajout-route";

export function CarteIIIPixi({ initialDataset }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CarteIIIScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>("navigation");
  const hasIncomingData = initialDataset.cities.length > 0 || initialDataset.routes.length > 0;
  const [dataset, setDataset] = useState<MapProtoDataset>(() => (hasIncomingData ? initialDataset : getMapProtoMockDataset()));
  const initialDatasetRef = useRef<MapProtoDataset>(hasIncomingData ? initialDataset : getMapProtoMockDataset());
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("Aucune sélection");
  const [isReady, setIsReady] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [fps, setFps] = useState<number>(0);
  const [overlayTick, setOverlayTick] = useState(0);
  const [fallbackView, setFallbackView] = useState<{ scale: number; tx: number; ty: number }>({
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const fallbackViewRef = useRef(fallbackView);
  const draggingRef = useRef<{ active: boolean; moved: boolean; x: number; y: number }>({
    active: false,
    moved: false,
    x: 0,
    y: 0,
  });

  const counts = useMemo(
    () => ({ cities: dataset.cities.length, routes: dataset.routes.length }),
    [dataset.cities.length, dataset.routes.length]
  );

  useEffect(() => {
    fallbackViewRef.current = fallbackView;
  }, [fallbackView]);

  const safePanBy = (dx: number, dy: number) => {
    try {
      const current = sceneRef.current as Partial<CarteIIIScene> | null;
      if (!current) return;
      const pan = current.panBy;
      if (typeof pan !== "function") return;
      pan(dx, dy);
    } catch {
      // Ignore transient race conditions during scene teardown/re-init.
    }
  };

  useEffect(() => {
    let cancelled = false;
    const mount = async () => {
      if (!hostRef.current || sceneRef.current) return;
      try {
        const scene = await createCarteIIIScene(hostRef.current);
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        scene.fitToCities(initialDatasetRef.current);
        scene.render({
          dataset: initialDatasetRef.current,
          mode: "navigation",
          selectedCityId: null,
          selectedRouteId: null,
          firstRouteCityId: null,
        });
        setIsReady(true);
        setSceneError(null);
        const updateFps = () => {
          if (!sceneRef.current) return;
          setFps(Number(sceneRef.current.app.ticker.FPS.toFixed(1)));
          rafRef.current = window.setTimeout(updateFps, 1000) as unknown as number;
        };
        updateFps();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erreur inconnue Pixi";
        setSceneError(msg);
        setSelectedLabel(`Erreur scène: ${msg}`);
        setFallbackActive(true);
      }
    };
    mount();
    const fallbackTimer = window.setTimeout(() => {
      if (!sceneRef.current) setFallbackActive(true);
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (rafRef.current !== null) {
        window.clearTimeout(rafRef.current);
        rafRef.current = null;
      }
      if (sceneRef.current) {
        sceneRef.current.destroy();
        sceneRef.current = null;
      }
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !isReady) return;
    scene.render({
      dataset,
      mode,
      selectedCityId,
      selectedRouteId,
      firstRouteCityId,
    });
  }, [dataset, firstRouteCityId, isReady, mode, selectedCityId, selectedRouteId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      const scene = sceneRef.current;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      if (scene && isReady) {
        scene.zoomAt(factor, event.offsetX, event.offsetY);
        scene.render({ dataset, mode, selectedCityId, selectedRouteId, firstRouteCityId });
      }
      const hostW = Math.max(host.clientWidth, 1);
      const hostH = Math.max(host.clientHeight, 1);
      setFallbackView((prev) => {
        const nextScale = clamp(prev.scale * factor, 0.45, 4);
        const wx = (event.offsetX - prev.tx) / prev.scale;
        const wy = (event.offsetY - prev.ty) / prev.scale;
        const tx = event.offsetX - wx * nextScale;
        const ty = event.offsetY - wy * nextScale;
        return clampView({ scale: nextScale, tx, ty }, hostW, hostH);
      });
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const canDragWithScene = Boolean(sceneRef.current && isReady);
      const canDragWithFallback = fallbackActive || !isReady;
      if (!canDragWithScene && !canDragWithFallback) return;
      event.preventDefault();
      draggingRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY };
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current.active) return;
      const dx = event.clientX - draggingRef.current.x;
      const dy = event.clientY - draggingRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) draggingRef.current.moved = true;
      draggingRef.current.x = event.clientX;
      draggingRef.current.y = event.clientY;
      if (sceneRef.current && isReady) {
        safePanBy(dx, dy);
        sceneRef.current.render({ dataset, mode, selectedCityId, selectedRouteId, firstRouteCityId });
      }
      const hostW = Math.max(host.clientWidth, 1);
      const hostH = Math.max(host.clientHeight, 1);
      setFallbackView((prev) => clampView({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }, hostW, hostH));
    };

    const onMouseUp = () => {
      draggingRef.current.active = false;
    };

    const onClick = (event: MouseEvent) => {
      const scene = sceneRef.current;
      if (draggingRef.current.moved) return;
      const cityId = pickNearestCityId(
        dataset.cities,
        (lon, lat) =>
          scene && isReady
            ? scene.projectToScreen(lon, lat)
            : fallbackProjectLonLat(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1), lon, lat),
        event.offsetX,
        event.offsetY
      );
      const routeId = pickNearestRouteId(
        dataset.routes,
        (lon, lat) =>
          scene && isReady
            ? scene.projectToScreen(lon, lat)
            : fallbackProjectLonLat(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1), lon, lat),
        event.offsetX,
        event.offsetY
      );

      if (mode === "navigation") {
        setSelectedCityId(cityId);
        setSelectedRouteId(routeId);
        if (cityId) {
          const city = dataset.cities.find((c) => c.id === cityId);
          setSelectedLabel(`Ville: ${city?.name ?? cityId}`);
          return;
        }
        if (routeId) {
          const route = dataset.routes.find((r) => r.id === routeId);
          setSelectedLabel(`Route: ${route?.name ?? routeId}`);
          return;
        }
        setSelectedLabel("Aucune sélection");
        return;
      }

      if (mode === "ajout-ville") {
        const geo = scene
          ? scene.screenToLonLat(event.offsetX, event.offsetY)
          : fallbackScreenToLonLat(host, event.offsetX, event.offsetY, fallbackViewRef.current);
        const cityName = `Ville ${dataset.cities.length + 1}`;
        const cityIdNew = `carte3-city-${Date.now()}`;
        setDataset((prev) => ({
          ...prev,
          cities: [...prev.cities, { id: cityIdNew, name: cityName, lon: geo.lon, lat: geo.lat, iconKey: "city" }],
        }));
        setSelectedCityId(cityIdNew);
        setSelectedRouteId(null);
        setSelectedLabel(`Ville créée: ${cityName}`);
        return;
      }

      if (mode === "ajout-route") {
        if (!cityId) {
          setSelectedLabel("Sélectionne une ville de départ.");
          return;
        }
        if (!firstRouteCityId) {
          setFirstRouteCityId(cityId);
          const city = dataset.cities.find((c) => c.id === cityId);
          setSelectedLabel(`Départ route: ${city?.name ?? cityId}`);
          return;
        }
        if (firstRouteCityId === cityId) return;
        const cityA = dataset.cities.find((c) => c.id === firstRouteCityId);
        const cityB = dataset.cities.find((c) => c.id === cityId);
        if (!cityA || !cityB) return;
        const routeName = `Route ${dataset.routes.length + 1}`;
        const routeIdNew = `carte3-route-${Date.now()}`;
        setDataset((prev) => ({
          ...prev,
          routes: [
            ...prev.routes,
            {
              id: routeIdNew,
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
        setSelectedRouteId(routeIdNew);
        setSelectedCityId(null);
        setFirstRouteCityId(null);
        setSelectedLabel(`Route créée: ${routeName}`);
      }
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    host.addEventListener("click", onClick);
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      host.removeEventListener("click", onClick);
    };
  }, [dataset, firstRouteCityId, isReady, mode, selectedCityId, selectedRouteId, fallbackActive]);

  useEffect(() => {
    if (!isReady && !fallbackActive) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      setOverlayTick((v) => (v + 1) % 100000);
      window.setTimeout(loop, 80);
    };
    loop();
    return () => {
      alive = false;
    };
  }, [fallbackActive, isReady]);

  const fallbackOverlay = useMemo(() => {
    const host = hostRef.current;
    if (!host) return { width: 1, height: 1, cityNodes: [], routePaths: [] as Array<{ id: string; d: string }> };
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const project = (lon: number, lat: number) => fallbackProjectLonLat(width, height, lon, lat, fallbackView);
    const cityNodes = dataset.cities.map((city) => {
      const p = project(city.lon, city.lat);
      return { ...city, x: p.x, y: p.y };
    });
    const routePaths = dataset.routes
      .filter((route) => route.points.length >= 2)
      .map((route) => ({
        id: route.id,
        d: route.points
          .map((point, idx) => {
            const p = project(point.lon, point.lat);
            return `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
          })
          .join(" "),
      }));
    return { width, height, cityNodes, routePaths };
  }, [dataset, isReady, overlayTick, fallbackView]);

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
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
          onClick={() => {
            const source = hasIncomingData ? initialDataset : getMapProtoMockDataset();
            setDataset(source);
            setFirstRouteCityId(null);
            setSelectedCityId(null);
            setSelectedRouteId(null);
            setSelectedLabel("Jeu de test réinitialisé");
            sceneRef.current?.fitToCities(source);
          }}
        >
          Réinitialiser test
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
          <span>FPS: {fps}</span>
          <span>Villes: {counts.cities}</span>
          <span>Routes: {counts.routes}</span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-black/30 p-2 text-sm text-white/75">
        <p>
          Mode actif: <span className="font-semibold text-amber-200">{mode}</span>
          {firstRouteCityId ? " · Étape route: sélectionne la ville d’arrivée" : ""}
          {isReady ? " · Scène prête" : " · Initialisation en cours"}
          {!hasIncomingData ? " · Source vide, affichage sur jeu de test" : ""}
          {sceneError || fallbackActive ? " · Mode dégradé" : ""}
        </p>
        <p className="mt-1 text-xs text-white/60">{selectedLabel}</p>
        <p className="mt-1 text-[11px] text-white/45">
          Drag: {draggingRef.current.active ? "on" : "off"} · Vue fallback s={fallbackView.scale.toFixed(2)} x={Math.round(fallbackView.tx)} y={Math.round(fallbackView.ty)}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-2xl border border-amber-500/20 bg-black/45">
          <div ref={hostRef} className="h-full w-full select-none cursor-grab active:cursor-grabbing" style={{ touchAction: "none" }} />
          <img
            src="/images/maps/world-map-equirectangular-v3.png?v=4"
            alt="Fond carte fallback"
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover"
            style={{
              transform: `translate(${fallbackView.tx}px, ${fallbackView.ty}px) scale(${fallbackView.scale})`,
              transformOrigin: "0 0",
            }}
          />
          <svg
            className="pointer-events-none absolute inset-0 z-10"
            viewBox={`0 0 ${fallbackOverlay.width} ${fallbackOverlay.height}`}
            preserveAspectRatio="none"
          >
            {fallbackOverlay.routePaths.map((route) => (
              <path key={route.id} d={route.d} stroke="#fcd34d" strokeWidth={3} fill="none" opacity={0.95} />
            ))}
            {fallbackOverlay.cityNodes.map((city) => (
              <g key={city.id}>
                <circle cx={city.x} cy={city.y} r={6} fill="#34d399" stroke="#ecfeff" strokeWidth={2} />
                <text x={city.x + 8} y={city.y - 8} fill="#f8fafc" fontSize="12">
                  {city.name}
                </text>
              </g>
            ))}
          </svg>
          {sceneError ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-start p-3 text-xs text-rose-200">
              <span className="rounded bg-rose-950/60 px-2 py-1">Erreur Pixi: {sceneError}</span>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <h3 className="text-base font-semibold text-white">Carte III — Prototype PixiJS</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>Scène 2D GPU avec couches dédiées (fond, routes, villes, labels).</li>
            <li>Zoom molette centré curseur et déplacement drag en mode navigation.</li>
            <li>Picking CPU pour villes/routes, indépendant des limitations MapLibre locales.</li>
            <li>Labels LOD activés selon niveau de zoom et cap d’affichage pour stabilité.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/60">
            Objectif prototype: {" > "}45 FPS en charge moyenne, sans fuite après cycles d’onglets.
          </div>
        </div>
      </div>
    </div>
  );
}

function fallbackProjectLonLat(
  width: number,
  height: number,
  lon: number,
  lat: number,
  view: { scale: number; tx: number; ty: number } = { scale: 1, tx: 0, ty: 0 }
) {
  const xRatio = (lon - CARTE_III_BOUNDS.lonMin) / (CARTE_III_BOUNDS.lonMax - CARTE_III_BOUNDS.lonMin);
  const yRatio = (CARTE_III_BOUNDS.latMax - lat) / (CARTE_III_BOUNDS.latMax - CARTE_III_BOUNDS.latMin);
  const x = xRatio * width;
  const y = yRatio * height;
  return { x: x * view.scale + view.tx, y: y * view.scale + view.ty };
}

function fallbackScreenToLonLat(host: HTMLDivElement, x: number, y: number, view: { scale: number; tx: number; ty: number }) {
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  const worldX = (x - view.tx) / Math.max(view.scale, 0.0001);
  const worldY = (y - view.ty) / Math.max(view.scale, 0.0001);
  const lon = CARTE_III_BOUNDS.lonMin + (worldX / width) * (CARTE_III_BOUNDS.lonMax - CARTE_III_BOUNDS.lonMin);
  const lat = CARTE_III_BOUNDS.latMax - (worldY / height) * (CARTE_III_BOUNDS.latMax - CARTE_III_BOUNDS.latMin);
  return { lon, lat };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampView(
  view: { scale: number; tx: number; ty: number },
  width: number,
  height: number
) {
  const slackX = width * 2;
  const slackY = height * 2;
  const minX = width * (1 - view.scale);
  const minY = height * (1 - view.scale);
  return {
    ...view,
    tx: clamp(view.tx, minX - slackX, slackX),
    ty: clamp(view.ty, minY - slackY, slackY),
  };
}
