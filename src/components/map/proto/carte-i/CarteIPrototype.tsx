"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { clamp, useCarteICamera, type CarteICameraState, CARTE_I_MAX_SCALE, CARTE_I_MIN_SCALE } from "@/components/map/proto/carte-i/useCarteICamera";
import { clearCanvas, drawBackground, drawCities, drawRoutes, type CarteIWorldCity, type CarteIWorldRoute } from "@/components/map/proto/carte-i/carteIRenderer";
import { findClosestCity, findClosestRoute, screenToWorld, worldToUv } from "@/components/map/proto/carte-i/carteIPicking";

type CarteIMode = "navigation" | "ajout-ville" | "ajout-route" | "deplacer";

type Props = {
  initialDataset: MapProtoDataset;
  mapImageUrl?: string;
};

type Bounds = {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
};

function computeBounds(dataset: MapProtoDataset): Bounds {
  const lonValues = dataset.cities.map((city) => city.lon);
  const latValues = dataset.cities.map((city) => city.lat);
  const routes = dataset.routes.flatMap((route) => route.points);
  for (const point of routes) {
    lonValues.push(point.lon);
    latValues.push(point.lat);
  }
  const minLon = Math.min(...lonValues, 0);
  const maxLon = Math.max(...lonValues, 8);
  const minLat = Math.min(...latValues, 43);
  const maxLat = Math.max(...latValues, 50);
  return { minLon, maxLon, minLat, maxLat };
}

function toUv(lon: number, lat: number, bounds: Bounds) {
  const lonSpan = Math.max(0.0001, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.0001, bounds.maxLat - bounds.minLat);
  const u = (lon - bounds.minLon) / lonSpan;
  const v = 1 - (lat - bounds.minLat) / latSpan;
  return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
}

function toLonLat(u: number, v: number, bounds: Bounds) {
  const lon = bounds.minLon + u * (bounds.maxLon - bounds.minLon);
  const lat = bounds.maxLat - v * (bounds.maxLat - bounds.minLat);
  return { lon, lat };
}

function computeWorldDataset(dataset: MapProtoDataset, bounds: Bounds) {
  const cities: CarteIWorldCity[] = dataset.cities.map((city) => ({ ...city, ...toUv(city.lon, city.lat, bounds) }));
  const routes: CarteIWorldRoute[] = dataset.routes.map((route) => ({
    ...route,
    points: route.points.map((p) => ({ ...p, ...toUv(p.lon, p.lat, bounds) })),
  }));
  return { cities, routes };
}

function clampCameraToViewport(camera: CarteICameraState, imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number) {
  const scaledWidth = imageWidth * camera.scale;
  const scaledHeight = imageHeight * camera.scale;
  if (scaledWidth <= viewportWidth) {
    camera.translateX = (viewportWidth - scaledWidth) / 2;
  } else {
    const minX = viewportWidth - scaledWidth;
    const maxX = 0;
    camera.translateX = clamp(camera.translateX, minX, maxX);
  }

  if (scaledHeight <= viewportHeight) {
    camera.translateY = (viewportHeight - scaledHeight) / 2;
  } else {
    const minY = viewportHeight - scaledHeight;
    const maxY = 0;
    camera.translateY = clamp(camera.translateY, minY, maxY);
  }
}

function centerCameraContain(camera: CarteICameraState, imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number) {
  const baseScale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  camera.scale = clamp(baseScale, CARTE_I_MIN_SCALE, CARTE_I_MAX_SCALE);
  camera.translateX = (viewportWidth - imageWidth * camera.scale) / 2;
  camera.translateY = (viewportHeight - imageHeight * camera.scale) / 2;
}

export function CarteIPrototype({ initialDataset, mapImageUrl = "/images/maps/world-map-equirectangular-v3.png" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cameraRef = useCarteICamera({ scale: 1, translateX: 0, translateY: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [mode, setMode] = useState<CarteIMode>("navigation");
  const [dataset, setDataset] = useState<MapProtoDataset>(initialDataset);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [isImageReady, setIsImageReady] = useState(false);
  const [fps, setFps] = useState(0);
  const [visibleCounts, setVisibleCounts] = useState({ cities: 0, routes: 0 });
  const frameStatRef = useRef({ frames: 0, startedAt: performance.now() });
  const bounds = useMemo(() => computeBounds(dataset), [dataset]);
  const world = useMemo(() => computeWorldDataset(dataset, bounds), [dataset, bounds]);

  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const image = imageRef.current;
      const camera = cameraRef.current;
      if (!canvas || !image) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const viewportWidth = canvas.clientWidth;
      const viewportHeight = canvas.clientHeight;
      clearCanvas(ctx, viewportWidth, viewportHeight);
      drawBackground(ctx, image, camera, viewportWidth, viewportHeight);

      const worldMinX = (0 - camera.translateX) / camera.scale;
      const worldMinY = (0 - camera.translateY) / camera.scale;
      const worldMaxX = (viewportWidth - camera.translateX) / camera.scale;
      const worldMaxY = (viewportHeight - camera.translateY) / camera.scale;
      const visibleCities = world.cities.filter((city) => {
        const x = city.u * image.naturalWidth;
        const y = city.v * image.naturalHeight;
        return x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;
      });
      const visibleRoutes = world.routes.filter((route) => {
        if (route.points.length < 2) return false;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of route.points) {
          const x = p.u * image.naturalWidth;
          const y = p.v * image.naturalHeight;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        return !(maxX < worldMinX || maxY < worldMinY || minX > worldMaxX || minY > worldMaxY);
      });

      drawRoutes(ctx, visibleRoutes, image.naturalWidth, image.naturalHeight, camera, camera.scale >= 1.2);
      drawCities(ctx, visibleCities, image.naturalWidth, image.naturalHeight, camera, camera.scale >= 0.9, selectedCityId ?? undefined);

      setVisibleCounts({ cities: visibleCities.length, routes: visibleRoutes.length });
      frameStatRef.current.frames += 1;
      const now = performance.now();
      const elapsed = now - frameStatRef.current.startedAt;
      if (elapsed >= 1000) {
        setFps(Math.round((frameStatRef.current.frames * 1000) / elapsed));
        frameStatRef.current.frames = 0;
        frameStatRef.current.startedAt = now;
      }
    });
  }, [cameraRef, selectedCityId, world.cities, world.routes]);

  useEffect(() => {
    const image = new Image();
    image.src = mapImageUrl;
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      centerCameraContain(cameraRef.current, image.naturalWidth, image.naturalHeight, width, height);
      setIsImageReady(true);
      requestDraw();
    };
  }, [cameraRef, mapImageUrl, requestDraw]);

  useEffect(() => {
    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!container || !canvas || !image) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clampCameraToViewport(cameraRef.current, image.naturalWidth, image.naturalHeight, width, height);
      requestDraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [cameraRef, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [requestDraw, world, selectedCityId, selectedRouteId, mode]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const image = imageRef.current;
      const canvas = canvasRef.current;
      if (!image || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const camera = cameraRef.current;
      const preWorld = screenToWorld({ x: mouseX, y: mouseY }, camera);
      const nextScale = clamp(camera.scale * (event.deltaY < 0 ? 1.08 : 0.93), CARTE_I_MIN_SCALE, CARTE_I_MAX_SCALE);
      camera.scale = nextScale;
      camera.translateX = mouseX - preWorld.x * nextScale;
      camera.translateY = mouseY - preWorld.y * nextScale;
      clampCameraToViewport(camera, image.naturalWidth, image.naturalHeight, canvas.clientWidth, canvas.clientHeight);
      requestDraw();
    },
    [cameraRef, requestDraw]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!canvas || !image) return;
      const rect = canvas.getBoundingClientRect();
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const cityId = findClosestCity(local, world.cities, cameraRef.current, image.naturalWidth, image.naturalHeight);
      const routeId =
        cityId === null
          ? findClosestRoute(local, world.routes, cameraRef.current, image.naturalWidth, image.naturalHeight)
          : null;
      setSelectedCityId(cityId);
      setSelectedRouteId(routeId);

      if (mode === "ajout-ville") {
        const worldPoint = screenToWorld(local, cameraRef.current);
        const uv = worldToUv(worldPoint, image.naturalWidth, image.naturalHeight);
        if (uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1) {
          const lonLat = toLonLat(uv.u, uv.v, bounds);
          const id = `city-local-${Date.now()}`;
          setDataset((prev) => ({
            ...prev,
            cities: [...prev.cities, { id, name: `Ville ${prev.cities.length + 1}`, lon: lonLat.lon, lat: lonLat.lat, iconKey: "city" }],
          }));
          setSelectedCityId(id);
        }
        return;
      }

      if (mode === "ajout-route") {
        if (cityId) {
          if (!firstRouteCityId) {
            setFirstRouteCityId(cityId);
          } else if (firstRouteCityId !== cityId) {
            const cityA = dataset.cities.find((c) => c.id === firstRouteCityId);
            const cityB = dataset.cities.find((c) => c.id === cityId);
            if (cityA && cityB) {
              const routeIdNew = `route-local-${Date.now()}`;
              setDataset((prev) => ({
                ...prev,
                routes: [
                  ...prev.routes,
                  {
                    id: routeIdNew,
                    name: `Chemin ${prev.routes.length + 1}`,
                    cityAId: cityA.id,
                    cityBId: cityB.id,
                    points: [
                      { lon: cityA.lon, lat: cityA.lat },
                      { lon: cityB.lon, lat: cityB.lat },
                    ],
                  },
                ],
              }));
            }
            setFirstRouteCityId(null);
          }
        }
        return;
      }

      if ((mode === "navigation" || mode === "deplacer") && (cityId === null || mode === "navigation")) {
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          cameraX: cameraRef.current.translateX,
          cameraY: cameraRef.current.translateY,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (mode === "deplacer" && cityId) {
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          cameraX: 0,
          cameraY: 0,
        };
        canvas.setPointerCapture(event.pointerId);
      }
    },
    [bounds, cameraRef, dataset.cities, firstRouteCityId, mode, world.cities, world.routes]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !canvas || !image) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (mode === "deplacer" && selectedCityId) {
        const rect = canvas.getBoundingClientRect();
        const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const worldPoint = screenToWorld(local, cameraRef.current);
        const uv = worldToUv(worldPoint, image.naturalWidth, image.naturalHeight);
        if (uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1) {
          const lonLat = toLonLat(uv.u, uv.v, bounds);
          setDataset((prev) => ({
            ...prev,
            cities: prev.cities.map((city) =>
              city.id === selectedCityId ? { ...city, lon: lonLat.lon, lat: lonLat.lat } : city
            ),
            routes: prev.routes.map((route) => {
              if (route.cityAId !== selectedCityId && route.cityBId !== selectedCityId) return route;
              const cityA = route.cityAId === selectedCityId ? lonLat : prev.cities.find((city) => city.id === route.cityAId);
              const cityB = route.cityBId === selectedCityId ? lonLat : prev.cities.find((city) => city.id === route.cityBId);
              if (!cityA || !cityB) return route;
              return {
                ...route,
                points: [
                  { lon: cityA.lon, lat: cityA.lat },
                  { lon: cityB.lon, lat: cityB.lat },
                ],
              };
            }),
          }));
        }
      } else {
        const camera = cameraRef.current;
        camera.translateX = drag.cameraX + dx;
        camera.translateY = drag.cameraY + dy;
        clampCameraToViewport(camera, image.naturalWidth, image.naturalHeight, canvas.clientWidth, canvas.clientHeight);
      }
      requestDraw();
    },
    [bounds, cameraRef, mode, requestDraw, selectedCityId]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
      if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
  }, []);

  const resetTest = useCallback(() => {
    setDataset(initialDataset);
    setFirstRouteCityId(null);
    setSelectedCityId(null);
    setSelectedRouteId(null);
  }, [initialDataset]);

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/35 px-3 py-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "navigation" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("navigation")}>Navigation</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-ville" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-ville")}>Ajouter une ville</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-route" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-route")}>Ajouter une route</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "deplacer" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("deplacer")}>Déplacer une ville</button>
        <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20" onClick={resetTest}>Réinitialiser les tests</button>
        <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
          <span>FPS: {fps}</span>
          <span>Villes visibles: {visibleCounts.cities}</span>
          <span>Routes visibles: {visibleCounts.routes}</span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-black/30 p-2 text-sm text-white/75">
        <p>
          Mode actif: <span className="font-semibold text-amber-200">{mode}</span>
          {firstRouteCityId ? " · Étape route: sélectionne la seconde ville" : ""}
          {selectedCityId ? ` · Ville sélectionnée: ${selectedCityId}` : ""}
          {selectedRouteId ? ` · Route sélectionnée: ${selectedRouteId}` : ""}
        </p>
        <p className="mt-1 text-xs text-white/55">Fond actif: {mapImageUrl}</p>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden rounded-2xl border border-amber-500/20 bg-black/50">
        {!isImageReady && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
            Chargement de la carte raster...
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}
