"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { getMapProtoMockDataset } from "@/components/map/proto/data/mapProtoDataSource";
import { renderCarteIV, type WorkerRouteGeometry, worldToLonLat } from "@/components/map/proto/carte-iv/carteIVRenderer";
import { pickCityAt, pickRouteAt } from "@/components/map/proto/carte-iv/carteIVPicking";
import { useCarteIVCamera } from "@/components/map/proto/carte-iv/useCarteIVCamera";

type Props = { initialDataset: MapProtoDataset };
type Mode = "navigation" | "ajout-ville" | "ajout-route";

export function CarteIVCanvas({ initialDataset }: Props) {
  const hasIncomingData = initialDataset.cities.length > 0 || initialDataset.routes.length > 0;
  const [dataset, setDataset] = useState<MapProtoDataset>(() => (hasIncomingData ? initialDataset : getMapProtoMockDataset()));
  const [mode, setMode] = useState<Mode>("navigation");
  const [useWorker, setUseWorker] = useState(false);
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("Aucune sélection");
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState({ visibleCities: 0, visibleRoutes: 0, visibleLabels: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const geometryRef = useRef<WorkerRouteGeometry | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const dragRef = useRef<{ active: boolean; moved: boolean; x: number; y: number }>({ active: false, moved: false, x: 0, y: 0 });
  const { camera, panBy, zoomAt, setCamera } = useCarteIVCamera({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ w: 1, h: 1, dpr: 1 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const next = renderCarteIV(ctx, size, camera, dataset, bgRef.current, useWorker ? geometryRef.current : null);
    setStats(next);
  }, [camera, dataset, size, useWorker]);

  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    const img = new Image();
    img.src = "/images/maps/world-map-equirectangular-v3.png?v=4";
    img.onload = () => {
      bgRef.current = img;
      drawRef.current();
    };
  }, []);

  useEffect(() => {
    if (!useWorker) {
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = null;
      geometryRef.current = null;
      return;
    }
    const worker = new Worker(new URL("../../../../workers/carteIVGeometry.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerRouteGeometry>) => {
      geometryRef.current = event.data;
      drawRef.current();
    };
    worker.postMessage({ routes: dataset.routes });
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [dataset.routes, useWorker]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const resize = () => {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(1, Math.floor(host.clientWidth));
      const h = Math.max(1, Math.floor(host.clientHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      setSize({ w, h, dpr });
      drawRef.current();
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(host);
    resize();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    drawRef.current();
  }, [camera, dataset, mode, size, useWorker]);

  useEffect(() => {
    let last = performance.now();
    let frames = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Number(((frames * 1000) / (now - last)).toFixed(1)));
        frames = 0;
        last = now;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const counts = useMemo(() => ({ cities: dataset.cities.length, routes: dataset.routes.length }), [dataset]);

  const onMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (mode !== "navigation") return;
    event.preventDefault();
    dragRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY };
  };

  useEffect(() => {
    const onWindowMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragRef.current.moved = true;
      dragRef.current.x = event.clientX;
      dragRef.current.y = event.clientY;
      panBy(dx, dy);
    };

    const onWindowMouseUp = () => {
      dragRef.current.active = false;
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [panBy]);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    zoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
  };

  const onClick = (event: React.MouseEvent) => {
    if (dragRef.current.moved) return;
    const cityId = pickCityAt(dataset, size, camera, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    const routeId = pickRouteAt(dataset, size, camera, event.nativeEvent.offsetX, event.nativeEvent.offsetY);

    if (mode === "navigation") {
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
      const worldX = (event.nativeEvent.offsetX - camera.tx) / camera.scale;
      const worldY = (event.nativeEvent.offsetY - camera.ty) / camera.scale;
      const geo = worldToLonLat(size.w, size.h, worldX, worldY);
      const name = `Ville ${dataset.cities.length + 1}`;
      const id = `carte4-city-${Date.now()}`;
      setDataset((prev) => ({ ...prev, cities: [...prev.cities, { id, name, lon: geo.lon, lat: geo.lat, iconKey: "city" }] }));
      setSelectedLabel(`Ville créée: ${name}`);
      return;
    }

    if (mode === "ajout-route") {
      if (!cityId) {
        setSelectedLabel("Sélectionne une ville pour créer une route.");
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
      const routeIdNew = `carte4-route-${Date.now()}`;
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
      setFirstRouteCityId(null);
      setSelectedLabel(`Route créée: ${routeName}`);
    }
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/35 px-3 py-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "navigation" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("navigation")}>Navigation</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-ville" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-ville")}>Ajouter une ville</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-route" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-route")}>Ajouter une route</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${useWorker ? "bg-emerald-500/80 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setUseWorker((v) => !v)}>Worker {useWorker ? "ON" : "OFF"}</button>
        <button
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
          onClick={() => {
            const source = hasIncomingData ? initialDataset : getMapProtoMockDataset();
            setDataset(source);
            setFirstRouteCityId(null);
            setSelectedLabel("Jeu de test réinitialisé");
            setCamera({ scale: 1, tx: 0, ty: 0 });
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
          {!hasIncomingData ? " · Source vide, affichage sur jeu de test" : ""}
        </p>
        <p className="mt-1 text-xs text-white/60">{selectedLabel}</p>
        <p className="mt-1 text-[11px] text-white/45">
          Caméra s={camera.scale.toFixed(2)} x={Math.round(camera.tx)} y={Math.round(camera.ty)} · visibles V/R/L {stats.visibleCities}/{stats.visibleRoutes}/{stats.visibleLabels}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          ref={hostRef}
          className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-2xl border border-amber-500/20 bg-black/45 select-none"
          style={{ touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseLeave={() => {
            dragRef.current.active = false;
          }}
          onWheel={onWheel}
          onClick={onClick}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <h3 className="text-base font-semibold text-white">Carte IV — Canvas 2D</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>Rendu Canvas pur avec culling viewport routes/villes.</li>
            <li>Worker optionnel pour préparation géométrique et labels.</li>
            <li>Buffers transférables (ArrayBuffer) pour limiter les copies coûteuses.</li>
            <li>Overlay debug intégré pour fluidité et diagnostic caméra.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
