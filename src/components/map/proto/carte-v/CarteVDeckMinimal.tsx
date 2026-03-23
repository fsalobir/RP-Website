"use client";

import React, { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import DeckGL from "@deck.gl/react";
import { MapController, MapView } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import { getMapProtoMockDataset } from "@/components/map/proto/data/mapProtoDataSource";
import { buildCarteVLayers } from "@/components/map/proto/carte-v/carteVDeckLayers";
import { toCarteVData } from "@/components/map/proto/carte-v/carteVTransforms";
import { CarteIVCanvas } from "@/components/map/proto/carte-iv/CarteIVCanvas";

type Props = { initialDataset: MapProtoDataset };
type Mode = "navigation" | "ajout-ville" | "ajout-route";

const view = new MapView({ repeat: true });

export function CarteVDeckMinimal({ initialDataset }: Props) {
  const enableDeckRendering = false;
  const hasIncomingData = initialDataset.cities.length > 0 || initialDataset.routes.length > 0;
  const [dataset, setDataset] = useState<MapProtoDataset>(() => (hasIncomingData ? initialDataset : getMapProtoMockDataset()));
  const [mode, setMode] = useState<Mode>("navigation");
  const [mapView, setMapView] = useState({ longitude: 0, latitude: 20, zoom: 2.6, pitch: 0, bearing: 0 });
  const [selectedLabel, setSelectedLabel] = useState("Aucune sélection");
  const [firstRouteCityId, setFirstRouteCityId] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [clickLatencyMs, setClickLatencyMs] = useState(0);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [deckDisabled, setDeckDisabled] = useState(!enableDeckRendering);
  const [deckReady, setDeckReady] = useState(false);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef({ last: 0, frames: 0 });

  useEffect(() => {
    frameRef.current.last = performance.now();
    const loop = () => {
      frameRef.current.frames += 1;
      const now = performance.now();
      if (now - frameRef.current.last >= 1000) {
        setFps(Number(((frameRef.current.frames * 1000) / (now - frameRef.current.last)).toFixed(1)));
        frameRef.current.frames = 0;
        frameRef.current.last = now;
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enableDeckRendering) return;
    const probeDeckWebGL = () => {
      try {
        const canvas = document.createElement("canvas");
        const gl =
          canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false }) ||
          canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
        if (!gl) {
          setDeckError("WebGL indisponible dans cet environnement.");
          setDeckDisabled(true);
          return;
        }
        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (!Number.isFinite(maxTex) || maxTex <= 0) {
          setDeckError("Contexte WebGL invalide (MAX_TEXTURE_SIZE).");
          setDeckDisabled(true);
          return;
        }
        setDeckReady(true);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "échec du probe WebGL";
        setDeckError(msg);
        setDeckDisabled(true);
      }
    };
    probeDeckWebGL();
  }, [enableDeckRendering]);

  useEffect(() => {
    if (!enableDeckRendering) return;
    const isDeckTextureCrash = (msg: string) => msg.toLowerCase().includes("maxtexturedimension2d");
    const onWindowError = (event: ErrorEvent) => {
      const message = String(event.message ?? event.error?.message ?? "");
      if (!isDeckTextureCrash(message)) return;
      setDeckError(message || "Erreur WebGL DeckGL");
      setDeckDisabled(true);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : String((reason as { message?: unknown })?.message ?? "");
      if (!isDeckTextureCrash(message)) return;
      setDeckError(message || "Erreur WebGL DeckGL");
      setDeckDisabled(true);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [enableDeckRendering]);

  const data = useMemo(() => toCarteVData(dataset), [dataset]);
  const layers = useMemo(
    () =>
      buildCarteVLayers({
        cities: data.cities,
        routes: data.routes,
        showCityLabels: mapView.zoom >= 3,
        showRouteLabels: mapView.zoom >= 4.5,
      }),
    [data, mapView.zoom]
  );

  const handleClick = (info: PickingInfo) => {
    const start = performance.now();
    const lon = Number(info.coordinate?.[0] ?? 0);
    const lat = Number(info.coordinate?.[1] ?? 0);
    const object = info.object as { id?: string; name?: string } | null;
    const pickedLayer = info.layer?.id ?? "";
    if (mode === "navigation") {
      if (object?.name) setSelectedLabel(`${pickedLayer.includes("route") ? "Route" : "Ville"}: ${object.name}`);
      else setSelectedLabel("Aucune sélection");
    } else if (mode === "ajout-ville") {
      const name = `Ville ${dataset.cities.length + 1}`;
      const id = `carte5-city-${Date.now()}`;
      setDataset((prev) => ({ ...prev, cities: [...prev.cities, { id, name, lon, lat, iconKey: "city" }] }));
      setSelectedLabel(`Ville créée: ${name}`);
    } else if (mode === "ajout-route") {
      const cityId = object?.id ?? null;
      if (!cityId) {
        setSelectedLabel("Sélectionne une ville pour tracer la route.");
      } else if (!firstRouteCityId) {
        setFirstRouteCityId(cityId);
        setSelectedLabel(`Départ route: ${object?.name ?? cityId}`);
      } else if (firstRouteCityId !== cityId) {
        const cityA = dataset.cities.find((c) => c.id === firstRouteCityId);
        const cityB = dataset.cities.find((c) => c.id === cityId);
        if (cityA && cityB) {
          const name = `Route ${dataset.routes.length + 1}`;
          const id = `carte5-route-${Date.now()}`;
          setDataset((prev) => ({
            ...prev,
            routes: [
              ...prev.routes,
              {
                id,
                name,
                cityAId: cityA.id,
                cityBId: cityB.id,
                points: [
                  { lon: cityA.lon, lat: cityA.lat },
                  { lon: cityB.lon, lat: cityB.lat },
                ],
              },
            ],
          }));
          setSelectedLabel(`Route créée: ${name}`);
        }
        setFirstRouteCityId(null);
      }
    }
    setClickLatencyMs(Number((performance.now() - start).toFixed(2)));
    return true;
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/35 px-3 py-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "navigation" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("navigation")}>Navigation</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-ville" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-ville")}>Ajouter une ville</button>
        <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "ajout-route" ? "bg-amber-400 text-black" : "bg-white/10 text-white/80"}`} onClick={() => setMode("ajout-route")}>Ajouter une route</button>
        <button
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
          onClick={() => {
            setDataset(hasIncomingData ? initialDataset : getMapProtoMockDataset());
            setFirstRouteCityId(null);
            setSelectedLabel("Jeu de test réinitialisé");
          }}
        >
          Réinitialiser test
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
          <span>FPS: {fps}</span>
          <span>Villes: {dataset.cities.length}</span>
          <span>Routes: {dataset.routes.length}</span>
          <span>Latence clic: {clickLatencyMs}ms</span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-black/30 p-2 text-sm text-white/75">
        <p>
          Mode actif: <span className="font-semibold text-amber-200">{mode}</span>
          {firstRouteCityId ? " · Étape route: sélectionne la ville d’arrivée" : ""}
          {!hasIncomingData ? " · Source vide, affichage sur jeu de test" : ""}
        </p>
        <p className="mt-1 text-xs text-white/60">{selectedLabel}</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-2xl border border-amber-500/20 bg-black/45">
          {enableDeckRendering && deckReady && !deckDisabled ? (
            <>
              <img
                src="/images/maps/world-map-equirectangular-v3.png?v=4"
                alt="Fond Carte V"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
              />
              <CarteVDeckBoundary
                onError={(message) => {
                  setDeckError(message);
                  if (message.toLowerCase().includes("maxtexturedimension2d")) {
                    setDeckDisabled(true);
                  }
                }}
              >
                <DeckGL
                  width="100%"
                  height="100%"
                  views={view}
                  viewState={mapView}
                  onViewStateChange={(e) => setMapView(e.viewState as typeof mapView)}
                  controller={{ type: MapController, dragPan: true, scrollZoom: true, doubleClickZoom: true }}
                  layers={layers}
                  onClick={handleClick}
                  style={{ position: "absolute", inset: 0 }}
                />
              </CarteVDeckBoundary>
            </>
          ) : (
            <div className="h-full w-full">
              <CarteIVCanvas initialDataset={dataset} />
            </div>
          )}
          {deckError ? (
            <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-rose-950/70 px-2 py-1 text-xs text-rose-200">
              DeckGL erreur: {deckError}
            </div>
          ) : null}
          {deckDisabled ? (
            <div className="absolute left-2 top-2 z-[6] flex items-center gap-2">
              <div className="rounded bg-black/60 px-2 py-1 text-xs text-white/85">
                DeckGL désactivé, fallback Canvas actif.
              </div>
              <button
                className="rounded bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30"
                onClick={() => {
                  setDeckError(null);
                  setDeckDisabled(false);
                  setDeckReady(false);
                }}
              >
                Réessayer DeckGL
              </button>
            </div>
          ) : null}
          {enableDeckRendering && !deckReady && !deckDisabled ? (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center text-center">
              <div className="rounded bg-black/60 px-3 py-2 text-xs text-white/85">Validation du contexte WebGL...</div>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <h3 className="text-base font-semibold text-white">Carte V — DeckGL minimal</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>Pipeline unique WebGL DeckGL, sans dualité SVG/WebGL historique.</li>
            <li>Couches limitées: routes, villes, labels villes/routes (LOD simple).</li>
            <li>Actions MJ de test locales (ajout ville / ajout route nommée).</li>
            <li>Banc d’essai isolé pour comparer fluidité brute.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

class CarteVDeckBoundary extends React.Component<{ onError: (message: string) => void; children: React.ReactNode }> {
  componentDidCatch(error: unknown) {
    const msg = error instanceof Error ? error.message : "erreur inconnue";
    this.props.onError(msg);
  }

  render() {
    return this.props.children;
  }
}
