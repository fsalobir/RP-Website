"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { geoCentroid, geoMercator } from "d3-geo";
import {
  filterCitiesWithValidCoords,
  geoDistanceKm,
  buildLandGraph,
  generateLandPath,
  generateSinuousPath,
  ROUTE_TIER_LABELS,
  smoothLandPathWithSinuosity,
  resampleRouteWaypoints,
  MAX_RENDER_ROUTE_WAYPOINTS,
  capPolylineVertices,
  MAX_ROUTE_POLYLINE_VERTICES,
} from "@/lib/routes";
import type { LandFeatureCollection, LandGraph, RouteTier } from "@/lib/routes";
import { DEFAULT_MAP_DISPLAY_CONFIG, type MapDisplayConfig } from "@/lib/mapDisplayConfig";
import { resolveEffectiveRenderer } from "@/lib/mapRenderer";
import {
  buildRouteLodVariants,
  pickRouteLodByZoom,
  simplifyPolylinePreservingCurves,
} from "@/lib/routesPrecompute";
import { emitMapMetric } from "@/lib/mapObservability";
import { buildMapRouteDatasetRevision } from "@/lib/mapRouteDatasetRevision";
import { computeRouteLabelCap, pickRouteLabelOrder } from "@/lib/mapLabelBudget";
import { createMapQualityGovernor } from "@/lib/mapQualityGovernor";
import { RouteGeometryWorkerClient } from "@/lib/routeGeometryWorkerClient";
import { RouteBatchSvgLayer } from "@/components/map/RouteBatchSvgLayer";
import {
  isMapInfoPanelsV2Enabled,
  isMapMobileHardModeEnabled,
  isMapQualityGovernorEnabled,
  isMapRouteBatchSvgEnabled,
  isMapRouteWorkerEnabled,
  isMapZeroSvgSpikeEnabled,
  getMapQualityTierFlag,
  isRealmColoringEnabled,
} from "@/lib/featureFlags";
import { EntityInfoPanel } from "@/components/map/EntityInfoPanel";
import { MapScheduler } from "@/lib/mapScheduler";
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  getZoomLevelById,
  getCurrentZoomLevel,
  getRouteSimplificationEpsilonForZoomLevel,
  type MapZoomLevelId,
} from "@/lib/mapZoomLevels";
import { feature, mesh } from "topojson-client";
import { createClient } from "@/lib/supabase/client";
import { computeRealmLabelAnchors } from "@/lib/realmMapLabels";
import type { RouteGeometryWorkerRequest } from "@/lib/routeGeometryWorkerTypes";
import { applyQualityTierToZoomRule, getQualityTierReducedEffects } from "@/lib/mapQualityTier";
import { emitMapInteractionEvent } from "@/lib/mapInteractionEvents";

const ComposableMap = dynamic(() => import("react-simple-maps").then((m) => m.ComposableMap), { ssr: false });
const Geographies = dynamic(() => import("react-simple-maps").then((m) => m.Geographies), { ssr: false });
const Geography = dynamic(() => import("react-simple-maps").then((m) => m.Geography), { ssr: false });
const ZoomableGroup = dynamic(() => import("react-simple-maps").then((m) => m.ZoomableGroup), { ssr: false });
const Marker = dynamic(() => import("react-simple-maps").then((m) => (m as any).Marker), { ssr: false });
const ROUTE_GEOMETRY_CACHE_MAX_ENTRIES = 900;
const ENABLE_FRAME_GAP_METRIC = process.env.NEXT_PUBLIC_MAP_DEBUG_FRAME_GAP === "1";
const ENABLE_ROUTE_GEOMETRY_WORKER = isMapRouteWorkerEnabled();
const ENABLE_ROUTE_BATCH_SVG = isMapRouteBatchSvgEnabled();
const ENABLE_QUALITY_GOVERNOR = isMapQualityGovernorEnabled();
const INTERACTION_FRAME_BUDGET_MS = 16;
const INTERACTION_SETTLE_MS = 140;

type MapFeatureProps = {
  regionId?: string | null;
  name?: string | null;
  admin?: string | null;
  iso_3166_2?: string | null;
  iso_a2?: string | null;
  type?: string | null;
};

export type ProvinceRef = {
  id: string;
  realm_id: string;
  name: string;
  region_id: string;
  capital_city_id?: string | null;
  attrs?: Record<string, any>;
};

export type RealmRef = {
  id: string;
  slug: string;
  name: string;
  capital_city_id?: string | null;
  is_npc: boolean;
  color_hex?: string | null;
  banner_url?: string | null;
  summary?: string | null;
  leader_name?: string | null;
};

export type WorldMapClientProps = {
  mode: "public" | "mj";
  provinces: ProvinceRef[];
  realms: RealmRef[];
  mjCreateOrAssignProvince?: (args: {
    regionId: string;
    realmId: string;
    provinceName: string;
    attrsJson?: string;
  }) => Promise<{ error?: string; provinceId?: string }>;
  mjMergeProvinces?: (args: {
    regionIds: string[];
    realmId: string;
    newName: string;
  }) => Promise<{ error?: string; provinceId?: string }>;
  mjRenameProvince?: (args: { provinceId: string; newName: string }) => Promise<{ error?: string }>;
  mjSplitProvince?: (args: { provinceId: string; regionIdsToDetach: string[] }) => Promise<{ error?: string }>;
  mjUndoProvinceMapOp?: (args: { opId: string }) => Promise<{ error?: string }>;
  mjRecentOps?: Array<{ id: string; op_kind: string; created_at: string; province_id: string | null }>;
  mjCreateMapObject?: (args: {
    regionId: string;
    kind: string;
    name: string;
    lon: number;
    lat: number;
    iconKey?: string | null;
  }) => Promise<{ error?: string; poiId?: string }>;
  mjCreateCity?: (args: {
    regionId: string;
    name: string;
    lon: number;
    lat: number;
    iconKey?: string | null;
    iconScalePct?: number | null;
  }) => Promise<{ error?: string; cityId?: string }>;
  mjCreateCityBuilding?: (args: {
    cityId: string;
    kind: string;
    level?: number;
  }) => Promise<{ error?: string; buildingId?: string }>;
  mjDeleteCity?: (args: { cityId: string }) => Promise<{ error?: string }>;
  mjUpdateCityIconScale?: (args: { cityId: string; iconScalePct: number }) => Promise<{ error?: string }>;
  mjCreateRoute?: (args: {
    cityAId?: string | null;
    cityBId?: string | null;
    pathwayPointAId?: string | null;
    pathwayPointBId?: string | null;
    poiAId?: string | null;
    poiBId?: string | null;
    name: string;
    tier: "local" | "regional" | "national";
  }) => Promise<{ error?: string; routeId?: string }>;
  mjAddPathwayPointToRoute?: (args: {
    routeId: string;
    lat: number;
    lon: number;
    insertPosition: "start" | "middle" | "end";
  }) => Promise<{ error?: string }>;
  mjAddPathwayPointAtPosition?: (args: { routeId: string; lat: number; lon: number }) => Promise<{ error?: string; pathwayPointId?: string }>;
  mjDeletePathwayPoint?: (args: { pathwayPointId: string }) => Promise<{ error?: string }>;
  mjCreateBranchPointOnRoute?: (args: { routeId: string; positionPct: number }) => Promise<{ error?: string; pathwayPointId?: string }>;
  mjDeleteRoute?: (args: { routeId: string }) => Promise<{ error?: string }>;
  maxRouteKm?: number;
  mapObjects?: Array<{
    id: string;
    province_id: string;
    kind: string;
    name: string;
    lon: number | null;
    lat: number | null;
    icon_key: string | null;
    is_visible: boolean;
  }>;
  cities?: Array<{
    id: string;
    province_id: string;
    realm_id: string;
    name: string;
    lon: number;
    lat: number;
    icon_key: string | null;
    is_regional_capital?: boolean | null;
    attrs?: Record<string, any>;
  }>;
  routes?: Array<{
    id: string;
    name: string;
    city_a_id: string | null;
    city_b_id: string | null;
    pathway_point_a_id?: string | null;
    pathway_point_b_id?: string | null;
    poi_a_id?: string | null;
    poi_b_id?: string | null;
    tier: string;
    distance_km: number | null;
    attrs?: Record<string, any>;
  }>;
  routePathwayPoints?: Array<{ id: string; route_id: string; seq: number; lat: number; lon: number }>;
  initialMapDisplayConfig?: Partial<MapDisplayConfig>;
  initialMapDisplayVersion?: number;
  onSaveMapDisplayConfig?: (
    config: MapDisplayConfig,
    expectedVersion?: number
  ) => Promise<{ error?: string; version?: number } | void>;
  /** Si défini (ex. "mj-settings-below"), le panneau réglages MJ est rendu dans ce conteneur (sous la carte). */
  settingsContainerId?: string | null;
};

const borderStroke = {
  stroke: "rgba(72, 52, 30, 0.70)", // encre brune
  strokeWidth: 0.12,
  strokeLinejoin: "round" as const,
};
const inactiveStyle = {
  default: { fill: "rgba(196, 161, 108, 0.10)", outline: "none", ...borderStroke }, // parchemin sombre
  hover: { fill: "rgba(196, 161, 108, 0.16)", outline: "none", ...borderStroke },
  pressed: { fill: "rgba(196, 161, 108, 0.22)", outline: "none", ...borderStroke },
};

function safeRegionLabel(p: MapFeatureProps): string {
  const parts = [p.name, p.admin].filter(Boolean);
  return parts.join(" — ");
}

function getRegionIdFromProps(p: Record<string, unknown>): string | null {
  const direct = p.regionId ?? p.id ?? p.iso_3166_2 ?? p.name;
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  return null;
}

function isForestLikeObject(kind: string | null | undefined, iconKey: string | null | undefined): boolean {
  const k = (kind ?? "").toLowerCase();
  const i = (iconKey ?? "").toLowerCase();
  return (
    k.includes("forest") ||
    k.includes("forêt") ||
    k.includes("wood") ||
    k.includes("tree") ||
    i.includes("forest") ||
    i.includes("tree") ||
    i.includes("wood")
  );
}

function formatIconCatalogLabel(k: string): string {
  if (k.startsWith("http")) {
    try {
      const last = new URL(k).pathname.split("/").filter(Boolean).pop();
      return last ? `Icône (${last})` : "Icône (URL)";
    } catch {
      return "Icône (URL)";
    }
  }
  if (k === "city") return "Ville";
  if (k === "castle") return "Château";
  if (k === "village") return "Village";
  return k;
}

function hexToRgba(hex: string | null | undefined, alpha: number, fallback: string): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToTuple(hex: string | null | undefined, alpha: number, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, alpha];
}

// Note: décor (arbres/vagues) retiré pour performance.

export function WorldMapClient({
  mode,
  provinces,
  realms,
  mjCreateOrAssignProvince,
  mjMergeProvinces,
  mjRenameProvince,
  mjSplitProvince,
  mjUndoProvinceMapOp,
  mjRecentOps,
  mjCreateMapObject,
  mjCreateCity,
  mjCreateCityBuilding,
  mjDeleteCity,
  mjUpdateCityIconScale,
  mjCreateRoute,
  mjAddPathwayPointToRoute,
  mjAddPathwayPointAtPosition,
  mjDeletePathwayPoint,
  mjCreateBranchPointOnRoute,
  mjDeleteRoute,
  maxRouteKm = 500,
  initialMapDisplayConfig,
  initialMapDisplayVersion = 0,
  onSaveMapDisplayConfig,
  settingsContainerId,
  mapObjects,
  cities,
  routes,
  routePathwayPoints,
}: WorldMapClientProps) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [geographyData, setGeographyData] = useState<any | null>(null);
  const [hydroTopo, setHydroTopo] = useState<any | null>(null);
  const [topoReady, setTopoReady] = useState(false);
  const [routeWarmupReady, setRouteWarmupReady] = useState(false);
  const [isMobilePerf, setIsMobilePerf] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [mergeForm, setMergeForm] = useState<{
    open: boolean;
    realmId: string;
    newName: string;
    error: string | null;
    isSubmitting: boolean;
  }>({ open: false, realmId: realms[0]?.id ?? "", newName: "", error: null, isSubmitting: false });

  const [renameForm, setRenameForm] = useState<{
    open: boolean;
    provinceId: string;
    newName: string;
    error: string | null;
    isSubmitting: boolean;
  }>({ open: false, provinceId: "", newName: "", error: null, isSubmitting: false });
  const [opsError, setOpsError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    regionId: string;
    label: string;
    realmId: string;
    provinceName: string;
    attrsText: string;
    centroidLon: number;
    centroidLat: number;
    objectKind: string;
    objectName: string;
    isSubmitting: boolean;
    error: string | null;
    deletableCityId: string | null;
  } | null>(null);

  const [contextMenuView, setContextMenuView] = useState<"choice" | "editProvince">("choice");

  const [placingCity, setPlacingCity] = useState<{
    active: boolean;
    regionId: string;
    name: string;
    iconKey: string | null;
    iconScalePct: number;
    previewLon: number;
    previewLat: number;
    isSubmitting: boolean;
    error: string | null;
  } | null>(null);

  const [placementDebug, setPlacementDebug] = useState<{
    cursor: { x: number; y: number };
    marker: { x: number; y: number };
    delta: { dx: number; dy: number };
  } | null>(null);

  const [cityPanel, setCityPanel] = useState<{
    open: boolean;
    cityId: string;
  }>({ open: false, cityId: "" });
  const [publicInfoPanel, setPublicInfoPanel] = useState<
    | null
    | {
        kind: "ville" | "route";
        title: string;
        lines: string[];
      }
  >(null);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [cityPanelSections, setCityPanelSections] = useState<Record<string, boolean>>({
    infos: true,
    "icon-size": false,
    buildings: false,
    routes: true,
    "nav-point": false,
    "create-route": false,
    delete: false,
  });
  const [pathwayNavState, setPathwayNavState] = useState<{
    routeId: string;
    insertPosition: "start" | "middle" | "end";
    isSubmitting: boolean;
    error: string | null;
  }>({ routeId: "", insertPosition: "end", isSubmitting: false, error: null });
  const [branchPositionPct, setBranchPositionPct] = useState(50);
  const [branchPointSubmitting, setBranchPointSubmitting] = useState(false);
  const [branchPointError, setBranchPointError] = useState<string | null>(null);
  const [routeDeleteSubmitting, setRouteDeleteSubmitting] = useState<string | null>(null);
  const [routeDeleteError, setRouteDeleteError] = useState<string | null>(null);
  const [pathwayAddCityId, setPathwayAddCityId] = useState("");
  const [pathwayAddPosition, setPathwayAddPosition] = useState<"start" | "middle" | "end">("middle");
  const [pathwayAddSubmitting, setPathwayAddSubmitting] = useState(false);
  const [pathwayAddError, setPathwayAddError] = useState<string | null>(null);
  const [pathwayDeleteSubmitting, setPathwayDeleteSubmitting] = useState<string | null>(null);
  /** Mode MJ : prochain clic sur la carte ajoute un point de passage à cette route (position libre, pas une ville). */
  const [placingPathwayPoint, setPlacingPathwayPoint] = useState<{
    routeId: string;
    insertPosition: "start" | "middle" | "end";
    isSubmitting?: boolean;
  } | null>(null);
  const toggleCityPanelSection = (key: string) =>
    setCityPanelSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const [createRouteModalOpen, setCreateRouteModalOpen] = useState(false);

  const [cityCreateModal, setCityCreateModal] = useState<{
    open: boolean;
    regionId: string;
    initialLon: number;
    initialLat: number;
    name: string;
    iconMode: "preset" | "url" | "upload" | "reuse";
    presetIconKey: string;
    urlIconKey: string;
    reuseIconKey: string;
    uploadedIconKey: string | null;
    isUploading: boolean;
    isSubmitting: boolean;
    error: string | null;
  } | null>(null);

  const [cityBuildingsPanel, setCityBuildingsPanel] = useState<{
    cityId: string;
    kind: string;
    level: number;
    isSubmitting: boolean;
    error: string | null;
  } | null>(null);

  const [createRouteState, setCreateRouteState] = useState<{
    fromCityId?: string;
    fromPathwayPointId?: string;
    fromPoiId?: string;
    toCityId?: string;
    toPathwayPointId?: string;
    toPoiId?: string;
    name: string;
    tier: RouteTier;
    isSubmitting: boolean;
    error: string | null;
  } | null>(null);

  /** Mode "cliquer sur la carte" pour choisir départ et/ou arrivée d'une route (ville, entité/POI ou point sur une route). */
  const [selectingEndpoint, setSelectingEndpoint] = useState<
    | { step: "from" }
    | { step: "to"; fromCityId: string }
    | { step: "to"; fromPathwayPointId: string }
    | { step: "to"; fromPoiId: string }
    | null
  >(null);
  const [selectingEndpointError, setSelectingEndpointError] = useState<string | null>(null);
  const [selectingEndpointSubmitting, setSelectingEndpointSubmitting] = useState(false);

  const [cityDeleteError, setCityDeleteError] = useState<string | null>(null);
  const [cityScaleEditPct, setCityScaleEditPct] = useState<number>(100);

  const [mjUi, setMjUi] = useState<MapDisplayConfig & { debugCityHitboxes: boolean }>(() => ({
    ...DEFAULT_MAP_DISPLAY_CONFIG,
    ...initialMapDisplayConfig,
    debugCityHitboxes: false,
  }));

  const [mjSettingsCollapsed, setMjSettingsCollapsed] = useState(false);
  const [settingsSectionOpen, setSettingsSectionOpen] = useState<Record<string, boolean>>(() => ({
    "config-icons": true,
    "config-routes": true,
    "config-icons-size": true,
    "config-icons-zoom": false,
    "config-icons-curve": false,
    "config-icons-fade": false,
    "config-icons-debug": false,
    "config-routes-stroke": false,
    "config-routes-labels": false,
    "config-routes-fade": false,
    "config-routes-progress": false,
    "config-routes-sinuosity": false,
    "config-zoom-rules": true,
  }));
  const [zoomRulesEditorLevel, setZoomRulesEditorLevel] = useState<MapZoomLevelId>("province");
  const toggleSettingsSection = (key: string) =>
    setSettingsSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const [mjSettingsSavedAt, setMjSettingsSavedAt] = useState<number | null>(null);
  const [mjSettingsSaving, setMjSettingsSaving] = useState(false);
  const [mjSettingsError, setMjSettingsError] = useState<string | null>(null);
  const [mjConfigVersion, setMjConfigVersion] = useState<number>(initialMapDisplayVersion);
  // N'utiliser le portail pour les réglages qu'après montage client, pour éviter un mismatch d'hydratation.
  const [usePortalForSettings, setUsePortalForSettings] = useState(false);

  const displayConfig = useMemo(
    () =>
      mode === "mj"
        ? mjUi
        : { ...DEFAULT_MAP_DISPLAY_CONFIG, ...initialMapDisplayConfig },
    [mode, mjUi, initialMapDisplayConfig]
  );
  const [rendererUserKey, setRendererUserKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const key = "map_renderer_user_key_v1";
      const existing = localStorage.getItem(key);
      if (existing) {
        setRendererUserKey(existing);
        return;
      }
      const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, generated);
      setRendererUserKey(generated);
    } catch {
      setRendererUserKey(null);
    }
  }, []);
  const rendererInfo = useMemo(
    () => resolveEffectiveRenderer(mode, { userKey: rendererUserKey }),
    [mode, rendererUserKey]
  );
  const isWebglRenderer = rendererInfo.effective === "webgl";
  const zeroSvgSpikeEnabled = useMemo(() => isMapZeroSvgSpikeEnabled(), []);
  const isZeroSvgSpike = isWebglRenderer && zeroSvgSpikeEnabled;
  const useRouteBatchSvg = ENABLE_ROUTE_BATCH_SVG && mode === "public" && !isWebglRenderer;
  const qualityTier = useMemo(() => getMapQualityTierFlag(), []);
  const mobileHardMode = useMemo(() => isMapMobileHardModeEnabled(), []);
  const reduceHeavyEffects = useMemo(() => getQualityTierReducedEffects(qualityTier), [qualityTier]);
  const enableRealmColoring = useMemo(() => isRealmColoringEnabled(), []);
  const enableMapInfoPanelsV2 = useMemo(() => isMapInfoPanelsV2Enabled(), []);

  const saveMjSettings = useCallback(() => {
    try {
      const prefs = {
        debugCityHitboxes: mjUi.debugCityHitboxes,
        mjSettingsCollapsed,
        settingsSectionOpen,
      };
      localStorage.setItem("mj_ui_prefs_v2", JSON.stringify(prefs));
      setMjSettingsSavedAt(Date.now());
    } catch {
      // ignore
    }
  }, [mjUi.debugCityHitboxes, mjSettingsCollapsed, settingsSectionOpen]);

  const saveMapDisplayConfigToServer = useCallback(async () => {
    if (!onSaveMapDisplayConfig) return;
    setMjSettingsError(null);
    setMjSettingsSaving(true);
    try {
      const { debugCityHitboxes: _, ...config } = mjUi;
      const res = await onSaveMapDisplayConfig(config, mjConfigVersion);
      if (res && "error" in res && res.error) {
        if (res.error.includes("Conflit de version")) {
          // Retry once without expected version to avoid false positives
          // while keeping server as source of truth.
          const retry = await onSaveMapDisplayConfig(config);
          if (retry && "error" in retry && retry.error) {
            setMjSettingsError(retry.error);
            return;
          }
          if (retry && "version" in retry && typeof retry.version === "number" && Number.isFinite(retry.version)) {
            setMjConfigVersion(retry.version);
          }
        } else {
          setMjSettingsError(res.error);
          return;
        }
      }
      if (res && "version" in res && typeof res.version === "number" && Number.isFinite(res.version)) {
        setMjConfigVersion(res.version);
      } else {
        setMjConfigVersion((v) => v + 1);
      }
      setMjSettingsSavedAt(Date.now());
      router.refresh();
    } finally {
      setMjSettingsSaving(false);
    }
  }, [onSaveMapDisplayConfig, mjUi, mjConfigVersion, router]);

  useEffect(() => {
    setMjConfigVersion(initialMapDisplayVersion);
  }, [initialMapDisplayVersion]);

  useEffect(() => {
    if (mjSettingsSavedAt == null) return;
    const t = setTimeout(() => setMjSettingsSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [mjSettingsSavedAt]);

  useEffect(() => {
    if (mode === "mj" && settingsContainerId) setUsePortalForSettings(true);
  }, [mode, settingsContainerId]);

  useEffect(() => {
    const t0 = performance.now();
    return () => {
      if (mode === "mj") emitMapMetric("map_mj_mount_ms", performance.now() - t0, { mode });
    };
  }, [mode]);

  // Zoom/pan contrôlés : on ajoute un lissage (inertie) sur la molette.
  const MIN_ZOOM = MAP_MIN_ZOOM;
  const MAX_ZOOM = MAP_MAX_ZOOM;
  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: [0, 22],
    zoom: MIN_ZOOM,
  });
  const currentZoomLevel = useMemo<MapZoomLevelId>(() => getCurrentZoomLevel(mapView.zoom), [mapView.zoom]);
  const [renderZoomLevel, setRenderZoomLevel] = useState<MapZoomLevelId>("monde");
  const currentZoomLevelLabel = useMemo(() => {
    if (renderZoomLevel === "province") return "Province";
    if (renderZoomLevel === "nation") return "Nation";
    if (renderZoomLevel === "continent") return "Continent";
    return "Monde";
  }, [renderZoomLevel]);
  const activeZoomRules = useMemo(() => {
    const base = displayConfig.zoomLevelRules[renderZoomLevel];
    return applyQualityTierToZoomRule(base, {
      tier: qualityTier,
      isMobilePerf: isMobilePerf && mobileHardMode,
    });
  }, [displayConfig.zoomLevelRules, renderZoomLevel, qualityTier, isMobilePerf, mobileHardMode]);
  const zoomThresholdLabels = useMemo(
    () =>
      (["monde", "continent", "nation", "province"] as const).map((id) => ({
        id,
        label: getZoomLevelById(id).label,
        zoom: getZoomLevelById(id).zoom,
      })),
    []
  );
  const routeLodEpsilon = useMemo(() => {
    return getRouteSimplificationEpsilonForZoomLevel(renderZoomLevel);
  }, [renderZoomLevel]);
  const routeLodZoomRef = useMemo(() => {
    return renderZoomLevel === "province" ? 12 : renderZoomLevel === "nation" ? 6 : renderZoomLevel === "continent" ? 2.4 : 1.05;
  }, [renderZoomLevel]);
  const viewRef = useRef(mapView);
  useEffect(() => {
    viewRef.current = mapView;
  }, [mapView]);

  // Charger uniquement les préférences MJ locales non-fonctionnelles.
  // Les paramètres d'affichage sont autoritaires côté serveur.
  useEffect(() => {
    if (mode !== "mj") return;
    try {
      const raw = localStorage.getItem("mj_ui_prefs_v2");
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      setMjUi((p) => ({ ...p, debugCityHitboxes: Boolean(parsed?.debugCityHitboxes ?? p.debugCityHitboxes) }));
      setMjSettingsCollapsed(Boolean(parsed?.mjSettingsCollapsed ?? false));
      if (parsed?.settingsSectionOpen && typeof parsed.settingsSectionOpen === "object") {
        setSettingsSectionOpen((prev) => ({ ...prev, ...parsed.settingsSectionOpen }));
      }
    } catch {
      // ignore
    }
  }, [mode, initialMapDisplayConfig]);

  // Persistance uniquement au clic sur « Enregistrer » (plus d’auto-save à chaque changement).

  const zoomTargetRef = useRef<number>(MIN_ZOOM);
  const zoomRafRef = useRef<number | null>(null);
  const wheelAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const animLastCommitRef = useRef<number>(0);
  const moveRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const settleStartedAtRef = useRef<number>(0);
  const lastWheelTsRef = useRef<number>(0);
  const isInteractionLite = isInteracting || isSettling || !routeWarmupReady || (isMobilePerf && mobileHardMode);
  useEffect(() => {
    if (isInteracting || isSettling) return;
    setRenderZoomLevel(currentZoomLevel);
  }, [currentZoomLevel, isInteracting, isSettling]);

  function clampZoom(z: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }

  function stopZoomAnimation() {
    if (zoomRafRef.current != null) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = null;
    }
    wheelAnchorRef.current = null;
    // Empêche une “dérive” restante : la cible devient le zoom courant.
    zoomTargetRef.current = viewRef.current.zoom;
  }

  function beginInteraction() {
    if (settleTimerRef.current != null) {
      globalThis.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setIsSettling(false);
    setIsInteracting(true);
    emitMapInteractionEvent({ type: "dragStart", entityKind: "map", entityId: "map-root", mode });
  }

  function endInteractionWithSettle() {
    setIsInteracting(false);
    setIsSettling(true);
    emitMapInteractionEvent({ type: "dragEnd", entityKind: "map", entityId: "map-root", mode });
    settleStartedAtRef.current = performance.now();
    if (settleTimerRef.current != null) globalThis.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = globalThis.setTimeout(() => {
      settleTimerRef.current = null;
      const burst = performance.now() - settleStartedAtRef.current;
      emitMapMetric("map_end_zoom_burst_ms", burst, {
        mode,
        zoomLevel: renderZoomLevel,
      });
      setIsSettling(false);
    }, INTERACTION_SETTLE_MS);
  }

  function commitView(next: { center: [number, number]; zoom: number }) {
    const cur = viewRef.current;
    const dz = Math.abs((next.zoom ?? 0) - (cur.zoom ?? 0));
    const dx = Math.abs((next.center?.[0] ?? 0) - (cur.center?.[0] ?? 0));
    const dy = Math.abs((next.center?.[1] ?? 0) - (cur.center?.[1] ?? 0));
    // Évite les boucles "controlled component" quand ZoomableGroup renvoie des callbacks
    // en réaction à nos propres updates.
    if (dz < 1e-6 && dx < 1e-6 && dy < 1e-6) return;

    viewRef.current = next;
    setMapView(next);
  }

  function startZoomAnimation() {
    if (zoomRafRef.current != null) return;
    beginInteraction();
    const step = () => {
      const now = performance.now();
      const { center, zoom } = viewRef.current;
      const target = zoomTargetRef.current;
      const diff = target - zoom;
      // Inertie : on converge vite, et on "termine" rapidement après la dernière impulsion.
      const sinceWheel = now - (lastWheelTsRef.current || 0);
      const ease = sinceWheel > 200 ? 0.26 : 0.18;
      const nextZoom = Math.abs(diff) < 1e-4 ? target : zoom + diff * ease;

      // Optionnel : si on a un ancrage de molette, on recentre légèrement vers la souris
      // (effet "zoom vers le pointeur" sans calcul géographique lourd).
      const a = wheelAnchorRef.current;
      let nextCenter: [number, number] = center;
      if (a && Math.abs(diff) > 1e-3) {
        // Ajustement heuristique plus marqué : on “tire” le centre vers le pointeur.
        // Note: ce n'est pas une conversion projection->lon/lat exacte, mais l'effet UX est net.
        const k = 1.35; // degrés (réduit automatiquement avec le zoom)
        nextCenter = [
          center[0] + (a.x - 0.5) * k / Math.max(1, nextZoom),
          center[1] - (a.y - 0.5) * k / Math.max(1, nextZoom),
        ];
      }

      // Throttle de commits (≈30fps) pour éviter de rerender trop souvent.
      if ((nextZoom !== zoom || nextCenter !== center) && now - animLastCommitRef.current >= INTERACTION_FRAME_BUDGET_MS) {
        animLastCommitRef.current = now;
        commitView({ center: nextCenter, zoom: nextZoom });
      }

      // Finir rapidement : si aucune molette récente, on stop sans snap (évite les sauts).
      if (sinceWheel > 520 || Math.abs(target - nextZoom) < 1e-4) {
        zoomRafRef.current = null;
        wheelAnchorRef.current = null;
        endInteractionWithSettle();
        return;
      }
      zoomRafRef.current = requestAnimationFrame(step);
    };
    zoomRafRef.current = requestAnimationFrame(step);
  }

  // Throttle tooltip : éviter un re-render par pixel de souris.
  const tooltipRafRef = useRef<number | null>(null);
  const tooltipPendingRef = useRef<{ x: number; y: number; content: string } | null>(null);
  const queueTooltip = useCallback((next: { x: number; y: number; content: string } | null) => {
    tooltipPendingRef.current = next;
    if (tooltipRafRef.current != null) return;
    tooltipRafRef.current = requestAnimationFrame(() => {
      tooltipRafRef.current = null;
      setTooltip(tooltipPendingRef.current);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/geo/admin1.topo.json")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setGeographyData(j);
      })
      .catch(() => {
        if (alive) setGeographyData(null);
      })
      .finally(() => {
        if (alive) setTopoReady(true);
      });

    fetch("/geo/hydro.topo.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setHydroTopo(j);
      })
      .catch(() => {
        if (alive) setHydroTopo(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const reduceMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setIsMobilePerf(media.matches);
    const applyReducedMotion = () => setPrefersReducedMotion(reduceMotionMedia.matches);
    apply();
    applyReducedMotion();
    media.addEventListener("change", apply);
    reduceMotionMedia.addEventListener("change", applyReducedMotion);
    return () => {
      media.removeEventListener("change", apply);
      reduceMotionMedia.removeEventListener("change", applyReducedMotion);
    };
  }, []);

  const qualityGovernorRef = useRef(createMapQualityGovernor());
  const [qualityTick, setQualityTick] = useState(0);
  useEffect(() => {
    if (!ENABLE_QUALITY_GOVERNOR) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      qualityGovernorRef.current.onFrameGapMs(now - last);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const iv = globalThis.setInterval(() => setQualityTick((t) => t + 1), 750);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!topoReady) return;
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setRouteWarmupReady(true);
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(markReady, { timeout: 1200 });
      return () => {
        cancelled = true;
        (window as any).cancelIdleCallback?.(id);
      };
    }
    const t = globalThis.setTimeout(markReady, 450);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(t);
    };
  }, [topoReady]);

  useEffect(
    () => () => {
      if (settleTimerRef.current != null) globalThis.clearTimeout(settleTimerRef.current);
    },
    []
  );


  // Listener molette non-passif : plus fiable/smooth que l'event React sur un SVG.
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Capturer avant le SVG (d3-zoom) pour assurer l'inertie.
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      const strength = 0.0014;
      const factor = Math.exp(-delta * strength);
      const current = zoomTargetRef.current ?? viewRef.current.zoom;
      const next = clampZoom(current * factor);
      zoomTargetRef.current = next;
      const wheelNow = performance.now();
      const prevWheel = lastWheelTsRef.current;
      if (prevWheel > 0) {
        emitMapMetric("map_wheel_step_ms", wheelNow - prevWheel, { mode });
      }
      lastWheelTsRef.current = wheelNow;

      const rect = el.getBoundingClientRect();
      const x = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
      const y = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
      wheelAnchorRef.current = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };

      startZoomAnimation();
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel as any, { capture: true } as any);
  }, []);

  // Placement libre d'une ville : suit le curseur + clic gauche pour valider + Échap pour annuler.
  useEffect(() => {
    if (!placingCity?.active) return;
    const el = mapContainerRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const p = previewLonLatFromPointer(e.clientX, e.clientY);
      if (!p) return;
      setPlacingCity((prev) => (prev ? { ...prev, previewLon: p.lon, previewLat: p.lat } : prev));

      // Debug visuel : curseur vs position projetée de l'icône preview.
      const svgEl = el.querySelector("svg") as SVGSVGElement | null;
      if (!svgEl) return;
      const zoomGroup =
        (svgEl.querySelector("g.rsm-zoomable-group") as SVGGElement | null) ??
        (svgEl.querySelector("g[class*='zoomable']") as SVGGElement | null) ??
        (svgEl.querySelector("g") as SVGGElement | null);
      if (!zoomGroup) return;
      const ctm = zoomGroup.getScreenCTM();
      if (!ctm) return;

      const vb = svgEl.viewBox?.baseVal;
      const w = vb?.width || 800;
      const h = vb?.height || 450;
      const baseProj = geoMercator().scale(170).translate([w / 2, h / 2]);
      const projXY = baseProj([p.lon, p.lat] as [number, number]);
      if (!projXY) return;

      const screen = svgEl.createSVGPoint();
      screen.x = projXY[0];
      screen.y = projXY[1];
      const client = screen.matrixTransform(ctm);
      const markerClientX = client.x;
      const markerClientY = client.y;
      setPlacementDebug({
        cursor: { x: e.clientX, y: e.clientY },
        marker: { x: markerClientX, y: markerClientY },
        delta: { dx: markerClientX - e.clientX, dy: markerClientY - e.clientY },
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlacingCity(null);
      setPlacementDebug(null);
    };
    const onClick = async (e: MouseEvent) => {
      if (e.button !== 0) return;
      const action = mjCreateCity;
      if (!action) {
        setPlacingCity((prev) => (prev ? { ...prev, error: "Action MJ non disponible." } : prev));
        return;
      }
      setPlacingCity((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));
      const res = await action({
        regionId: placingCity.regionId,
        name: placingCity.name,
        iconKey: placingCity.iconKey,
        iconScalePct: placingCity.iconScalePct,
        lon: placingCity.previewLon,
        lat: placingCity.previewLat,
      });
      if (res.error) {
        setPlacingCity((prev) =>
          prev ? { ...prev, isSubmitting: false, error: res.error ?? "Erreur inconnue." } : prev,
        );
        return;
      }
      setPlacingCity(null);
      setPlacementDebug(null);
      router.refresh();
    };

    el.addEventListener("mousemove", onMove, { capture: true });
    window.addEventListener("keydown", onKey);
    el.addEventListener("click", onClick, { capture: true });
    return () => {
      el.removeEventListener("mousemove", onMove as any, { capture: true } as any);
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("click", onClick as any, { capture: true } as any);
    };
  }, [mjCreateCity, placingCity, router]);

  // Pop-in : "Créer Ville" -> Échap pour fermer, et on évite les fermetures accidentelles.
  useEffect(() => {
    if (!cityCreateModal?.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCityCreateModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cityCreateModal?.open]);

  // Placement d'un point de passage par clic sur la carte (MJ) : un clic = ajout du waypoint aux coords du clic.
  useEffect(() => {
    if (!placingPathwayPoint?.routeId || !mjAddPathwayPointToRoute) return;
    const el = mapContainerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlacingPathwayPoint(null);
      setPathwayAddError(null);
    };
    const onClick = async (e: MouseEvent) => {
      if (e.button !== 0 || placingPathwayPoint.isSubmitting) return;
      const p = previewLonLatFromPointer(e.clientX, e.clientY);
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;

      setPlacingPathwayPoint((prev) => prev ? { ...prev, isSubmitting: true } : prev);
      setPathwayAddError(null);
      try {
        const res = await mjAddPathwayPointToRoute({
          routeId: placingPathwayPoint.routeId,
          lat: p.lat,
          lon: p.lon,
          insertPosition: placingPathwayPoint.insertPosition,
        });
        if (res.error) {
          setPathwayAddError(res.error);
          setPlacingPathwayPoint((prev) => prev ? { ...prev, isSubmitting: false } : prev);
          return;
        }
        setPlacingPathwayPoint(null);
        router.refresh();
      } catch {
        setPathwayAddError("Erreur lors de l'ajout du point.");
        setPlacingPathwayPoint((prev) => prev ? { ...prev, isSubmitting: false } : prev);
      }
    };

    window.addEventListener("keydown", onKey);
    el.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("click", onClick as any, { capture: true } as any);
    };
  }, [placingPathwayPoint, mjAddPathwayPointToRoute, router]);

  // Sélection départ/arrivée par clic sur la carte : ville ou point sur une route.
  useEffect(() => {
    if (!selectingEndpoint || selectingEndpointSubmitting) return;
    const el = mapContainerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelectingEndpoint(null);
      setSelectingEndpointError(null);
    };

    const onClick = async (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const cityEl = target.closest?.("[data-city-id]");
      const routeEl = target.closest?.("[data-route-id]");
      const poiEl = target.closest?.("[data-poi-id]");
      const cityId = cityEl?.getAttribute?.("data-city-id") ?? null;
      const routeId = routeEl?.getAttribute?.("data-route-id") ?? null;
      const poiId = poiEl?.getAttribute?.("data-poi-id") ?? null;

      if (!cityId && !routeId && !poiId) return;

      e.preventDefault();
      e.stopPropagation();
      setSelectingEndpointError(null);

      const fromCityId = "fromCityId" in selectingEndpoint ? selectingEndpoint.fromCityId : undefined;
      const fromPathwayPointId = "fromPathwayPointId" in selectingEndpoint ? selectingEndpoint.fromPathwayPointId : undefined;
      const fromPoiId = "fromPoiId" in selectingEndpoint ? selectingEndpoint.fromPoiId : undefined;

      if (cityId) {
        if (selectingEndpoint.step === "from") {
          setSelectingEndpoint({ step: "to", fromCityId: cityId });
          return;
        }
        setSelectingEndpoint(null);
        setCreateRouteState({
          fromCityId,
          fromPathwayPointId,
          fromPoiId,
          toCityId: cityId,
          toPathwayPointId: undefined,
          toPoiId: undefined,
          name: "",
          tier: "regional",
          isSubmitting: false,
          error: null,
        });
        setCreateRouteModalOpen(true);
        return;
      }

      if (poiId) {
        if (selectingEndpoint.step === "from") {
          setSelectingEndpoint({ step: "to", fromPoiId: poiId });
          return;
        }
        setSelectingEndpoint(null);
        setCreateRouteState({
          fromCityId,
          fromPathwayPointId,
          fromPoiId,
          toCityId: undefined,
          toPathwayPointId: undefined,
          toPoiId: poiId,
          name: "",
          tier: "regional",
          isSubmitting: false,
          error: null,
        });
        setCreateRouteModalOpen(true);
        return;
      }

      if (routeId && mjAddPathwayPointAtPosition) {
        const p = previewLonLatFromPointer(e.clientX, e.clientY);
        if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
          setSelectingEndpointError("Impossible de lire les coordonnées du clic.");
          return;
        }
        setSelectingEndpointSubmitting(true);
        try {
          const res = await mjAddPathwayPointAtPosition({ routeId, lat: p.lat, lon: p.lon });
          if (res.error) {
            setSelectingEndpointError(res.error);
            setSelectingEndpointSubmitting(false);
            return;
          }
          const pathwayPointId = res.pathwayPointId!;
          if (selectingEndpoint.step === "from") {
            setSelectingEndpoint({ step: "to", fromPathwayPointId: pathwayPointId });
            router.refresh();
            setSelectingEndpointSubmitting(false);
            return;
          }
          setSelectingEndpoint(null);
          setSelectingEndpointSubmitting(false);
          setCreateRouteState({
            fromCityId,
            fromPathwayPointId,
            fromPoiId,
            toCityId: undefined,
            toPathwayPointId: pathwayPointId,
            toPoiId: undefined,
            name: "",
            tier: "regional",
            isSubmitting: false,
            error: null,
          });
          setCreateRouteModalOpen(true);
          router.refresh();
        } catch {
          setSelectingEndpointError("Erreur lors de l'ajout du point.");
          setSelectingEndpointSubmitting(false);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    el.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("click", onClick as any, { capture: true } as any);
    };
  }, [selectingEndpoint, selectingEndpointSubmitting, mjAddPathwayPointAtPosition, router]);

  const hydro = useMemo(() => {
    try {
      if (!hydroTopo?.objects) return null;
      const lakesObj = hydroTopo.objects.lakes;
      const riversObj = hydroTopo.objects.rivers;
      if (!lakesObj || !riversObj) return null;
      const lakes = feature(hydroTopo, lakesObj) as any;
      const rivers = feature(hydroTopo, riversObj) as any;
      return { lakes, rivers };
    } catch {
      return null;
    }
  }, [hydroTopo]);

  // Fade-in/out des couches hydro selon le zoom.
  function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }
  const lakesOpacity = useMemo(() => clamp01((mapView.zoom - 1.6) / 0.6), [mapView.zoom]);
  const riversOpacity = useMemo(() => clamp01((mapView.zoom - 2.6) / 0.7), [mapView.zoom]);
  // Zoom normalisé 0..100 basé sur des ancres réelles configurables.
  const zoomPct = useMemo(() => {
    const z0 = Math.max(0.0001, Math.min(displayConfig.zoomRefWorld, displayConfig.zoomRefProvince - 0.0001));
    const z1 = Math.max(z0 + 0.0001, Math.max(displayConfig.zoomRefWorld, displayConfig.zoomRefProvince));
    return clamp01((mapView.zoom - z0) / (z1 - z0)) * 100;
  }, [mapView.zoom, displayConfig.zoomRefWorld, displayConfig.zoomRefProvince]);

  const citySizeFactor = useMemo(() => {
    // Proportionnel du zoom normalisé, avec minimum configurable et courbe configurable.
    const minF = clamp01((displayConfig.sizeAtWorldPct || 0) / 100);
    const exp = Math.max(0.2, Math.min(3, displayConfig.sizeCurveExp || 1));
    const t = Math.pow(clamp01(zoomPct / 100), exp);
    return (minF + (1 - minF) * t) * activeZoomRules.scale.cities;
  }, [zoomPct, displayConfig.sizeAtWorldPct, displayConfig.sizeCurveExp, activeZoomRules.scale.cities]);

  const citiesRenderOpacity = useMemo(() => {
    // Opaque tant qu'on est au-dessus du seuil, puis fade-out.
    const start = Math.max(0, Math.min(100, displayConfig.fadeStartPct));
    const end = Math.max(0, Math.min(start, displayConfig.fadeEndPct));
    if (zoomPct >= start) return 1;
    if (start === end) return zoomPct >= start ? 1 : 0;
    return clamp01((zoomPct - end) / (start - end));
  }, [zoomPct, displayConfig.fadeStartPct, displayConfig.fadeEndPct]);

  const routeRenderOpacity = useMemo(() => {
    const start = Math.max(0, Math.min(100, displayConfig.routeFadeStartPct ?? 33));
    const end = Math.max(0, Math.min(start, displayConfig.routeFadeEndPct ?? 20));
    if (zoomPct >= start) return 1;
    if (start === end) return zoomPct >= start ? 1 : 0;
    return clamp01((zoomPct - end) / (start - end));
  }, [zoomPct, displayConfig.routeFadeStartPct, displayConfig.routeFadeEndPct]);

  const routeSizeFactor = useMemo(() => {
    const minF = clamp01((displayConfig.routeSizeAtWorldPct ?? 10) / 100);
    const exp = Math.max(0.2, Math.min(3, displayConfig.routeSizeCurveExp ?? 1));
    const t = Math.pow(clamp01(zoomPct / 100), exp);
    return (minF + (1 - minF) * t) * activeZoomRules.scale.routes;
  }, [zoomPct, displayConfig.routeSizeAtWorldPct, displayConfig.routeSizeCurveExp, activeZoomRules.scale.routes]);
  const routeTierStyle = useMemo(() => {
    const clampPx = (n: number | undefined, def: number) =>
      Number.isFinite(n) ? Math.max(0.01, Math.min(0.3, n as number)) : def;
    return {
      local: {
        strokeWidth: clampPx(displayConfig.routeStrokeLocalPx, 0.05),
        stroke: "rgba(140, 100, 55, 0.9)",
      },
      regional: {
        strokeWidth: clampPx(displayConfig.routeStrokeRegionalPx, 0.1),
        stroke: "rgba(160, 115, 60, 0.95)",
      },
      national: {
        strokeWidth: clampPx(displayConfig.routeStrokeNationalPx, 0.15),
        stroke: "rgba(190, 140, 75, 1)",
      },
    } as const;
  }, [displayConfig.routeStrokeLocalPx, displayConfig.routeStrokeRegionalPx, displayConfig.routeStrokeNationalPx]);

  const citiesOpacity = activeZoomRules.visibility.cities ? citiesRenderOpacity : 0;
  const cityMarkerPx = displayConfig.cityIconMaxPx * citySizeFactor;
  // Calibrage: icône dans une boîte 10x10 (unités SVG).
  // Marker est dans l’espace carte => taille écran ~= 10 * scale * zoom
  const cityMarkerScale = cityMarkerPx / (10 * Math.max(0.0001, mapView.zoom));
  const cityScaleFactorFor = useCallback(
    (city: { attrs?: Record<string, any> | null }) => {
      const raw = Number((city.attrs as any)?.icon_scale_pct ?? 100);
      if (!Number.isFinite(raw)) return 1;
      return Math.max(0.1, Math.min(4, raw / 100));
    },
    [],
  );
  const showHydro = activeZoomRules.visibility.lakes && lakesOpacity > 0.001;
  const showRivers = activeZoomRules.visibility.rivers && riversOpacity > 0.001;

  // (debug UI zoom badge mis à jour via ref, pas via state pour les perfs)
  const RIVERS_LOCK_ZOOM = 6;
  const riversLocked = mapView.zoom >= RIVERS_LOCK_ZOOM;
  const lakesLocked = riversLocked;

  // Stabiliser les props/styles (éviter de recréer des objets à chaque frame de zoom).
  const lakesStyle = useMemo(
    () => ({
      default: {
        fill: "rgba(43, 111, 152, 0.30)",
        stroke: "rgba(10, 40, 70, 0.25)",
        strokeWidth: 0.15,
        outline: "none",
      },
      hover: { fill: "rgba(43, 111, 152, 0.30)", outline: "none" },
      pressed: { fill: "rgba(43, 111, 152, 0.30)", outline: "none" },
    }),
    [],
  );
  const riversStyle = useMemo(
    () => ({
      default: {
        fill: "none",
        stroke: "rgba(15, 60, 100, 0.30)",
        strokeWidth: 0.12,
        outline: "none",
      },
      hover: { fill: "none", outline: "none" },
      pressed: { fill: "none", outline: "none" },
    }),
    [],
  );

  const provinceByRegionId = useMemo(() => {
    const m = new Map<string, ProvinceRef>();
    for (const p of provinces) {
      if (p.region_id) m.set(p.region_id, p);
    }
    return m;
  }, [provinces]);

  const realmById = useMemo(() => new Map(realms.map((r) => [r.id, r])), [realms]);
  const realmLegendItems = useMemo(
    () =>
      realms.map((realm) => ({
        id: realm.id,
        name: realm.name,
        color: hexToRgba(realm.color_hex ?? null, 0.8, "rgba(196, 161, 108, 0.8)"),
      })),
    [realms]
  );
  const regionRealmIdByRegionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [regionId, province] of provinceByRegionId.entries()) {
      if (province?.realm_id) m.set(regionId, province.realm_id);
    }
    return m;
  }, [provinceByRegionId]);
  const realmBoundaryGeoJson = useMemo(() => {
    const topo = geographyData;
    const admin1 = topo?.objects?.admin1;
    if (!topo || !admin1) return null;
    try {
      const geometry = mesh(topo, admin1, (a: any, b: any) => {
        if (!a) return false;
        const aProps = (a?.properties ?? {}) as Record<string, unknown>;
        const bProps = (b?.properties ?? {}) as Record<string, unknown>;
        const aRegionId = getRegionIdFromProps(aProps);
        const bRegionId = getRegionIdFromProps(bProps);
        const aRealmId = aRegionId ? regionRealmIdByRegionId.get(aRegionId) ?? null : null;
        if (!b) return true;
        const bRealmId = bRegionId ? regionRealmIdByRegionId.get(bRegionId) ?? null : null;
        if (!aRealmId || !bRealmId) return true;
        return aRealmId !== bRealmId;
      }) as any;
      return {
        type: "FeatureCollection",
        features: geometry
          ? [
              {
                type: "Feature",
                properties: {},
                geometry,
              },
            ]
          : [],
      } as any;
    } catch {
      return null;
    }
  }, [geographyData, regionRealmIdByRegionId]);

  // IMPORTANT perf: rendre les géographies une seule fois (hors zoom), sinon chaque tick de zoom
  // remappe des centaines/milliers de paths.
  const renderedLakes = useMemo(() => {
    if (!hydro?.lakes) return null;
    return (
      <Geographies geography={hydro.lakes}>
        {({ geographies = [] }) =>
          geographies.map((geo: any, i: number) => (
            <GeographyAny key={geo?.rsmKey ?? `lake-${i}`} geography={geo} style={lakesStyle} />
          ))
        }
      </Geographies>
    );
  }, [hydro?.lakes, lakesStyle]);

  const renderedRivers = useMemo(() => {
    if (!hydro?.rivers) return null;
    return (
      <Geographies geography={hydro.rivers}>
        {({ geographies = [] }) =>
          geographies.map((geo: any, i: number) => (
            <GeographyAny key={geo?.rsmKey ?? `river-${i}`} geography={geo} style={riversStyle} />
          ))
        }
      </Geographies>
    );
  }, [hydro?.rivers, riversStyle]);


  const renderedRegions = useMemo(() => {
    return (
      <Geographies geography={geographyData ?? { type: "FeatureCollection", features: [] }}>
        {({ geographies = [] }) =>
          geographies
            .filter((geo: any) => {
              const props = (geo?.properties ?? {}) as MapFeatureProps;
              return props.iso_a2 !== "AQ";
            })
            .map((geo: any, i: number) => {
              const props = (geo?.properties ?? {}) as MapFeatureProps;
              const regionId = props.regionId ?? null;
              const label = safeRegionLabel(props) || `Région ${i + 1}`;
              const key = geo?.rsmKey ?? `${regionId ?? "region"}-${i}`;

              const assigned = regionId ? provinceByRegionId.get(regionId) ?? null : null;
              const isSelected = regionId != null && selectedRegionIds.includes(regionId);

              const realm = assigned ? realmById.get(assigned.realm_id) ?? null : null;
              const fill = assigned
                ? enableRealmColoring
                  ? hexToRgba(realm?.color_hex ?? null, 0.22, "rgba(34, 197, 94, 0.20)")
                  : "rgba(34, 197, 94, 0.20)"
                : "rgba(196, 161, 108, 0.18)";
              const hoverFill = assigned
                ? enableRealmColoring
                  ? hexToRgba(realm?.color_hex ?? null, 0.32, "rgba(34, 197, 94, 0.30)")
                  : "rgba(34, 197, 94, 0.30)"
                : "rgba(196, 161, 108, 0.26)";
              const selectedFill = assigned
                ? enableRealmColoring
                  ? hexToRgba(realm?.color_hex ?? null, 0.42, "rgba(34, 197, 94, 0.40)")
                  : "rgba(34, 197, 94, 0.40)"
                : "rgba(196, 161, 108, 0.34)";

              const style = {
                default: { fill: isSelected ? selectedFill : fill, outline: "none", stroke: "transparent", strokeWidth: 0 },
                hover: { fill: hoverFill, outline: "none", stroke: "transparent", strokeWidth: 0 },
                pressed: { fill: hoverFill, outline: "none", stroke: "transparent", strokeWidth: 0 },
              };

              return (
                <g key={key}>
                  <GeographyAny
                    geography={geo}
                    style={regionId ? style : inactiveStyle}
                    onClick={(e: React.MouseEvent<SVGPathElement>) => {
                      if (!regionId) return;
                      if (mode === "mj" && e.shiftKey) {
                        setSelectedRegionIds((prev) => {
                          const has = prev.includes(regionId);
                          if (has) return prev.filter((x) => x !== regionId);
                          return [...prev, regionId];
                        });
                        return;
                      }
                      setSelectedRegionIds((prev) => (prev.length === 1 && prev[0] === regionId ? [] : [regionId]));
                    }}
                    onContextMenu={(e: React.MouseEvent<SVGPathElement>) => {
                      if (mode !== "mj") return;
                      if (!regionId) return;
                      e.preventDefault();
                      setContextMenuView("choice");
                      const defaultRealmId = realms[0]?.id ?? "";
                      const [clon, clat] = geoCentroid(geo) as [number, number];
                      const assignedProvince = provinceByRegionId.get(regionId) ?? null;
                      const suggestedName = assignedProvince?.name ?? label.split(" — ")[0] ?? regionId;
                      const attrsText = JSON.stringify(assignedProvince?.attrs ?? {}, null, 2);
                      const provinceIdForCities = assignedProvince?.id ?? null;
                      const allCities = cities ?? [];
                      const matchCity = provinceIdForCities ? allCities.find((cc) => cc.province_id === provinceIdForCities) : null;
                      const deletableCityId = matchCity?.id ?? null;
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        regionId,
                        label,
                        realmId: defaultRealmId,
                        provinceName: suggestedName,
                        attrsText,
                        centroidLon: clon,
                        centroidLat: clat,
                        objectKind: "city",
                        objectName: suggestedName,
                        isSubmitting: false,
                        error: null,
                        deletableCityId,
                      });
                    }}
                    onMouseMove={(e: React.MouseEvent<SVGPathElement>) => {
                      if (!regionId) return;
                      const realmName = assigned ? (realmById.get(assigned.realm_id)?.name ?? "") : "";
                      const content = assigned
                        ? `${assigned.name}${realmName ? ` - ${realmName}` : ""}`
                        : `${label}\nAucune province assignée`;
                      queueTooltip({ x: e.clientX, y: e.clientY, content });
                    }}
                    onMouseLeave={() => queueTooltip(null)}
                    title={label}
                  />
                </g>
              );
            })
        }
      </Geographies>
    );
  }, [
    geographyData,
    mode,
    provinceByRegionId,
    queueTooltip,
    realmById,
    realms,
    selectedRegionIds,
    enableRealmColoring,
  ]);
  const renderedRealmBoundaries = useMemo(() => {
    if (!activeZoomRules.visibility.regionBorders) return null;
    if (!realmBoundaryGeoJson) return null;
    return (
      <Geographies geography={realmBoundaryGeoJson}>
        {({ geographies = [] }) =>
          geographies.map((geo: any, i: number) => (
            <GeographyAny
              key={geo?.rsmKey ?? `realm-boundary-${i}`}
              geography={geo}
              style={{
                default: { fill: "none", outline: "none", ...borderStroke },
                hover: { fill: "none", outline: "none", ...borderStroke },
                pressed: { fill: "none", outline: "none", ...borderStroke },
              }}
            />
          ))
        }
      </Geographies>
    );
  }, [realmBoundaryGeoJson, activeZoomRules.visibility.regionBorders]);

  function closeContextMenu() {
    setContextMenu(null);
    setContextMenuView("choice");
  }

  const primarySelectedRegionId = selectedRegionIds[0] ?? null;
  const selectedProvinceIds = useMemo(() => {
    const ids = selectedRegionIds
      .map((rid) => provinceByRegionId.get(rid)?.id ?? null)
      .filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, [selectedRegionIds, provinceByRegionId]);

  const visibleObjectsAllRules = useMemo(() => {
    const list = (mapObjects ?? []).filter((o) => o.is_visible && typeof o.lon === "number" && typeof o.lat === "number");
    return list.filter((o) => {
      const forest = isForestLikeObject(o.kind, o.icon_key);
      if (forest && !activeZoomRules.visibility.forests) return false;
      if (!forest && !activeZoomRules.visibility.smallEntities) return false;
      return true;
    });
  }, [mapObjects, activeZoomRules.visibility.forests, activeZoomRules.visibility.smallEntities]);

  const validCitiesAll = useMemo(() => filterCitiesWithValidCoords(cities ?? []), [cities]);

  const cityById = useMemo(() => {
    const m = new Map<string, (typeof validCitiesAll)[number]>();
    for (const c of validCitiesAll) {
      m.set(String(c.id), c);
    }
    return m;
  }, [validCitiesAll]);

  const citiesForZoomRules = useMemo(() => {
    if (!activeZoomRules.visibility.cities) return [];
    return (cities ?? []).filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat));
  }, [cities, activeZoomRules.visibility.cities]);
  const provinceCapitalCityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of provinces) {
      if (typeof p.capital_city_id === "string" && p.capital_city_id) ids.add(p.capital_city_id);
    }
    return ids;
  }, [provinces]);
  const realmCapitalCityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of realms) {
      if (typeof r.capital_city_id === "string" && r.capital_city_id) ids.add(r.capital_city_id);
    }
    return ids;
  }, [realms]);

  // Conversion TopoJSON → GeoJSON pour le pathfinding terre (éviter la mer).
  const landGeoJson = useMemo(() => {
    const topo = geographyData;
    if (!topo?.objects?.admin1) return null;
    try {
      return feature(topo, topo.objects.admin1) as unknown as LandFeatureCollection;
    } catch {
      return null;
    }
  }, [geographyData]);
  const realmLabelAnchors = useMemo(() => {
    const shouldShow =
      activeZoomRules.visibility.realmLabels &&
      (renderZoomLevel === "continent" || renderZoomLevel === "monde");
    if (!shouldShow || !landGeoJson?.features?.length) return [];
    return computeRealmLabelAnchors({
      landGeoJson,
      provinceByRegionId,
      realmById,
      cityById,
    });
  }, [activeZoomRules.visibility.realmLabels, renderZoomLevel, landGeoJson, provinceByRegionId, realmById, cityById]);

  // Graphe terre (adjacence régions) calculé en différé pour ne pas bloquer le premier rendu.
  const [landGraph, setLandGraph] = useState<LandGraph | null>(null);
  useEffect(() => {
    if (!landGeoJson?.features?.length) return;
    const t = setTimeout(() => {
      const t0 = performance.now();
      try {
        const g = buildLandGraph(landGeoJson);
        setLandGraph(g);
      } catch {
        setLandGraph(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [landGeoJson]);

  // Même projection que react-simple-maps (ComposableMap défaut: width=800, height=600).
  const routeProjection = useMemo(
    () => geoMercator().scale(170).translate([400, 300]),
    []
  );
  const viewportProjectedBounds = useMemo(() => {
    const centerP = routeProjection(mapView.center);
    if (!centerP) return null;
    const halfW = 400 / Math.max(0.1, mapView.zoom);
    const halfH = 300 / Math.max(0.1, mapView.zoom);
    const margin =
      renderZoomLevel === "monde" ? 120 : renderZoomLevel === "continent" ? 90 : renderZoomLevel === "nation" ? 70 : 55;
    return {
      minX: centerP[0] - halfW - margin,
      maxX: centerP[0] + halfW + margin,
      minY: centerP[1] - halfH - margin,
      maxY: centerP[1] + halfH + margin,
    };
  }, [routeProjection, mapView.center, mapView.zoom, renderZoomLevel]);
  const visibleObjectsInView = useMemo(() => {
    const cap = activeZoomRules.caps.maxEntities;
    if (!viewportProjectedBounds) return visibleObjectsAllRules.slice(0, cap);
    const filtered = visibleObjectsAllRules.filter((o) => {
      const p = routeProjection([Number(o.lon), Number(o.lat)]);
      if (!p) return false;
      const [x, y] = p;
      return !(
        x < viewportProjectedBounds.minX ||
        x > viewportProjectedBounds.maxX ||
        y < viewportProjectedBounds.minY ||
        y > viewportProjectedBounds.maxY
      );
    });
    return filtered.slice(0, cap);
  }, [visibleObjectsAllRules, viewportProjectedBounds, routeProjection, activeZoomRules.caps.maxEntities]);
  const visibleCitiesInView = useMemo(() => {
    const cap = activeZoomRules.caps.maxCities;
    if (!viewportProjectedBounds) return citiesForZoomRules.slice(0, cap);
    const filtered = citiesForZoomRules.filter((c) => {
      const p = routeProjection([Number(c.lon), Number(c.lat)]);
      if (!p) return false;
      const [x, y] = p;
      return !(
        x < viewportProjectedBounds.minX ||
        x > viewportProjectedBounds.maxX ||
        y < viewportProjectedBounds.minY ||
        y > viewportProjectedBounds.maxY
      );
    });
    return filtered.slice(0, cap);
  }, [citiesForZoomRules, viewportProjectedBounds, routeProjection, activeZoomRules.caps.maxCities]);

  type RoutePathItem = {
    id: string;
    tier: string;
    d: string;
    polyline: Array<[number, number]>;
    name: string;
    labelX: number;
    labelY: number;
    labelAngleDeg: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  const [routePaths, setRoutePaths] = useState<RoutePathItem[]>([]);
  const routeBuildSchedulerRef = useRef<MapScheduler | null>(null);
  const routeGeometryCacheRef = useRef<Map<string, Omit<RoutePathItem, "id" | "tier">>>(new Map());
  const routeGeometryKeyByIdRef = useRef<Map<string, string>>(new Map());
  const routeGeometryWorkerClientRef = useRef<RouteGeometryWorkerClient | null>(null);
  if (!routeBuildSchedulerRef.current) routeBuildSchedulerRef.current = new MapScheduler();
  const poiById = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const o of mapObjects ?? []) {
      if (Number.isFinite(o.lon) && Number.isFinite(o.lat)) map.set(String(o.id), { lat: Number(o.lat), lon: Number(o.lon) });
    }
    return map;
  }, [mapObjects]);
  const pathwayPointsById = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const wp of routePathwayPoints ?? []) {
      map.set(String(wp.id), { lat: Number(wp.lat), lon: Number(wp.lon) });
    }
    return map;
  }, [routePathwayPoints]);
  const routeWaypointsMap = useMemo(() => {
    const map = new Map<string, Array<{ id: string; seq: number; lat: number; lon: number }>>();
    for (const wp of routePathwayPoints ?? []) {
      const rid = String(wp.route_id);
      if (!map.has(rid)) map.set(rid, []);
      map.get(rid)!.push({ id: String(wp.id), seq: Number(wp.seq) || 0, lat: Number(wp.lat), lon: Number(wp.lon) });
    }
    for (const list of map.values()) list.sort((a, b) => a.seq - b.seq);
    return map;
  }, [routePathwayPoints]);
  useEffect(() => {
    if (!ENABLE_ROUTE_GEOMETRY_WORKER) return;
    const client = new RouteGeometryWorkerClient(new URL("../../workers/routeGeometry.worker.ts", import.meta.url));
    routeGeometryWorkerClientRef.current = client;
    return () => {
      client.terminate();
      routeGeometryWorkerClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scheduler = routeBuildSchedulerRef.current!;
    scheduler
      .runLatest(async (signal) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) return;
        routeGeometryWorkerClientRef.current?.invalidateAll();
        const startedAt = performance.now();
        const list = routes ?? [];
        const result: RoutePathItem[] = [];
        let routesCandidatesCount = 0;
        let mainThreadGeomMs = 0;
        let workerGeomMs = 0;
        let labelLayoutMs = 0;
        const maxVerticesForZoom =
          renderZoomLevel === "monde" ? 120 : renderZoomLevel === "continent" ? 180 : renderZoomLevel === "nation" ? 280 : 400;
        const viewNow = viewRef.current;
        const centerPNow = routeProjection(viewNow.center);
        const gMargin = ENABLE_QUALITY_GOVERNOR ? qualityGovernorRef.current.getState().routeBuildMarginFactor : 1;
        const z = Math.max(0.1, viewNow.zoom);
        const pad = 180 * gMargin;
        const buildBounds = centerPNow
          ? {
              minX: centerPNow[0] - 400 / z - pad,
              maxX: centerPNow[0] + 400 / z + pad,
              minY: centerPNow[1] - 300 / z - pad,
              maxY: centerPNow[1] + 300 / z + pad,
            }
          : null;
        const datasetRevision = buildMapRouteDatasetRevision({
          routesLength: list.length,
          routeIdsSample: list
            .slice(0, 48)
            .map((x) => String(x.id))
            .join(","),
          landFeaturesLen: landGeoJson?.features?.length ?? 0,
          landGraphSize: landGraph?.adj?.size ?? 0,
          displayConfigVersion: mjConfigVersion,
          zoomBand: renderZoomLevel,
        });
        const serializeSeq = (seq: Array<{ lat: number; lon: number }>) =>
          seq
            .map((p) => `${Number(p.lon).toFixed(3)},${Number(p.lat).toFixed(3)}`)
            .join("|");
    for (const r of list) {
      const startPt = (r as { pathway_point_a_id?: string | null; city_a_id?: string | null; poi_a_id?: string | null }).poi_a_id
        ? poiById.get(String((r as any).poi_a_id))
        : (r as any).pathway_point_a_id
          ? pathwayPointsById.get(String((r as any).pathway_point_a_id))
          : (r as any).city_a_id
            ? cityById.get((r as any).city_a_id)
            : null;
      const endPt = (r as { pathway_point_b_id?: string | null; city_b_id?: string | null; poi_b_id?: string | null }).poi_b_id
        ? poiById.get(String((r as any).poi_b_id))
        : (r as any).pathway_point_b_id
          ? pathwayPointsById.get(String((r as any).pathway_point_b_id))
          : (r as any).city_b_id
            ? cityById.get((r as any).city_b_id)
            : null;
      if (!startPt || !endPt) continue;
      const rawWaypoints = (routeWaypointsMap.get(r.id) ?? []).map((wp) => ({ lat: wp.lat, lon: wp.lon }));
      const waypoints = resampleRouteWaypoints(rawWaypoints, MAX_RENDER_ROUTE_WAYPOINTS);
      const sequence: Array<{ lat: number; lon: number }> = [startPt, ...waypoints, endPt];
      if (sequence.length < 2) continue;
      if (buildBounds) {
        const hasPointInBuildBounds = sequence.some((pt) => {
          const p = routeProjection([Number(pt.lon), Number(pt.lat)]);
          if (!p) return false;
          const [x, y] = p;
          return !(x < buildBounds.minX || x > buildBounds.maxX || y < buildBounds.minY || y > buildBounds.maxY);
        });
        if (!hasPointInBuildBounds) continue;
      }
      routesCandidatesCount++;

      const tier = (r.tier === "local" || r.tier === "regional" || r.tier === "national" ? r.tier : "local") as RouteTier;
      const seed = typeof (r.attrs as any)?.seed === "number" ? (r.attrs as any).seed : undefined;
      const sinuosityPct =
        tier === "local"
          ? (displayConfig.routeSinuosityLocalPct ?? 80)
          : tier === "regional"
            ? (displayConfig.routeSinuosityRegionalPct ?? 50)
            : (displayConfig.routeSinuosityNationalPct ?? 20);
      const sinuosityScale = Math.max(0, Math.min(500, Number(sinuosityPct))) / 100;
      const cacheKey = [
        r.id,
        tier,
        seed ?? "na",
        Number(sinuosityScale).toFixed(3),
        Number(routeLodEpsilon).toFixed(3),
        renderZoomLevel,
        datasetRevision,
        serializeSeq(sequence),
      ].join("::");
      const prevKey = routeGeometryKeyByIdRef.current.get(r.id);
      if (prevKey === cacheKey) {
        const cached = routeGeometryCacheRef.current.get(cacheKey);
        if (cached) {
          result.push({ id: r.id, tier: r.tier, ...cached });
          continue;
        }
      }

      let points: Array<[number, number]> = [];
      let landSegments = 0;
      const shouldUseWorker =
        ENABLE_ROUTE_GEOMETRY_WORKER &&
        routeGeometryWorkerClientRef.current &&
        (!landGraph || sequence.length > 3 || list.length > 220);
      if (shouldUseWorker && routeGeometryWorkerClientRef.current) {
        const w0 = performance.now();
        const workerPoints = await routeGeometryWorkerClientRef.current.requestPoints(
          {
            type: "build-route-geometry",
            payload: {
              routeId: r.id,
              tier,
              seed,
              sinuosityScale,
              routeLodEpsilon,
              routeLodZoomRef,
              currentZoomLevel: renderZoomLevel,
              maxVerticesForZoom: Math.min(MAX_ROUTE_POLYLINE_VERTICES, maxVerticesForZoom),
              sequence,
            },
          },
          signal
        );
        workerGeomMs += performance.now() - w0;
        if (signal.aborted) return;
        if (workerPoints && workerPoints.length >= 2) {
          points = workerPoints;
        }
      }
      if (points.length === 0) {
        for (let i = 0; i < sequence.length - 1; i++) {
          const a = sequence[i];
          const b = sequence[i + 1];
          const seg = generateLandPath({ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat }, landGeoJson ?? undefined, landGraph);
          if (seg && seg.length >= 2) {
            landSegments += 1;
            if (points.length > 0) points.pop();
            points.push(...seg);
          } else {
            const segSinuous = generateSinuousPath(
              { lon: a.lon, lat: a.lat },
              { lon: b.lon, lat: b.lat },
              tier,
              seed,
              sinuosityScale
            );
            if (points.length > 0) points.pop();
            points.push(...segSinuous);
          }
        }
      }
      const rawPointsLen = points.length;
      if (points.length >= 2) {
        const maxPointsBeforeSmooth = 80;
        const toSmooth =
          points.length <= maxPointsBeforeSmooth
            ? points
            : (() => {
                const out: Array<[number, number]> = [];
                for (let k = 0; k < maxPointsBeforeSmooth; k++) {
                  const t = k / (maxPointsBeforeSmooth - 1);
                  const i = Math.min(Math.floor(t * (points.length - 1)), points.length - 2);
                  const u = t * (points.length - 1) - i;
                  const a = points[i];
                  const b = points[i + 1];
                  out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
                }
                return out;
              })();
        // Si aucun segment n'est venu du pathfinding "terre" (`generateLandPath`), alors
        // `generateSinuousPath` a déjà produit un tracé sinueux. Appliquer ensuite
        // `smoothLandPathWithSinuosity` fait exploser le nombre de points (effet "barbelé").
        points = landSegments > 0 ? smoothLandPathWithSinuosity(toSmooth, tier, seed ?? 0, sinuosityScale) : toSmooth;
      }
      points = simplifyPolylinePreservingCurves(points, routeLodEpsilon);
      const lod = buildRouteLodVariants(points, {
        epsilonLow: Math.max(0.45, routeLodEpsilon * 1.8),
        epsilonMid: Math.max(0.2, routeLodEpsilon),
        epsilonHigh: Math.max(0.08, routeLodEpsilon * 0.5),
      });
      points = pickRouteLodByZoom(lod, routeLodZoomRef);
      points = capPolylineVertices(points, Math.min(MAX_ROUTE_POLYLINE_VERTICES, maxVerticesForZoom));
      const smoothedPointsLen = points.length;
      if (smoothedPointsLen > 120 || sequence.length > 4) {
      }
      if (points.length < 2) continue;
      const projected = points.map(([lon, lat]) => {
        const p = routeProjection([lon, lat]);
        return p ? [p[0], p[1]] as [number, number] : null;
      }).filter((p): p is [number, number] => p !== null);
      if (projected.length < 2) continue;
      const d = "M " + projected.map(([x, y]) => `${x} ${y}`).join(" L ");
      const tLabel0 = performance.now();
      // Position du libellé à 50 % de la distance totale (pas à l'index milieu) pour que le nom ne bouge pas quand on ajoute des embranchements/waypoints
      let totalLen = 0;
      const segLengths: number[] = [];
      for (let i = 1; i < projected.length; i++) {
        const dx = projected[i][0] - projected[i - 1][0];
        const dy = projected[i][1] - projected[i - 1][1];
        const len = Math.hypot(dx, dy);
        segLengths.push(len);
        totalLen += len;
      }
      const halfLen = totalLen * 0.5;
      let acc = 0;
      let labelX = projected[0][0];
      let labelY = projected[0][1];
      for (let i = 0; i < segLengths.length; i++) {
        if (acc + segLengths[i] >= halfLen) {
          const t = totalLen > 0 ? (halfLen - acc) / segLengths[i] : 0;
          const t1 = Math.max(0, Math.min(1, t));
          labelX = projected[i][0] + t1 * (projected[i + 1][0] - projected[i][0]);
          labelY = projected[i][1] + t1 * (projected[i + 1][1] - projected[i][1]);
          break;
        }
        acc += segLengths[i];
        labelX = projected[i + 1][0];
        labelY = projected[i + 1][1];
      }
      // Direction générale du tracé (début → fin) pour garder l'écriture droite et lisible
      const p0 = projected[0];
      const p1 = projected[projected.length - 1];
      let labelAngleDeg = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
      if (labelAngleDeg > 90) labelAngleDeg -= 180;
      if (labelAngleDeg < -90) labelAngleDeg += 180;
      labelLayoutMs += performance.now() - tLabel0;
      const routeName = (r as { name?: string }).name?.trim() || `Route ${r.id}`;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const [x, y] of projected) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const geom: Omit<RoutePathItem, "id" | "tier"> = {
        d,
        polyline: projected,
        name: routeName,
        labelX,
        labelY,
        labelAngleDeg,
        minX,
        minY,
        maxX,
        maxY,
      };
      routeGeometryKeyByIdRef.current.set(r.id, cacheKey);
      routeGeometryCacheRef.current.set(cacheKey, geom);
      while (routeGeometryCacheRef.current.size > ROUTE_GEOMETRY_CACHE_MAX_ENTRIES) {
        const oldestKey = routeGeometryCacheRef.current.keys().next().value;
        if (!oldestKey) break;
        routeGeometryCacheRef.current.delete(oldestKey);
      }
      result.push({ id: r.id, tier: r.tier, ...geom });
    }
        if (signal.aborted) return;
        const totalMs = performance.now() - startedAt;
        mainThreadGeomMs = Math.max(0, totalMs - workerGeomMs);
        setRoutePaths(result);
        emitMapMetric("map_route_build_ms", totalMs, { mode, routeCount: list.length });
        emitMapMetric("map_routes_candidates_count", routesCandidatesCount, {
          mode,
          zoomLevel: renderZoomLevel,
        });
        emitMapMetric("map_routes_built_count", result.length, {
          mode,
          zoomLevel: renderZoomLevel,
        });
        emitMapMetric("map_route_build_ms_main_thread", mainThreadGeomMs, {
          mode,
          zoomLevel: renderZoomLevel,
        });
        emitMapMetric("map_route_build_ms_worker", workerGeomMs, {
          mode,
          zoomLevel: renderZoomLevel,
        });
        emitMapMetric("map_label_layout_ms", labelLayoutMs, {
          mode,
          zoomLevel: renderZoomLevel,
        });
      })
      .catch(() => {
        setRoutePaths([]);
      });
    return () => {
      scheduler.cancel();
      routeGeometryWorkerClientRef.current?.invalidateAll();
    };
  }, [
    routes,
    routeWaypointsMap,
    pathwayPointsById,
    poiById,
    cityById,
    routeProjection,
    landGeoJson,
    landGraph,
    displayConfig.routeSinuosityLocalPct,
    displayConfig.routeSinuosityRegionalPct,
    displayConfig.routeSinuosityNationalPct,
    routeLodEpsilon,
    routeLodZoomRef,
    renderZoomLevel,
    mode,
    mjConfigVersion,
    qualityTick,
  ]);

  const visibleRoutePaths = useMemo(() => {
    if (routePaths.length === 0) return routePaths;
    const centerP = routeProjection(mapView.center);
    if (!centerP) return routePaths;
    const halfW = 400 / Math.max(0.1, mapView.zoom);
    const halfH = 300 / Math.max(0.1, mapView.zoom);
    const margin = renderZoomLevel === "monde" ? 120 : renderZoomLevel === "continent" ? 80 : 45;
    const minX = centerP[0] - halfW - margin;
    const maxX = centerP[0] + halfW + margin;
    const minY = centerP[1] - halfH - margin;
    const maxY = centerP[1] + halfH + margin;
    const filtered = routePaths.filter(
      (rp) => !(rp.maxX < minX || rp.minX > maxX || rp.maxY < minY || rp.minY > maxY)
    );
    const capByLevel = renderZoomLevel === "monde" ? 240 : renderZoomLevel === "continent" ? 520 : 1200;
    const cap = Math.min(capByLevel, activeZoomRules.caps.maxRouteLabels > 0 ? activeZoomRules.caps.maxRouteLabels * 6 : capByLevel);
    return filtered.slice(0, cap);
  }, [routePaths, routeProjection, mapView.center, mapView.zoom, renderZoomLevel, activeZoomRules.caps.maxRouteLabels]);

  const visibleRouteLabelCount = useMemo(() => {
    const gf = ENABLE_QUALITY_GOVERNOR ? qualityGovernorRef.current.getState().labelFactor : 1;
    const cap = computeRouteLabelCap({
      renderZoomLevel,
      maxRouteLabelsRule: activeZoomRules.caps.maxRouteLabels,
      isInteractionLite,
      isMobilePerf,
      governorLabelFactor: gf,
    });
    return Math.min(visibleRoutePaths.length, cap);
  }, [
    visibleRoutePaths.length,
    renderZoomLevel,
    activeZoomRules.caps.maxRouteLabels,
    isInteractionLite,
    isMobilePerf,
    qualityTick,
  ]);

  const routeLabelAllowSet = useMemo(() => {
    const centerP = routeProjection(mapView.center);
    const cap = Math.min(visibleRoutePaths.length, visibleRouteLabelCount);
    const ids = pickRouteLabelOrder(visibleRoutePaths, centerP, cap);
    return new Set(ids);
  }, [visibleRoutePaths, visibleRouteLabelCount, mapView.center, routeProjection]);

  useEffect(() => {
    emitMapMetric("map_routes_visible_count", visibleRoutePaths.length, {
      mode,
      zoomLevel: renderZoomLevel,
    });
    emitMapMetric("map_routes_rendered_count", visibleRoutePaths.length, {
      mode,
      zoomLevel: renderZoomLevel,
    });
    emitMapMetric("map_route_labels_visible_count", visibleRouteLabelCount, {
      mode,
      zoomLevel: renderZoomLevel,
    });
    emitMapMetric("map_cities_visible_count", visibleCitiesInView.length, {
      mode,
      zoomLevel: renderZoomLevel,
    });
    emitMapMetric("map_objects_visible_count", visibleObjectsInView.length, {
      mode,
      zoomLevel: renderZoomLevel,
    });
  }, [visibleRoutePaths.length, visibleRouteLabelCount, visibleCitiesInView.length, visibleObjectsInView.length, mode, renderZoomLevel]);

  useEffect(() => {
    if (!ENABLE_FRAME_GAP_METRIC) return;
    let active = true;
    let previous = performance.now();
    let raf = 0;
    const tick = () => {
      if (!active) return;
      const now = performance.now();
      const gap = now - previous;
      previous = now;
      if (gap > 20) {
        emitMapMetric("map_interaction_frame_gap_ms", gap, { mode });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mode]);

  const handleRouteClick = useCallback(
    (e: React.MouseEvent<SVGPathElement>, routeId: string) => {
      if (mode !== "mj") return;
      const route = routes?.find((r) => r.id === routeId);
      if (!route) return;
      const cityA = route.city_a_id ? cityById.get(route.city_a_id) : null;
      const cityB = route.city_b_id ? cityById.get(route.city_b_id) : null;
      if (!cityA && !cityB) return;
      const lonLat = previewLonLatFromPointer(e.clientX, e.clientY);
      const fromCityId =
        !lonLat
          ? (route.city_a_id ?? route.city_b_id ?? "")
          : cityA && cityB
            ? geoDistanceKm(lonLat, { lon: cityA.lon, lat: cityA.lat }) <=
                geoDistanceKm(lonLat, { lon: cityB.lon, lat: cityB.lat })
              ? route.city_a_id!
              : route.city_b_id!
            : (route.city_a_id ?? route.city_b_id ?? "");
      if (!fromCityId) return;
      setCityPanel({ open: true, cityId: fromCityId });
      setCreateRouteState({
        fromCityId,
        toCityId: "",
        name: "",
        tier: "regional",
        isSubmitting: false,
        error: null,
      });
    },
    [mode, routes, cityById, setCityPanel]
  );

  const cityIconCatalog = useMemo(() => {
    const s = new Set<string>();
    for (const o of mapObjects ?? []) {
      if (o.icon_key) s.add(String(o.icon_key));
    }
    for (const c of cities ?? []) {
      if (c.icon_key) s.add(String(c.icon_key));
    }
    if (cityCreateModal?.uploadedIconKey) s.add(cityCreateModal.uploadedIconKey);
    return Array.from(s);
  }, [mapObjects, cities, cityCreateModal?.uploadedIconKey]);

  const uploadCityIcon = useCallback(async (file: File): Promise<string> => {
    const supabase = createClient();

    const parts = file.name.split(".");
    const ext = (parts.length > 1 ? parts[parts.length - 1] : "png").toLowerCase();
    const unique =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const path = `city-icons/${unique}.${ext}`;
    const bucket = "unit-icons";

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });
    if (uploadError) {
      // Ré-exprimer l'erreur pour qu'on puisse l'afficher côté UI.
      throw new Error(
        `Upload impossible (bucket=${bucket}, code=${(uploadError as any).code ?? "?"}, status=${(uploadError as any).statusCode ?? "?"}): ${uploadError.message}`,
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }, []);

  function previewLonLatFromPointer(clientX: number, clientY: number): { lon: number; lat: number } | null {
    const el = mapContainerRef.current;
    if (!el) return null;
    const svgEl = el.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return null;

    // Cible: le groupe qui est réellement zoomé/panné par react-simple-maps.
    const zoomGroup =
      (svgEl.querySelector("g.rsm-zoomable-group") as SVGGElement | null) ??
      (svgEl.querySelector("g[class*='zoomable']") as SVGGElement | null) ??
      (svgEl.querySelector("g") as SVGGElement | null);
    if (!zoomGroup) return null;

    const ctm = zoomGroup.getScreenCTM();
    if (!ctm) return null;

    // Coordonnées souris -> coordonnées locales du zoomGroup (espace projection).
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());

    // Inversion simple : le zoomGroup applique déjà pan/zoom autour des coordonnées projetées.
    // Donc `local` est directement dans l'espace de projection.
    const vb = svgEl.viewBox?.baseVal;
    const w = vb?.width || 800;
    const h = vb?.height || 450;
    const baseProj = geoMercator().scale(170).translate([w / 2, h / 2]);
    const inv = baseProj.invert?.([local.x, local.y]);
    if (inv) {
      const lon = inv[0];
      const lat = inv[1];
      return { lon, lat };
    }

    // Fallback : heuristique (ancienne logique) si l'inversion échoue.
    const rect = svgEl.getBoundingClientRect();
    const x = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    const y = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    const { center, zoom } = viewRef.current;
    const k = 140;
    const lon = center[0] + (x - 0.5) * (k / Math.max(1, zoom));
    const lat = center[1] - (y - 0.5) * (k / Math.max(1, zoom));
    return { lon, lat };
  }

  const openCityPanel = useCallback(
    (e: any, cityId: string) => {
      const city = cityById.get(cityId);
      if (mode !== "mj") {
        if (city) {
          const realmName = realmById.get(city.realm_id)?.name ?? "Royaume inconnu";
          setPublicInfoPanel({
            kind: "ville",
            title: city.name,
            lines: [
              `Royaume: ${realmName}`,
              `Coordonnées: ${city.lat.toFixed(2)}, ${city.lon.toFixed(2)}`,
            ],
          });
        }
        return;
      }
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const pct = Number((city?.attrs as any)?.icon_scale_pct ?? 100);
      setCityScaleEditPct(Number.isFinite(pct) ? Math.max(10, Math.min(400, pct)) : 100);
      setCityDeleteError(null);
      setCityPanel({ open: true, cityId });
    },
    [mode, cityById, realmById],
  );

  // `react-simple-maps` n'expose pas tous les handlers DOM (ex: onContextMenu) dans ses types.
  // On cast localement pour éviter de casser le build TypeScript.
  const GeographyAny = Geography as any;
  const MarkerAny = Marker as any;

  return (
    <div
      className="relative h-full w-full"
      onClick={() => closeContextMenu()}
      onContextMenu={(e) => {
        // Empêche le menu contextuel navigateur (même si on clique hors du menu custom).
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-amber-500/30 bg-[#0f0b07]/90 px-3 py-2 text-sm text-amber-50 shadow-xl backdrop-blur"
          style={{ left: tooltip.x + 12, top: tooltip.y + 8 }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Panneau réglages MJ : en overlay à droite si pas de settingsContainerId, sinon via portail. */}
      {mode === "mj" &&
        (() => {
          const panelContent = (
            <>
              <button
                type="button"
                onClick={() => setMjSettingsCollapsed((c) => !c)}
                className="flex w-full items-center justify-between p-4 text-left font-serif text-sm font-semibold tracking-wide text-amber-100 hover:bg-white/5 rounded-t-2xl transition-colors"
              >
                <span>Réglages MJ</span>
                <span className="text-amber-200/80" aria-hidden>{mjSettingsCollapsed ? "▶" : "▼"}</span>
              </button>

          {!mjSettingsCollapsed && (
          <div className="overflow-y-auto flex-1 min-h-0 p-4 pt-0 space-y-4">
            <section className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSettingsSection("config-icons")}
                className="flex w-full items-center justify-between rounded py-1 text-left text-sm font-semibold text-amber-100 hover:bg-white/5"
              >
                <span>Configuration icônes</span>
                <span className="text-amber-200/80" aria-hidden>{settingsSectionOpen["config-icons"] ? "▼" : "▶"}</span>
              </button>
              {settingsSectionOpen["config-icons"] && (
                <div className="space-y-2 pl-1">
                  <button type="button" onClick={() => toggleSettingsSection("config-icons-size")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Taille des icônes</span><span aria-hidden>{settingsSectionOpen["config-icons-size"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-icons-size"] && (
                    <div className="space-y-2 pl-2">
                      <div>
                        <p className="text-xs font-semibold text-stone-200">Taille max des icônes de villes</p>
                        <div className="mt-2 flex items-center gap-3">
                          <input type="range" min={12} max={100} value={mjUi.cityIconMaxPx} onChange={(e) => setMjUi((p) => ({ ...p, cityIconMaxPx: Number(e.target.value) }))} className="w-full" />
                          <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.cityIconMaxPx}px</span>
                        </div>
                        <p className="mt-1 text-[11px] text-stone-400">A zoom fort, une icône ne dépassera pas cette taille.</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-stone-200">Taille de la police des noms de villes</p>
                        <div className="mt-2 flex items-center gap-3">
                          <input type="range" min={6} max={24} value={mjUi.cityLabelFontSizePx ?? 10} onChange={(e) => setMjUi((p) => ({ ...p, cityLabelFontSizePx: Number(e.target.value) }))} className="w-full" />
                          <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.cityLabelFontSizePx ?? 10}px</span>
                        </div>
                        <p className="mt-1 text-[11px] text-stone-400">Même zoom / fade que les icônes.</p>
                      </div>
                      {placingCity?.active && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2">
                          <p className="text-xs font-semibold text-emerald-100">Taille de la ville en cours</p>
                          <div className="mt-1 flex items-center gap-2">
                            <input type="range" min={10} max={400} value={placingCity.iconScalePct} onChange={(e) => setPlacingCity((p) => p ? { ...p, iconScalePct: Math.max(10, Math.min(400, Number(e.target.value) || 100)) } : p)} className="w-full" />
                            <span className="w-12 text-right text-xs text-emerald-100 tabular-nums">{placingCity.iconScalePct}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-icons-zoom")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Ancrage du zoom</span><span aria-hidden>{settingsSectionOpen["config-icons-zoom"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-icons-zoom"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <p className="text-xs font-semibold text-stone-200">0% ↔ 100%</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-stone-200 hover:bg-white/10" onClick={() => setMjUi((p) => ({ ...p, zoomRefWorld: mapView.zoom }))}>Définir 0%</button>
                        <button type="button" className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-stone-200 hover:bg-white/10" onClick={() => setMjUi((p) => ({ ...p, zoomRefProvince: mapView.zoom }))}>Définir 100%</button>
                      </div>
                      <p className="mt-2 text-[11px] text-stone-400">0%={mjUi.zoomRefWorld.toFixed(2)} · 100%={mjUi.zoomRefProvince.toFixed(2)}</p>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-icons-curve")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Courbe de taille</span><span aria-hidden>{settingsSectionOpen["config-icons-curve"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-icons-curve"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <p className="text-[11px] text-stone-400">Taille à 0%</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.sizeAtWorldPct} onChange={(e) => setMjUi((p) => ({ ...p, sizeAtWorldPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.sizeAtWorldPct}%</span>
                      </div>
                      <p className="mt-2 text-[11px] text-stone-400">Progressivité</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0.4} max={2.2} step={0.05} value={mjUi.sizeCurveExp} onChange={(e) => setMjUi((p) => ({ ...p, sizeCurveExp: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.sizeCurveExp.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-icons-fade")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Fade-out (opacité)</span><span aria-hidden>{settingsSectionOpen["config-icons-fade"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-icons-fade"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <p className="text-[11px] text-stone-400">Début / Fin fade (%)</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.fadeStartPct} onChange={(e) => setMjUi((p) => ({ ...p, fadeStartPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.fadeStartPct}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.fadeEndPct} onChange={(e) => setMjUi((p) => ({ ...p, fadeEndPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.fadeEndPct}%</span>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-icons-debug")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Debug zones cliquables</span><span aria-hidden>{settingsSectionOpen["config-icons-debug"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-icons-debug"] && (
                    <label className="flex items-center gap-2 pl-2 text-xs text-stone-200">
                      <input type="checkbox" checked={mjUi.debugCityHitboxes} onChange={(e) => setMjUi((p) => ({ ...p, debugCityHitboxes: e.target.checked }))} />
                      Afficher les zones cliquables (debug)
                    </label>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSettingsSection("config-zoom-rules")}
                className="flex w-full items-center justify-between rounded py-1 text-left text-sm font-semibold text-amber-100 hover:bg-white/5"
              >
                <span>Règles par palier de zoom</span>
                <span className="text-amber-200/80" aria-hidden>{settingsSectionOpen["config-zoom-rules"] ? "▼" : "▶"}</span>
              </button>
              {settingsSectionOpen["config-zoom-rules"] && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                  <label className="block text-[11px] text-stone-400">
                    Niveau édité
                    <select
                      className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-stone-100"
                      value={zoomRulesEditorLevel}
                      onChange={(e) => setZoomRulesEditorLevel(e.target.value as MapZoomLevelId)}
                    >
                      {zoomThresholdLabels.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label} (seuil {z.zoom.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs text-stone-200">
                    {(
                      [
                        ["routes", "Routes"],
                        ["cities", "Villes"],
                        ["smallEntities", "Petites entités"],
                        ["forests", "Forêts"],
                        ["rivers", "Rivières"],
                        ["lakes", "Lacs"],
                        ["regionBorders", "Frontières"],
                        ["realmLabels", "Noms royaumes"],
                      ] as Array<[keyof MapDisplayConfig["zoomLevelRules"]["province"]["visibility"], string]>
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(mjUi.zoomLevelRules[zoomRulesEditorLevel].visibility[key])}
                          onChange={(e) =>
                            setMjUi((p) => ({
                              ...p,
                              zoomLevelRules: {
                                ...p.zoomLevelRules,
                                [zoomRulesEditorLevel]: {
                                  ...p.zoomLevelRules[zoomRulesEditorLevel],
                                  visibility: {
                                    ...p.zoomLevelRules[zoomRulesEditorLevel].visibility,
                                    [key]: e.target.checked,
                                  },
                                },
                              },
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2 text-xs text-stone-200">
                    <p className="text-[11px] text-stone-400">Échelles</p>
                    {(
                      [
                        ["cities", "Villes"],
                        ["routes", "Routes"],
                        ["entities", "Entités"],
                      ] as Array<[keyof MapDisplayConfig["zoomLevelRules"]["province"]["scale"], string]>
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-14 text-[11px] text-stone-400">{label}</span>
                        <input
                          type="range"
                          min={0.1}
                          max={2}
                          step={0.05}
                          value={mjUi.zoomLevelRules[zoomRulesEditorLevel].scale[key]}
                          onChange={(e) =>
                            setMjUi((p) => ({
                              ...p,
                              zoomLevelRules: {
                                ...p.zoomLevelRules,
                                [zoomRulesEditorLevel]: {
                                  ...p.zoomLevelRules[zoomRulesEditorLevel],
                                  scale: {
                                    ...p.zoomLevelRules[zoomRulesEditorLevel].scale,
                                    [key]: Number(e.target.value),
                                  },
                                },
                              },
                            }))
                          }
                          className="flex-1"
                        />
                        <span className="w-10 text-right tabular-nums">
                          {Number(mjUi.zoomLevelRules[zoomRulesEditorLevel].scale[key]).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 text-xs text-stone-200">
                    <p className="text-[11px] text-stone-400">Caps</p>
                    {(
                      [
                        ["maxRouteLabels", "Labels routes"],
                        ["maxCities", "Villes max"],
                        ["maxEntities", "Entités max"],
                      ] as Array<[keyof MapDisplayConfig["zoomLevelRules"]["province"]["caps"], string]>
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-20 text-[11px] text-stone-400">{label}</span>
                        <input
                          type="number"
                          min={0}
                          max={20000}
                          value={mjUi.zoomLevelRules[zoomRulesEditorLevel].caps[key]}
                          onChange={(e) =>
                            setMjUi((p) => ({
                              ...p,
                              zoomLevelRules: {
                                ...p.zoomLevelRules,
                                [zoomRulesEditorLevel]: {
                                  ...p.zoomLevelRules[zoomRulesEditorLevel],
                                  caps: {
                                    ...p.zoomLevelRules[zoomRulesEditorLevel].caps,
                                    [key]: Math.max(0, Math.min(20000, Number(e.target.value) || 0)),
                                  },
                                },
                              },
                            }))
                          }
                          className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-stone-100"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-md border border-indigo-400/40 bg-indigo-950/40 px-2 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-900/40"
                    onClick={() =>
                      setMjUi((p) => ({
                        ...p,
                        zoomLevelRules: {
                          ...p.zoomLevelRules,
                          province: {
                            visibility: {
                              routes: true,
                              cities: true,
                              smallEntities: true,
                              forests: true,
                              rivers: true,
                              lakes: true,
                              regionBorders: true,
                              realmLabels: false,
                            },
                            scale: { cities: 1, routes: 1, entities: 1 },
                            caps: { maxRouteLabels: 600, maxCities: 5000, maxEntities: 5000 },
                          },
                          nation: {
                            visibility: {
                              routes: true,
                              cities: true,
                              smallEntities: true,
                              forests: true,
                              rivers: true,
                              lakes: true,
                              regionBorders: true,
                              realmLabels: false,
                            },
                            scale: { cities: 0.72, routes: 0.72, entities: 0.72 },
                            caps: { maxRouteLabels: 260, maxCities: 2200, maxEntities: 2200 },
                          },
                          continent: {
                            visibility: {
                              routes: false,
                              cities: true,
                              smallEntities: false,
                              forests: false,
                              rivers: true,
                              lakes: true,
                              regionBorders: true,
                              realmLabels: true,
                            },
                            scale: { cities: 0.42, routes: 0.42, entities: 0.45 },
                            caps: { maxRouteLabels: 0, maxCities: 900, maxEntities: 500 },
                          },
                          monde: {
                            visibility: {
                              routes: false,
                              cities: true,
                              smallEntities: false,
                              forests: false,
                              rivers: false,
                              lakes: false,
                              regionBorders: true,
                              realmLabels: true,
                            },
                            scale: { cities: 0.25, routes: 0.25, entities: 0.3 },
                            caps: { maxRouteLabels: 0, maxCities: 450, maxEntities: 250 },
                          },
                        },
                      }))
                    }
                  >
                    Appliquer recommandations RP
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSettingsSection("config-routes")}
                className="flex w-full items-center justify-between rounded py-1 text-left text-sm font-semibold text-amber-100 hover:bg-white/5"
              >
                <span>Configuration routes</span>
                <span className="text-amber-200/80" aria-hidden>{settingsSectionOpen["config-routes"] ? "▼" : "▶"}</span>
              </button>
              {settingsSectionOpen["config-routes"] && (
                <div className="space-y-2 pl-1">
                  <button type="button" onClick={() => toggleSettingsSection("config-routes-stroke")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Taille du trait</span><span aria-hidden>{settingsSectionOpen["config-routes-stroke"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-routes-stroke"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2 space-y-2">
                      <p className="text-[11px] text-stone-400">0,01 à 0,3 px (pas 0,01)</p>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-stone-400">Locale</span>
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.01}
                    value={Math.max(0.01, Math.min(0.3, Number(mjUi.routeStrokeLocalPx ?? 0.05)))}
                    onChange={(e) => setMjUi((p) => ({ ...p, routeStrokeLocalPx: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-xs text-stone-200 tabular-nums">{Number(mjUi.routeStrokeLocalPx ?? 0.05).toFixed(2)}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-stone-400">Régionale</span>
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.01}
                    value={Math.max(0.01, Math.min(0.3, Number(mjUi.routeStrokeRegionalPx ?? 0.1)))}
                    onChange={(e) => setMjUi((p) => ({ ...p, routeStrokeRegionalPx: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-xs text-stone-200 tabular-nums">{Number(mjUi.routeStrokeRegionalPx ?? 0.1).toFixed(2)}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-stone-400">Nationale</span>
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.01}
                    value={Math.max(0.01, Math.min(0.3, Number(mjUi.routeStrokeNationalPx ?? 0.15)))}
                    onChange={(e) => setMjUi((p) => ({ ...p, routeStrokeNationalPx: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-xs text-stone-200 tabular-nums">{Number(mjUi.routeStrokeNationalPx ?? 0.15).toFixed(2)}px</span>
                </div>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-routes-labels")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Taille de la police des noms de routes</span><span aria-hidden>{settingsSectionOpen["config-routes-labels"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-routes-labels"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-[11px] text-stone-400">Police (px)</span>
                        <input type="range" min={0.01} max={1} step={0.01} value={Math.max(0.01, Math.min(1, Number(mjUi.routeLabelFontSizePx ?? 0.25)))} onChange={(e) => setMjUi((p) => ({ ...p, routeLabelFontSizePx: Number(e.target.value) }))} className="flex-1" />
                        <span className="w-12 text-right text-xs text-stone-200 tabular-nums">{(Number(mjUi.routeLabelFontSizePx ?? 0.25)).toFixed(2)}px</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-400">0,01 à 1 px (pas 0,01). Même zoom / fade que les routes.</p>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-routes-fade")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Fade-out routes</span><span aria-hidden>{settingsSectionOpen["config-routes-fade"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-routes-fade"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <p className="text-[11px] text-stone-400">Début / Fin fade (%)</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.routeFadeStartPct} onChange={(e) => setMjUi((p) => ({ ...p, routeFadeStartPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeFadeStartPct}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.routeFadeEndPct} onChange={(e) => setMjUi((p) => ({ ...p, routeFadeEndPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeFadeEndPct}%</span>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-routes-progress")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Progressivité routes</span><span aria-hidden>{settingsSectionOpen["config-routes-progress"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-routes-progress"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2">
                      <p className="text-[11px] text-stone-400">Taille à 0% / Progressivité</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0} max={100} value={mjUi.routeSizeAtWorldPct} onChange={(e) => setMjUi((p) => ({ ...p, routeSizeAtWorldPct: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeSizeAtWorldPct}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="range" min={0.4} max={2.2} step={0.05} value={mjUi.routeSizeCurveExp} onChange={(e) => setMjUi((p) => ({ ...p, routeSizeCurveExp: Number(e.target.value) }))} className="w-full" />
                        <span className="w-10 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeSizeCurveExp.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => toggleSettingsSection("config-routes-sinuosity")} className="flex w-full items-center justify-between rounded py-0.5 text-left text-xs font-semibold text-stone-200 hover:bg-white/5">
                    <span>Sinuosité</span><span aria-hidden>{settingsSectionOpen["config-routes-sinuosity"] ? "▼" : "▶"}</span>
                  </button>
                  {settingsSectionOpen["config-routes-sinuosity"] && (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-2 space-y-2">
                      <p className="text-[11px] text-stone-400">0 = droit, 500 = très sinueux</p>
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-[11px] text-stone-400">Locale</span>
                        <input type="range" min={0} max={500} value={Math.min(500, mjUi.routeSinuosityLocalPct)} onChange={(e) => setMjUi((p) => ({ ...p, routeSinuosityLocalPct: Number(e.target.value) }))} className="flex-1" />
                        <span className="w-8 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeSinuosityLocalPct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-[11px] text-stone-400">Régionale</span>
                        <input type="range" min={0} max={500} value={Math.min(500, mjUi.routeSinuosityRegionalPct)} onChange={(e) => setMjUi((p) => ({ ...p, routeSinuosityRegionalPct: Number(e.target.value) }))} className="flex-1" />
                        <span className="w-8 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeSinuosityRegionalPct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-[11px] text-stone-400">Nationale</span>
                        <input type="range" min={0} max={500} value={Math.min(500, mjUi.routeSinuosityNationalPct)} onChange={(e) => setMjUi((p) => ({ ...p, routeSinuosityNationalPct: Number(e.target.value) }))} className="flex-1" />
                        <span className="w-8 text-right text-xs text-stone-200 tabular-nums">{mjUi.routeSinuosityNationalPct}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={saveMjSettings}
                className="w-full rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-900/40 transition-colors"
              >
                Enregistrer les réglages (local)
              </button>
              {onSaveMapDisplayConfig && (
                <button
                  type="button"
                  onClick={saveMapDisplayConfigToServer}
                  disabled={mjSettingsSaving}
                  className="w-full rounded-lg border border-emerald-500/50 bg-emerald-950/50 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/50 transition-colors disabled:opacity-60"
                >
                  {mjSettingsSaving ? "Enregistrement..." : "Enregistrer pour toute la carte"}
                </button>
              )}
              {mjSettingsSavedAt != null && (
                <p className="text-center text-xs text-emerald-400">Enregistré.</p>
              )}
              {mjSettingsError && (
                <p className="text-center text-xs text-red-300">{mjSettingsError}</p>
              )}
            </div>
          </div>
          )}
            </>
          );
          if (usePortalForSettings && settingsContainerId && typeof document !== "undefined") {
            const container = document.getElementById(settingsContainerId);
            if (container) {
              return createPortal(
                <div className="w-full rounded-2xl border border-amber-500/20 bg-black/55 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur flex flex-col max-h-[60vh] overflow-hidden">
                  {panelContent}
                </div>,
                container
              );
            }
          }
          return (
            <div className="absolute right-4 top-4 bottom-4 z-40 flex min-w-[320px] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-black/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur">
              {panelContent}
            </div>
          );
        })()}

      {/* Bannière : placement d'un point de passage par clic sur la carte */}
      {mode === "mj" && placingPathwayPoint && (
        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-emerald-500/30 bg-emerald-950/90 px-4 py-2 shadow-lg backdrop-blur">
          <p className="text-sm font-medium text-emerald-100">
            {placingPathwayPoint.isSubmitting ? "Ajout du point..." : "Cliquez sur la carte pour placer le point de passage (Échap pour annuler)"}
          </p>
        </div>
      )}

      {/* Bannière : sélection départ/arrivée par clic (ville ou route) */}
      {mode === "mj" && selectingEndpoint && (
        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-950/90 px-4 py-2 shadow-lg backdrop-blur">
          <p className="text-sm font-medium text-amber-100">
            {selectingEndpointSubmitting
              ? "Création du point..."
              : selectingEndpoint.step === "from"
                ? "Cliquez sur une ville, une entité ou une route pour le départ (Échap pour annuler)"
                : "Cliquez sur une ville, une entité ou une route pour l'arrivée (Échap pour annuler)"}
          </p>
          {selectingEndpointError && (
            <p className="mt-1 text-xs text-red-200">{selectingEndpointError}</p>
          )}
        </div>
      )}

      {/* Debug zoom (top-right) */}
      {mode === "mj" && placingCity?.active && (
        <div className="absolute right-4 top-4 z-50 rounded-xl border border-white/10 bg-black/60 px-3 py-2 shadow backdrop-blur">
          <p className="text-[11px] text-stone-200">
            Zoom : <span className="font-mono text-stone-100/90">{mapView.zoom.toFixed(2)}</span> ·{" "}
            <span className="font-mono text-cyan-100">{currentZoomLevel}</span> ·{" "}
            <span className="font-mono text-amber-100">{zoomPct.toFixed(0)}%</span>
          </p>
        </div>
      )}

      {/* Debug placement (curseur vs icône preview) */}
      {mode === "mj" && placingCity?.active && placementDebug && (
        <>
          <div
            style={{
              position: "fixed",
              left: placementDebug.cursor.x - 6,
              top: placementDebug.cursor.y - 6,
              width: 12,
              height: 12,
              border: "2px solid rgba(34,197,94,0.9)",
              borderRadius: 2,
              pointerEvents: "none",
              zIndex: 80,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: placementDebug.marker.x - 10,
              top: placementDebug.marker.y - 10,
              width: 20,
              height: 20,
              border: "2px solid rgba(239,68,68,0.95)",
              borderRadius: 2,
              pointerEvents: "none",
              zIndex: 81,
              background: "rgba(239,68,68,0.08)",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: placementDebug.marker.x + 12,
              top: placementDebug.marker.y - 10,
              color: "rgba(239,68,68,0.95)",
              fontSize: 12,
              fontFamily: "monospace",
              pointerEvents: "none",
              zIndex: 82,
            }}
          >
            dx={Math.round(placementDebug.delta.dx)} dy={Math.round(placementDebug.delta.dy)}
          </div>
        </>
      )}

      {/* Menu contextuel MJ */}
      {mode === "mj" && contextMenu && (
        <div
          className="fixed z-50 w-72 rounded-xl border border-amber-500/20 bg-black/90 p-3 text-sm text-stone-100 shadow-2xl backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold text-amber-100">Actions</p>
          <p className="mt-1 text-xs text-stone-300">
            Région : <span className="font-mono">{contextMenu.label}</span>
          </p>

          <div className="mt-3 space-y-2">
            {contextMenuView === "choice" ? (
              <>
                {mode === "mj" && contextMenu.deletableCityId && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950/60"
                    disabled={!mjDeleteCity}
                    onClick={async () => {
                      if (!mjDeleteCity || !contextMenu.deletableCityId) return;
                      const res = await mjDeleteCity({ cityId: contextMenu.deletableCityId });
                      if (res.error) {
                        setContextMenu((prev) => (prev ? { ...prev, error: res.error ?? "Erreur inconnue." } : prev));
                        return;
                      }
                      closeContextMenu();
                      router.refresh();
                    }}
                  >
                    Supprimer la ville
                  </button>
                )}
                <button
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-white/10"
                  onClick={() => setContextMenuView("editProvince")}
                >
                  Editer Province
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/60"
                  onClick={() => {
                    setCityCreateModal({
                      open: true,
                      regionId: contextMenu.regionId,
                      initialLon: contextMenu.centroidLon,
                      initialLat: contextMenu.centroidLat,
                      name: contextMenu.objectName,
                      iconMode: "preset",
                      presetIconKey: "city",
                      urlIconKey: "",
                      reuseIconKey: "",
                      uploadedIconKey: null,
                      isUploading: false,
                      isSubmitting: false,
                      error: null,
                    });
                    closeContextMenu();
                  }}
                >
                  Créer Ville
                </button>
                {contextMenu.error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                    {contextMenu.error}
                  </p>
                )}
              </>
            ) : (
              <>
            <label className="block text-xs text-stone-300">
              Royaume
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                value={contextMenu.realmId}
                onChange={(e) =>
                  setContextMenu((prev) => (prev ? { ...prev, realmId: e.target.value, error: null } : prev))
                }
              >
                {realms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.is_npc ? " (PNJ)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-stone-300">
              Nom de la province
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                value={contextMenu.provinceName}
                onChange={(e) =>
                  setContextMenu((prev) => (prev ? { ...prev, provinceName: e.target.value, error: null } : prev))
                }
              />
            </label>

                <label className="block text-xs text-stone-300">
                  Paramètres (attrs JSON)
                  <textarea
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                    rows={4}
                    value={contextMenu.attrsText}
                  onChange={(e) =>
                      setContextMenu((prev) => (prev ? { ...prev, attrsText: e.target.value, error: null } : prev))
                  }
                    spellCheck={false}
                />
              </label>

            {contextMenu.error && (
              <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {contextMenu.error}
              </p>
            )}

            <button
              type="button"
              disabled={contextMenu.isSubmitting}
              className="w-full rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-60"
              onClick={async () => {
                if (!contextMenu.realmId) {
                  setContextMenu((prev) => (prev ? { ...prev, error: "Veuillez choisir un royaume." } : prev));
                  return;
                }
                const provinceName = contextMenu.provinceName.trim();
                if (!provinceName) {
                      setContextMenu((prev) =>
                        prev ? { ...prev, error: "Veuillez saisir un nom de province." } : prev,
                      );
                  return;
                }
                const regionId = contextMenu.regionId.trim();
                const realmId = contextMenu.realmId.trim();
                    if (!regionId || !realmId) return;

                setContextMenu((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));
                try {
                  const action = mjCreateOrAssignProvince;
                  if (!action) {
                    setContextMenu((prev) =>
                      prev ? { ...prev, isSubmitting: false, error: "Action MJ non disponible." } : prev,
                    );
                    return;
                  }
                  const res = await action({
                    regionId,
                    realmId,
                    provinceName,
                        attrsJson: contextMenu.attrsText,
                  });
                  if (res.error) {
                    setContextMenu((prev) =>
                      prev ? { ...prev, isSubmitting: false, error: res.error ?? "Erreur inconnue." } : prev,
                    );
                    return;
                  }
                  closeContextMenu();
                  router.refresh();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setContextMenu((prev) =>
                    prev ? { ...prev, isSubmitting: false, error: msg || "Erreur inconnue." } : prev,
                  );
                }
              }}
            >
              {contextMenu.isSubmitting ? "Création..." : "Créer / réassigner"}
            </button>

                <button
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-white/10"
                  onClick={() => setContextMenuView("choice")}
                >
                  Retour
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-white/10"
            onClick={() => closeContextMenu()}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Pop-in : création ville */}
      {mode === "mj" && cityCreateModal && cityCreateModal.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            // Fermer uniquement si l'utilisateur clique sur le "fond" (overlay),
            // pas sur le contenu de la modale.
            if (e.target === e.currentTarget) setCityCreateModal(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-[#0f0b07]/95 p-4 text-stone-100 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-semibold text-amber-100">Créer une Ville</h2>
            <p className="mt-1 text-xs text-stone-300">
              Choisissez nom et icône, puis cliquez gauche sur la carte pour valider l'emplacement.
            </p>

            <div className="mt-3 space-y-3">
              <label className="block text-xs text-stone-300">
                Nom de la ville
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                  value={cityCreateModal.name}
                  onChange={(e) => setCityCreateModal((p) => (p ? { ...p, name: e.target.value, error: null } : p))}
                />
              </label>

              <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                <p className="text-xs font-semibold text-amber-100">Icône</p>

                <label className="mt-2 block text-xs text-stone-300">
                  Source
                  <select
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                    value={cityCreateModal.iconMode}
                    onChange={(e) =>
                      setCityCreateModal((p) =>
                        p
                          ? {
                              ...p,
                              iconMode: e.target.value as any,
                              error: null,
                            }
                          : p,
                      )
                    }
                  >
                    <option value="preset">Préréglée</option>
                    <option value="url">URL</option>
                    <option value="upload">Téléverser</option>
                    <option value="reuse">Réutiliser</option>
                  </select>
                </label>

                {cityCreateModal.iconMode === "preset" && (
                  <label className="mt-2 block text-xs text-stone-300">
                    Icône préréglée
                    <select
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                      value={cityCreateModal.presetIconKey}
                      onChange={(e) =>
                        setCityCreateModal((p) => (p ? { ...p, presetIconKey: e.target.value, error: null } : p))
                      }
                    >
                      <option value="city">Ville</option>
                      <option value="castle">Château</option>
                      <option value="village">Village</option>
                    </select>
                  </label>
                )}

                {cityCreateModal.iconMode === "url" && (
                  <label className="mt-2 block text-xs text-stone-300">
                    URL de l'icône
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                      value={cityCreateModal.urlIconKey}
                      onChange={(e) =>
                        setCityCreateModal((p) => (p ? { ...p, urlIconKey: e.target.value, error: null } : p))
                      }
                      placeholder="https://..."
                    />
                  </label>
                )}

                {cityCreateModal.iconMode === "upload" && (
                  <div className="mt-2">
                    <label className="block text-xs text-stone-300">
                      Fichier (PNG/JPG/WebP/SVG)
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCityCreateModal((p) => (p ? { ...p, isUploading: true, error: null } : p));
                          try {
                            const publicUrl = await uploadCityIcon(file);
                            setCityCreateModal((p) =>
                              p
                                ? {
                                    ...p,
                                    uploadedIconKey: publicUrl,
                                    isUploading: false,
                                    error: null,
                                  }
                                : p,
                            );
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            setCityCreateModal((p) =>
                              p
                                ? {
                                    ...p,
                                    isUploading: false,
                                    error: msg || "Erreur lors du téléversement.",
                                  }
                                : p,
                            );
                          }
                        }}
                      />
                    </label>
                    {cityCreateModal.uploadedIconKey && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-stone-300">
                        <span>Prévisualisation :</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cityCreateModal.uploadedIconKey} alt="Icône" className="h-8 w-8 rounded border border-white/10 bg-black/50" />
                      </div>
                    )}
                  </div>
                )}

                {cityCreateModal.iconMode === "reuse" && (
                  <label className="mt-2 block text-xs text-stone-300">
                    Icône existante
                    <select
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                      value={cityCreateModal.reuseIconKey}
                      onChange={(e) =>
                        setCityCreateModal((p) => (p ? { ...p, reuseIconKey: e.target.value, error: null } : p))
                      }
                    >
                      <option value="">—</option>
                      {cityIconCatalog.map((k) => (
                        <option key={k} value={k}>
                          {formatIconCatalogLabel(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {cityCreateModal.error && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">{cityCreateModal.error}</p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-500 disabled:opacity-60"
                disabled={cityCreateModal.isUploading}
                onClick={() => {
                  const name = cityCreateModal.name.trim();
                  if (!name) {
                    setCityCreateModal((p) => (p ? { ...p, error: "Veuillez saisir un nom de ville." } : p));
                    return;
                  }

                  let iconKey: string | null = null;
                  if (cityCreateModal.iconMode === "preset") iconKey = cityCreateModal.presetIconKey.trim();
                  if (cityCreateModal.iconMode === "url") iconKey = cityCreateModal.urlIconKey.trim();
                  if (cityCreateModal.iconMode === "upload") iconKey = cityCreateModal.uploadedIconKey;
                  if (cityCreateModal.iconMode === "reuse") iconKey = cityCreateModal.reuseIconKey.trim();

                  if (!iconKey) {
                    setCityCreateModal((p) => (p ? { ...p, error: "Veuillez choisir une icône." } : p));
                    return;
                  }
                  if (cityCreateModal.iconMode === "url" && !iconKey.startsWith("http")) {
                    setCityCreateModal((p) => (p ? { ...p, error: "L'URL d'icône doit commencer par https:// (ou http://)." } : p));
                    return;
                  }

                  setPlacingCity({
                    active: true,
                    regionId: cityCreateModal.regionId,
                    name,
                    iconKey,
                    iconScalePct: 100,
                    previewLon: cityCreateModal.initialLon,
                    previewLat: cityCreateModal.initialLat,
                    isSubmitting: false,
                    error: null,
                  });
                  setCityCreateModal(null);
                }}
              >
                Valider
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-white/10"
                onClick={() => setCityCreateModal(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: fusion */}
      {mode === "mj" && mergeForm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMergeForm((p) => ({ ...p, open: false }))}>
          <div
            className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-[#0f0b07]/95 p-4 text-stone-100 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-semibold text-amber-100">Fusionner des régions</h2>
            <p className="mt-1 text-xs text-stone-300">
              {selectedRegionIds.length} régions → 1 province
            </p>

            <div className="mt-3 space-y-2">
              <label className="block text-xs text-stone-300">
                Royaume
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-sm text-stone-100"
                  value={mergeForm.realmId}
                  onChange={(e) => setMergeForm((p) => ({ ...p, realmId: e.target.value, error: null }))}
                >
                  {realms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.is_npc ? " (PNJ)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-stone-300">
                Nouveau nom
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                  value={mergeForm.newName}
                  onChange={(e) => setMergeForm((p) => ({ ...p, newName: e.target.value, error: null }))}
                />
              </label>

              {mergeForm.error && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {mergeForm.error}
                </p>
              )}

              <button
                type="button"
                disabled={mergeForm.isSubmitting}
                className="w-full rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-500 disabled:opacity-60"
                onClick={async () => {
                  const action = mjMergeProvinces;
                  if (!action) {
                    setMergeForm((p) => ({ ...p, error: "Action MJ non disponible." }));
                    return;
                  }
                  const realmId = mergeForm.realmId.trim();
                  const newName = mergeForm.newName.trim();
                  if (!realmId) {
                    setMergeForm((p) => ({ ...p, error: "Veuillez choisir un royaume." }));
                    return;
                  }
                  if (!newName) {
                    setMergeForm((p) => ({ ...p, error: "Veuillez saisir un nom." }));
                    return;
                  }
                  setMergeForm((p) => ({ ...p, isSubmitting: true, error: null }));
                  const res = await action({ regionIds: selectedRegionIds, realmId, newName });
                  if (res.error) {
                    setMergeForm((p) => ({ ...p, isSubmitting: false, error: res.error ?? "Erreur inconnue." }));
                    return;
                  }
                  setMergeForm((p) => ({ ...p, open: false, isSubmitting: false }));
                  setSelectedRegionIds([]);
                  router.refresh();
                }}
              >
                Fusionner
              </button>

              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                onClick={() => setMergeForm((p) => ({ ...p, open: false }))}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: rename */}
      {mode === "mj" && renameForm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRenameForm((p) => ({ ...p, open: false }))}>
          <div
            className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-[#0f0b07]/95 p-4 text-stone-100 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-semibold text-amber-100">Renommer la province</h2>
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-stone-300">
                Nouveau nom
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                  value={renameForm.newName}
                  onChange={(e) => setRenameForm((p) => ({ ...p, newName: e.target.value, error: null }))}
                />
              </label>
              {renameForm.error && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {renameForm.error}
                </p>
              )}
              <button
                type="button"
                disabled={renameForm.isSubmitting}
                className="w-full rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-60"
                onClick={async () => {
                  const action = mjRenameProvince;
                  if (!action) {
                    setRenameForm((p) => ({ ...p, error: "Action MJ non disponible." }));
                    return;
                  }
                  const provinceId = renameForm.provinceId.trim();
                  const newName = renameForm.newName.trim();
                  if (!provinceId) return;
                  if (!newName) {
                    setRenameForm((p) => ({ ...p, error: "Veuillez saisir un nom." }));
                    return;
                  }
                  setRenameForm((p) => ({ ...p, isSubmitting: true, error: null }));
                  const res = await action({ provinceId, newName });
                  if (res.error) {
                    setRenameForm((p) => ({ ...p, isSubmitting: false, error: res.error ?? "Erreur inconnue." }));
                    return;
                  }
                  setRenameForm((p) => ({ ...p, open: false, isSubmitting: false }));
                  router.refresh();
                }}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                onClick={() => setRenameForm((p) => ({ ...p, open: false }))}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carte */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        style={{
          overscrollBehavior: "contain",
          touchAction: isMobilePerf ? "pan-x pan-y" : "none",
          scrollBehavior: prefersReducedMotion ? "auto" : "smooth",
        }}
      >
        {!topoReady && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/35">
            <div className="rounded-xl border border-amber-500/30 bg-[#0f0b07]/85 px-4 py-2 text-sm text-amber-100">
              Préparation de la carte...
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border border-amber-500/30 bg-black/65 px-2 py-1 text-[11px] text-amber-100">
          Renderer: <span className="font-mono">{rendererInfo.effective}</span>
          {rendererInfo.fallback ? ` (${rendererInfo.reason})` : ""}
        </div>
        <div className="pointer-events-none absolute left-3 top-11 z-20 rounded-md border border-cyan-500/30 bg-black/65 px-2 py-1 text-[11px] text-cyan-100">
          Niveau: <span className="font-mono">{currentZoomLevelLabel}</span>
        </div>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 170 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            center={mapView.center}
            zoom={mapView.zoom}
            minZoom={MIN_ZOOM} // limite le dézoom
            maxZoom={MAX_ZOOM} // zoom très fin
            translateExtent={[
              [-2200, -1400],
              [2200, 1400],
            ]}
            onMoveStart={() => {
              // Si l'utilisateur commence à drag pendant un zoom inertiel,
              // on arrête l'animation pour ne pas bloquer le pan.
              stopZoomAnimation();
              beginInteraction();
            }}
            onMove={(pos: any) => {
              emitMapInteractionEvent({ type: "dragMove", entityKind: "map", entityId: "map-root", mode });
              const c = (pos?.coordinates ?? mapView.center) as [number, number];
              const z = clampZoom(Number(pos?.zoom ?? mapView.zoom));
              zoomTargetRef.current = z;
              pendingMoveRef.current = { center: c, zoom: z };
              if (moveRafRef.current != null) return;
              moveRafRef.current = requestAnimationFrame(() => {
                moveRafRef.current = null;
                if (!pendingMoveRef.current) return;
                commitView(pendingMoveRef.current);
              });
            }}
            onMoveEnd={(pos: any) => {
              // Sync du center/zoom si l'utilisateur pan (drag) ou pinche sur mobile.
              // pos: { coordinates: [lon, lat], zoom }
              const c = (pos?.coordinates ?? mapView.center) as [number, number];
              const z = clampZoom(Number(pos?.zoom ?? mapView.zoom));
              zoomTargetRef.current = z;
              if (moveRafRef.current != null) {
                cancelAnimationFrame(moveRafRef.current);
                moveRafRef.current = null;
              }
              pendingMoveRef.current = null;
              commitView({ center: c, zoom: z });
              endInteractionWithSettle();
            }}
          >
            {/* Océan bleu "carte ancienne" + grain parchemin léger */}
            <rect
              x={-5000}
              y={-5000}
              width={10000}
              height={10000}
              fill={isInteractionLite || reduceHeavyEffects ? "#86b8d1" : "#7fb4cf"}
            />
            <g>
              {/* Hydro (décor) */}
              {hydro?.lakes && !isZeroSvgSpike && (
                <g
                  style={{
                    pointerEvents: "none",
                    // Lacs : alignés sur les rivières (fade + lock à fort zoom).
                    opacity:
                      lakesLocked
                        ? 1
                        : isInteractionLite || isMobilePerf || reduceHeavyEffects
                          ? Math.max(0.14, lakesOpacity * 0.25)
                          : lakesOpacity,
                    transition: lakesLocked || prefersReducedMotion ? "none" : "opacity 200ms ease-out",
                  }}
                >
                  {(lakesLocked || showHydro) && renderedLakes}
                </g>
              )}

              {/* Rivières : sous les provinces et marqueurs pour ne pas passer au travers des icônes */}
              {hydro?.rivers && !isZeroSvgSpike && (
                <g
                  style={{
                    opacity:
                      riversLocked
                        ? 1
                        : isInteractionLite || isMobilePerf || reduceHeavyEffects
                          ? Math.max(0.16, riversOpacity * 0.3)
                          : riversOpacity,
                    transition: riversLocked || prefersReducedMotion ? "none" : "opacity 200ms ease-out",
                    pointerEvents: "none",
                  }}
                >
                  {(riversLocked || showRivers) && renderedRivers}
                </g>
              )}

              {/* Provinces (régions) : DOIVENT être sous les marqueurs */}
              {renderedRegions}
              <g opacity={isInteractionLite || reduceHeavyEffects ? 0.38 : 1}>{renderedRealmBoundaries}</g>

              {/* Routes (tracés sinueux entre villes) — config dédiée (opacité, taille, progressivité) */}
              {!isWebglRenderer && activeZoomRules.visibility.routes && visibleRoutePaths.length > 0 && !isZeroSvgSpike && (
                <g opacity={routeRenderOpacity} style={{ pointerEvents: "auto" }}>
                  {useRouteBatchSvg && (
                    <RouteBatchSvgLayer
                      paths={visibleRoutePaths}
                      routeTierStyle={routeTierStyle}
                      routeSizeFactor={routeSizeFactor}
                      opacity={1}
                    />
                  )}
                  {visibleRoutePaths.map((rp) => {
                    const style = routeTierStyle[(rp.tier as RouteTier) ?? "local"] ?? routeTierStyle.local;
                    const visibleStroke = style.strokeWidth * routeSizeFactor;
                    const labelFontSize = (displayConfig.routeLabelFontSizePx ?? 0.25) * routeSizeFactor;
                    return (
                      <g key={rp.id}>
                        {useRouteBatchSvg ? (
                          <path
                            d={rp.d}
                            fill="none"
                            stroke="rgba(0,0,0,0.02)"
                            strokeWidth={14}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ cursor: "pointer", pointerEvents: "stroke" }}
                            onClick={() => {
                              const route = (routes ?? []).find((r) => r.id === rp.id);
                              setPublicInfoPanel({
                                kind: "route",
                                title: route?.name?.trim() || rp.name,
                                lines: [
                                  `Type: ${ROUTE_TIER_LABELS[(route?.tier as RouteTier) ?? "local"] ?? route?.tier ?? "Route"}`,
                                  route?.distance_km ? `Distance: ${Math.round(route.distance_km)} km` : "Distance: inconnue",
                                ],
                              });
                            }}
                          />
                        ) : (
                          <path
                            d={rp.d}
                            fill="none"
                            stroke={style.stroke}
                            strokeWidth={visibleStroke}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ cursor: "pointer", pointerEvents: "all" }}
                            data-route-id={mode === "mj" ? rp.id : undefined}
                            onClick={() => {
                              if (mode === "mj") {
                                if (!selectingEndpoint) setSelectedRouteId(rp.id);
                                return;
                              }
                              const route = (routes ?? []).find((r) => r.id === rp.id);
                              setPublicInfoPanel({
                                kind: "route",
                                title: route?.name?.trim() || rp.name,
                                lines: [
                                  `Type: ${ROUTE_TIER_LABELS[(route?.tier as RouteTier) ?? "local"] ?? route?.tier ?? "Route"}`,
                                  route?.distance_km ? `Distance: ${Math.round(route.distance_km)} km` : "Distance: inconnue",
                                ],
                              });
                            }}
                          />
                        )}
                        {labelFontSize > 0 && routeLabelAllowSet.has(rp.id) && (
                          <text
                            className="map-label-font"
                            x={rp.labelX}
                            y={rp.labelY}
                            fill="rgba(220, 200, 160, 0.95)"
                            fontSize={labelFontSize}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${rp.labelAngleDeg} ${rp.labelX} ${rp.labelY})`}
                            style={{ cursor: "pointer", pointerEvents: "all", fontFamily: "\"MiddleEarthMap\", serif" }}
                            onClick={() => {
                              if (mode === "mj") {
                                setSelectedRouteId(rp.id);
                                return;
                              }
                              const route = (routes ?? []).find((r) => r.id === rp.id);
                              setPublicInfoPanel({
                                kind: "route",
                                title: route?.name?.trim() || rp.name,
                                lines: [
                                  `Type: ${ROUTE_TIER_LABELS[(route?.tier as RouteTier) ?? "local"] ?? route?.tier ?? "Route"}`,
                                  route?.distance_km ? `Distance: ${Math.round(route.distance_km)} km` : "Distance: inconnue",
                                ],
                              });
                            }}
                          >
                            {rp.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Objets (villes/bâtiments) */}
              {!isWebglRenderer && !isZeroSvgSpike && visibleObjectsInView.map((o) => (
                <MarkerAny key={`obj-${o.id}`} coordinates={[o.lon as number, o.lat as number]}>
                  <g
                    opacity={0.85}
                    transform={`scale(${activeZoomRules.scale.entities})`}
                    data-poi-id={mode === "mj" ? o.id : undefined}
                    style={{ pointerEvents: mode === "mj" ? "all" : "none", cursor: mode === "mj" ? "pointer" : "default" }}
                  >
                    {o.icon_key === "fort" ? (
                      <path
                        d="M-4 6 V-2 L-2 -4 L0 -2 L2 -4 L4 -2 V6 Z"
                        fill="rgba(120, 78, 42, 0.75)"
                        stroke="rgba(50, 35, 20, 0.35)"
                        strokeWidth="0.6"
                      />
                    ) : o.icon_key === "city" ? (
                      <path
                        d="M-5 6 V0 L0 -5 L5 0 V6 Z"
                        fill="rgba(150, 96, 46, 0.70)"
                        stroke="rgba(50, 35, 20, 0.35)"
                        strokeWidth="0.6"
                      />
                    ) : (
                      <circle cx={0} cy={0} r={3.6} fill="rgba(150, 96, 46, 0.55)" stroke="rgba(50, 35, 20, 0.30)" strokeWidth="0.6" />
                    )}
                  </g>
                  <title>{o.name}</title>
                </MarkerAny>
              ))}

              {/* Villes (entités) — hitbox = cercle r=5 (diamètre visuel de la boîte 10×10) */}
              {!isWebglRenderer && !isZeroSvgSpike && visibleCitiesInView.map((c) => (
                <MarkerAny key={`city-${c.id}`} coordinates={[c.lon, c.lat]}>
                  {(() => {
                    const cityScale = cityScaleFactorFor(c);
                    return (
                      <g
                        opacity={citiesRenderOpacity}
                        style={{ pointerEvents: "none" }}
                        data-city-id={mode === "mj" ? c.id : undefined}
                      >
                        <g transform={`scale(${cityMarkerScale * cityScale})`}>
                          <circle
                            cx={0}
                            cy={0}
                            r={5}
                            fill="transparent"
                            style={{
                              pointerEvents: citiesOpacity > 0.001 ? "all" : "none",
                              cursor: "pointer",
                              stroke: mjUi.debugCityHitboxes ? "rgba(239,68,68,0.95)" : "transparent",
                              strokeWidth: mjUi.debugCityHitboxes ? 0.8 : 0,
                            }}
                            onClick={(e: any) => openCityPanel(e, c.id)}
                          />
                          {typeof c.icon_key === "string" && c.icon_key.startsWith("http") ? (
                            <image
                              href={c.icon_key}
                              x={-5}
                              y={-5}
                              width={10}
                              height={10}
                              preserveAspectRatio="none"
                              style={{ pointerEvents: "none", opacity: 1 }}
                            />
                          ) : c.icon_key === "castle" ? (
                            <path
                              d="M-4 6 V-2 L-2 -4 L0 -2 L2 -4 L4 -2 V6 Z"
                              fill="rgba(235, 192, 120, 1)"
                              stroke="rgba(20, 12, 6, 0.55)"
                              strokeWidth="0.9"
                              style={{ pointerEvents: "none" }}
                            />
                          ) : c.icon_key === "city" ? (
                            <path
                              d="M-5 6 V0 L0 -5 L5 0 V6 Z"
                              fill="rgba(235, 192, 120, 1)"
                              stroke="rgba(20, 12, 6, 0.55)"
                              strokeWidth="0.9"
                              style={{ pointerEvents: "none" }}
                            />
                          ) : c.icon_key === "village" ? (
                            <circle
                              cx={0}
                              cy={0}
                              r={3.1}
                              fill="rgba(235, 192, 120, 1)"
                              stroke="rgba(20, 12, 6, 0.55)"
                              strokeWidth="0.9"
                              style={{ pointerEvents: "none" }}
                            />
                          ) : (
                            <circle
                              cx={0}
                              cy={0}
                              r={3.8}
                              fill="rgba(235, 192, 120, 1)"
                              stroke="rgba(20, 12, 6, 0.55)"
                              strokeWidth="0.9"
                              style={{ pointerEvents: "none" }}
                            />
                          )}
                          {provinceCapitalCityIds.has(c.id) && (
                            <circle
                              cx={0}
                              cy={0}
                              r={5.7}
                              fill="none"
                              stroke="rgba(253, 224, 71, 0.95)"
                              strokeWidth={0.8}
                              style={{ pointerEvents: "none" }}
                            />
                          )}
                          {realmCapitalCityIds.has(c.id) && (
                            <circle
                              cx={0}
                              cy={0}
                              r={7.2}
                              fill="none"
                              stroke="rgba(250, 204, 21, 0.95)"
                              strokeWidth={1}
                              style={{ pointerEvents: "none" }}
                            />
                          )}
                          {/* Nom de la ville : même zoom/fade que l’icône (réglage taille = cityLabelFontSizePx) */}
                          <text
                            className="map-label-font"
                            y={6}
                            textAnchor="middle"
                            fill="rgba(220, 200, 160, 0.95)"
                            fontSize={2.5 * ((displayConfig.cityLabelFontSizePx ?? 10) / 10)}
                            style={{ pointerEvents: "none", fontFamily: "\"MiddleEarthMap\", serif" }}
                          >
                            {c.name}
                          </text>
                        </g>
                      </g>
                    );
                  })()}
                  <title>{c.name}</title>
                </MarkerAny>
              ))}

            </g>

              {/*
               * Mode WebGL rollout : les routes restent en SVG (stroke natif), hors fantasyGlow.
               * La triangulation WebGL en quads produisait des artefacts énormes (échelle / micro-segments).
               */}
              {isWebglRenderer && activeZoomRules.visibility.routes && visibleRoutePaths.length > 0 && !isZeroSvgSpike && (
                <g opacity={routeRenderOpacity} style={{ pointerEvents: "auto" }}>
                  {visibleRoutePaths.map((rp) => {
                    const style = routeTierStyle[(rp.tier as RouteTier) ?? "local"] ?? routeTierStyle.local;
                    const visibleStroke = style.strokeWidth * routeSizeFactor;
                    const labelFontSize = (displayConfig.routeLabelFontSizePx ?? 0.25) * routeSizeFactor;
                    return (
                      <g key={`wgl-route-${rp.id}`}>
                        <path
                          d={rp.d}
                          fill="none"
                          stroke={style.stroke}
                          strokeWidth={visibleStroke}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ cursor: "pointer", pointerEvents: "all" }}
                          data-route-id={mode === "mj" ? rp.id : undefined}
                          onClick={() => {
                            if (mode === "mj") {
                              if (!selectingEndpoint) setSelectedRouteId(rp.id);
                              return;
                            }
                            const route = (routes ?? []).find((r) => r.id === rp.id);
                            setPublicInfoPanel({
                              kind: "route",
                              title: route?.name?.trim() || rp.name,
                              lines: [
                                `Type: ${ROUTE_TIER_LABELS[(route?.tier as RouteTier) ?? "local"] ?? route?.tier ?? "Route"}`,
                                route?.distance_km ? `Distance: ${Math.round(route.distance_km)} km` : "Distance: inconnue",
                              ],
                            });
                          }}
                        />
                        {labelFontSize > 0 && routeLabelAllowSet.has(rp.id) && (
                          <text
                            className="map-label-font"
                            x={rp.labelX}
                            y={rp.labelY}
                            fill="rgba(220, 200, 160, 0.95)"
                            fontSize={labelFontSize}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={`rotate(${rp.labelAngleDeg} ${rp.labelX} ${rp.labelY})`}
                            style={{ cursor: "pointer", pointerEvents: "all", fontFamily: "\"MiddleEarthMap\", serif" }}
                            onClick={() => {
                              if (mode === "mj") {
                                setSelectedRouteId(rp.id);
                                return;
                              }
                              const route = (routes ?? []).find((r) => r.id === rp.id);
                              setPublicInfoPanel({
                                kind: "route",
                                title: route?.name?.trim() || rp.name,
                                lines: [
                                  `Type: ${ROUTE_TIER_LABELS[(route?.tier as RouteTier) ?? "local"] ?? route?.tier ?? "Route"}`,
                                  route?.distance_km ? `Distance: ${Math.round(route.distance_km)} km` : "Distance: inconnue",
                                ],
                              });
                            }}
                          >
                            {rp.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {isWebglRenderer &&
                !isZeroSvgSpike &&
                visibleObjectsInView.map((o) => (
                  <MarkerAny key={`obj-wgl-${o.id}`} coordinates={[o.lon as number, o.lat as number]}>
                    <g
                      opacity={0.85}
                      transform={`scale(${activeZoomRules.scale.entities})`}
                      data-poi-id={mode === "mj" ? o.id : undefined}
                      style={{ pointerEvents: mode === "mj" ? "all" : "none", cursor: mode === "mj" ? "pointer" : "default" }}
                    >
                      {o.icon_key === "fort" ? (
                        <path
                          d="M-4 6 V-2 L-2 -4 L0 -2 L2 -4 L4 -2 V6 Z"
                          fill="rgba(120, 78, 42, 0.75)"
                          stroke="rgba(50, 35, 20, 0.35)"
                          strokeWidth="0.6"
                        />
                      ) : o.icon_key === "city" ? (
                        <path
                          d="M-5 6 V0 L0 -5 L5 0 V6 Z"
                          fill="rgba(150, 96, 46, 0.70)"
                          stroke="rgba(50, 35, 20, 0.35)"
                          strokeWidth="0.6"
                        />
                      ) : (
                        <circle cx={0} cy={0} r={3.6} fill="rgba(150, 96, 46, 0.55)" stroke="rgba(50, 35, 20, 0.30)" strokeWidth="0.6" />
                      )}
                    </g>
                    <title>{o.name}</title>
                  </MarkerAny>
                ))}

              {isWebglRenderer &&
                !isZeroSvgSpike &&
                visibleCitiesInView.map((c) => (
                  <MarkerAny key={`city-wgl-${c.id}`} coordinates={[c.lon, c.lat]}>
                    {(() => {
                      const cityScale = cityScaleFactorFor(c);
                      return (
                        <g
                          opacity={citiesRenderOpacity}
                          style={{ pointerEvents: "none" }}
                          data-city-id={mode === "mj" ? c.id : undefined}
                        >
                          <g transform={`scale(${cityMarkerScale * cityScale})`}>
                            <circle
                              cx={0}
                              cy={0}
                              r={5}
                              fill="transparent"
                              style={{
                                pointerEvents: citiesOpacity > 0.001 ? "all" : "none",
                                cursor: "pointer",
                                stroke: mjUi.debugCityHitboxes ? "rgba(239,68,68,0.95)" : "transparent",
                                strokeWidth: mjUi.debugCityHitboxes ? 0.8 : 0,
                              }}
                              onClick={(e: any) => openCityPanel(e, c.id)}
                            />
                            {typeof c.icon_key === "string" && c.icon_key.startsWith("http") ? (
                              <image
                                href={c.icon_key}
                                x={-5}
                                y={-5}
                                width={10}
                                height={10}
                                preserveAspectRatio="none"
                                style={{ pointerEvents: "none", opacity: 1 }}
                              />
                            ) : c.icon_key === "castle" ? (
                              <path
                                d="M-4 6 V-2 L-2 -4 L0 -2 L2 -4 L4 -2 V6 Z"
                                fill="rgba(235, 192, 120, 1)"
                                stroke="rgba(20, 12, 6, 0.55)"
                                strokeWidth="0.9"
                                style={{ pointerEvents: "none" }}
                              />
                            ) : c.icon_key === "city" ? (
                              <path
                                d="M-5 6 V0 L0 -5 L5 0 V6 Z"
                                fill="rgba(235, 192, 120, 1)"
                                stroke="rgba(20, 12, 6, 0.55)"
                                strokeWidth="0.9"
                                style={{ pointerEvents: "none" }}
                              />
                            ) : c.icon_key === "village" ? (
                              <circle
                                cx={0}
                                cy={0}
                                r={3.1}
                                fill="rgba(235, 192, 120, 1)"
                                stroke="rgba(20, 12, 6, 0.55)"
                                strokeWidth="0.9"
                                style={{ pointerEvents: "none" }}
                              />
                            ) : (
                              <circle
                                cx={0}
                                cy={0}
                                r={3.8}
                                fill="rgba(235, 192, 120, 1)"
                                stroke="rgba(20, 12, 6, 0.55)"
                                strokeWidth="0.9"
                                style={{ pointerEvents: "none" }}
                              />
                            )}
                            {provinceCapitalCityIds.has(c.id) && (
                              <circle
                                cx={0}
                                cy={0}
                                r={5.7}
                                fill="none"
                                stroke="rgba(253, 224, 71, 0.95)"
                                strokeWidth={0.8}
                                style={{ pointerEvents: "none" }}
                              />
                            )}
                            {realmCapitalCityIds.has(c.id) && (
                              <circle
                                cx={0}
                                cy={0}
                                r={7.2}
                                fill="none"
                                stroke="rgba(250, 204, 21, 0.95)"
                                strokeWidth={1}
                                style={{ pointerEvents: "none" }}
                              />
                            )}
                            <text
                              className="map-label-font"
                              y={6}
                              textAnchor="middle"
                              fill="rgba(220, 200, 160, 0.95)"
                              fontSize={2.5 * ((displayConfig.cityLabelFontSizePx ?? 10) / 10)}
                              style={{ pointerEvents: "none", fontFamily: "\"MiddleEarthMap\", serif" }}
                            >
                              {c.name}
                            </text>
                          </g>
                        </g>
                      );
                    })()}
                    <title>{c.name}</title>
                  </MarkerAny>
                ))}
              {!isZeroSvgSpike &&
                realmLabelAnchors.slice(0, isInteractionLite || reduceHeavyEffects ? 12 : realmLabelAnchors.length).map((r) => (
                <MarkerAny key={`realm-label-${r.realmId}`} coordinates={[r.lon, r.lat]}>
                  <text
                    className="map-label-font"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isInteractionLite || reduceHeavyEffects ? "rgba(236, 225, 188, 0.68)" : "rgba(236, 225, 188, 0.92)"}
                    fontSize={renderZoomLevel === "monde" ? 4.2 : 5.2}
                    transform={`rotate(${r.angleDeg})`}
                    style={{
                      pointerEvents: "none",
                      paintOrder: "stroke",
                      stroke: "rgba(18, 14, 9, 0.75)",
                      strokeWidth: 0.9,
                      fontFamily: "\"MiddleEarthMap\", serif",
                    }}
                  >
                    {r.name}
                  </text>
                </MarkerAny>
              ))}

              {/* Prévisualisation placement Ville */}
              {placingCity?.active && Number.isFinite(placingCity.previewLon) && Number.isFinite(placingCity.previewLat) && (
                <MarkerAny key="city-preview" coordinates={[placingCity.previewLon, placingCity.previewLat]}>
                  <g opacity={citiesRenderOpacity * (placingCity.isSubmitting ? 0.45 : 1)}>
                    {typeof placingCity.iconKey === "string" && placingCity.iconKey.startsWith("http") ? (
                      <g transform={`scale(${cityMarkerScale * Math.max(0.1, Math.min(4, placingCity.iconScalePct / 100))})`}>
                        <image
                          href={placingCity.iconKey}
                          x={-5}
                          y={-5}
                          width={10}
                          height={10}
                          preserveAspectRatio="none"
                          style={{ opacity: 1 }}
                        />
                      </g>
                    ) : (
                      <g transform={`scale(${cityMarkerScale * Math.max(0.1, Math.min(4, placingCity.iconScalePct / 100))})`}>
                        {placingCity.iconKey === "castle" ? (
                          <path
                            d="M-4 6 V-2 L-2 -4 L0 -2 L2 -4 L4 -2 V6 Z"
                            fill="rgba(34, 197, 94, 1)"
                            stroke="rgba(0, 0, 0, 0.55)"
                            strokeWidth="0.9"
                          />
                        ) : placingCity.iconKey === "city" ? (
                          <path
                            d="M-5 6 V0 L0 -5 L5 0 V6 Z"
                            fill="rgba(34, 197, 94, 1)"
                            stroke="rgba(0, 0, 0, 0.55)"
                            strokeWidth="0.9"
                          />
                        ) : placingCity.iconKey === "village" ? (
                          <circle cx={0} cy={0} r={3.1} fill="rgba(34, 197, 94, 1)" stroke="rgba(34, 197, 94, 0.95)" strokeWidth="0.6" />
                        ) : (
                          <circle cx={0} cy={0} r={3.8} fill="rgba(34, 197, 94, 1)" stroke="rgba(34, 197, 94, 0.95)" strokeWidth="0.6" />
                        )}
                      </g>
                    )}
                  </g>
                  <title>{placingCity.name}</title>
                </MarkerAny>
              )}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Panneau d'information public (toujours visible à l'écran) */}
      {enableMapInfoPanelsV2 && mode === "public" && publicInfoPanel && (
        <EntityInfoPanel
          kind={publicInfoPanel.kind}
          title={publicInfoPanel.title}
          lines={publicInfoPanel.lines}
          onClose={() => setPublicInfoPanel(null)}
        />
      )}

      {/* Pop-in Ville (MVP) */}
      {mode === "mj" && cityPanel.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCityPanel({ open: false, cityId: "" })}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-[#0f0b07]/95 p-3 text-stone-100 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const city = cityById.get(cityPanel.cityId) ?? null;
              if (!city) {
                return (
                  <>
                    <p className="font-semibold text-amber-100">Ville introuvable</p>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                      onClick={() => setCityPanel({ open: false, cityId: "" })}
                    >
                      Fermer
                    </button>
                  </>
                );
              }

              const realmName = realmById.get(city.realm_id)?.name ?? city.realm_id;
              const provinceName =
                provinces.find((p) => p.id === city.province_id)?.name ?? city.province_id;

              return (
                <>
                  <h2 className="font-serif text-base font-semibold text-amber-100">{city.name}</h2>

                  <div className="mt-2 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => toggleCityPanelSection("infos")}
                      className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-amber-100 hover:bg-white/5"
                    >
                      <span>Infos</span>
                      <span aria-hidden>{cityPanelSections.infos ? "▼" : "▶"}</span>
                    </button>
                    {cityPanelSections.infos && (
                      <p className="pb-2 pl-1 text-xs text-stone-300">
                        Royaume : <span className="font-semibold text-stone-100/90">{realmName}</span>
                        {" · "}
                        Province : <span className="font-semibold text-stone-100/90">{provinceName}</span>
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleCityPanelSection("icon-size")}
                      className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-stone-200 hover:bg-white/5"
                    >
                      <span>Taille de l'icône</span>
                      <span aria-hidden>{cityPanelSections["icon-size"] ? "▼" : "▶"}</span>
                    </button>
                    {cityPanelSections["icon-size"] && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-1">
                    <p className="text-xs font-semibold text-amber-100">Taille de l'icône</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={10}
                        max={400}
                        value={cityScaleEditPct}
                        onChange={(e) => setCityScaleEditPct(Math.max(10, Math.min(400, Number(e.target.value) || 100)))}
                        className="w-full"
                      />
                      <span className="w-12 text-right text-xs text-stone-100 tabular-nums">{cityScaleEditPct}%</span>
    </div>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10 disabled:opacity-60"
                      disabled={!mjUpdateCityIconScale}
                      onClick={async () => {
                        if (!mjUpdateCityIconScale) return;
                        const res = await mjUpdateCityIconScale({ cityId: city.id, iconScalePct: cityScaleEditPct });
                        if (res.error) {
                          setCityDeleteError(res.error);
                          return;
                        }
                        router.refresh();
                      }}
                    >
                      Enregistrer la taille de l'icône
                    </button>
                  </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleCityPanelSection("buildings")}
                      className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-stone-200 hover:bg-white/5"
                    >
                      <span>Bâtiments</span>
                      <span aria-hidden>{cityPanelSections.buildings ? "▼" : "▶"}</span>
                    </button>
                    {cityPanelSections.buildings && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-1">
                    <p className="text-xs font-semibold text-amber-100">Bâtiments</p>
                    <p className="mt-1 text-xs text-stone-300">MVP : ajout manuel d’un bâtiment (pas encore de liste).</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="text-xs text-stone-300">
                        Type
                        <input
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                          defaultValue="taverne"
                          onChange={(e) =>
                            setCityBuildingsPanel((prev) =>
                              prev && prev.cityId === city.id
                                ? { ...prev, kind: e.target.value, error: null }
                                : { cityId: city.id, kind: e.target.value, level: 1, isSubmitting: false, error: null }
                            )
                          }
                        />
                      </label>
                      <label className="text-xs text-stone-300">
                        Niveau
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-stone-100"
                          defaultValue={1}
                          onChange={(e) =>
                            setCityBuildingsPanel((prev) =>
                              prev && prev.cityId === city.id
                                ? { ...prev, level: Number(e.target.value) || 1, error: null }
                                : { cityId: city.id, kind: "taverne", level: Number(e.target.value) || 1, isSubmitting: false, error: null }
                            )
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-60"
                      disabled={cityBuildingsPanel?.isSubmitting}
                      onClick={async () => {
                        // Branché via Server Action (MJ).
                        const action = mjCreateCityBuilding;
                        if (!action) {
                          setCityBuildingsPanel((prev) =>
                            prev ? { ...prev, error: "Action MJ non disponible." } : prev
                          );
                          return;
                        }
                        const panel = cityBuildingsPanel?.cityId === city.id ? cityBuildingsPanel : null;
                        const kind = (panel?.kind ?? "taverne").trim();
                        const level = Number(panel?.level ?? 1) || 1;
                        if (!kind) {
                          setCityBuildingsPanel((prev) =>
                            prev ? { ...prev, error: "Veuillez saisir un type de bâtiment." } : prev
                          );
                          return;
                        }
                        setCityBuildingsPanel((prev) =>
                          prev ? { ...prev, isSubmitting: true, error: null } : prev
                        );
                        try {
                          const res = await action({ cityId: city.id, kind, level });
                          if (res.error) {
                            setCityBuildingsPanel((prev) =>
                              prev ? { ...prev, isSubmitting: false, error: res.error ?? "Erreur inconnue." } : prev
                            );
                            return;
                          }
                          setCityBuildingsPanel((prev) =>
                            prev ? { ...prev, isSubmitting: false, error: null } : prev
                          );
                          router.refresh();
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          setCityBuildingsPanel((prev) =>
                            prev ? { ...prev, isSubmitting: false, error: msg || "Erreur inconnue." } : prev
                          );
                        }
                      }}
                    >
                      Ajouter le bâtiment (MVP)
                    </button>

                    {cityBuildingsPanel?.cityId === city.id && cityBuildingsPanel.error && (
                      <p className="mt-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                        {cityBuildingsPanel.error}
                      </p>
                    )}
                  </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleCityPanelSection("routes")}
                      className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-stone-200 hover:bg-white/5"
                    >
                      <span>Routes</span>
                      <span aria-hidden>{cityPanelSections.routes ? "▼" : "▶"}</span>
                    </button>
                    {cityPanelSections.routes && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-1">
                    <p className="text-xs font-semibold text-amber-100">Routes</p>
                    {(() => {
                      const cityRoutes = (routes ?? []).filter(
                        (r) => r.city_a_id === city.id || r.city_b_id === city.id
                      );
                      const otherCity = (r: { city_a_id: string | null; city_b_id: string | null }) => {
                        const otherId = r.city_a_id === city.id ? r.city_b_id : r.city_a_id;
                        return otherId ? cityById.get(otherId) : undefined;
                      };
                      return (
                        <>
                          {cityRoutes.length === 0 ? (
                            <p className="mt-1 text-xs text-stone-400">Aucune route pour l’instant.</p>
                          ) : (
                            <>
                            <ul className="mt-2 space-y-1">
                              {cityRoutes.map((r) => (
                                <li key={r.id} className="flex items-center justify-between gap-2 text-xs text-stone-300">
                                  <span>
                                    <span className="font-medium text-stone-100">{r.name}</span>
                                    {" — "}
                                    {ROUTE_TIER_LABELS[r.tier as RouteTier] ?? r.tier}
                                    {otherCity(r) && (
                                      <>
                                        {" vers "}
                                        <span className="text-stone-100">{otherCity(r)!.name}</span>
                                      </>
                                    )}
                                    {r.distance_km != null && (
                                      <span className="ml-1 text-stone-500">
                                        ({Math.round(r.distance_km)} km)
                                      </span>
                                    )}
                                  </span>
                                  {mjDeleteRoute && (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded border border-red-500/30 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                                      disabled={routeDeleteSubmitting === r.id}
                                      onClick={async () => {
                                        if (!mjDeleteRoute) return;
                                        setRouteDeleteSubmitting(r.id);
                                        setRouteDeleteError(null);
                                        try {
                                          const res = await mjDeleteRoute({ routeId: r.id });
                                          if (res.error) setRouteDeleteError(res.error);
                                          else router.refresh();
                                        } finally {
                                          setRouteDeleteSubmitting(null);
                                        }
                                      }}
                                    >
                                      {routeDeleteSubmitting === r.id ? "..." : "Suppr."}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {routeDeleteError && (
                              <p className="mt-1 text-[11px] text-red-300">{routeDeleteError}</p>
                            )}
                            </>
                          )}
                          {mjCreateRoute && (
                            <div className="mt-3 flex flex-col gap-1.5">
                              <button
                                type="button"
                                className="w-full rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-800/40 disabled:opacity-60"
                                onClick={() => {
                                  setCreateRouteState({
                                    fromCityId: city.id,
                                    toCityId: undefined,
                                    name: "",
                                    tier: "regional",
                                    isSubmitting: false,
                                    error: null,
                                  });
                                  setCreateRouteModalOpen(true);
                                }}
                              >
                                Créer une route depuis cette ville
                              </button>
                              <button
                                type="button"
                                className="w-full rounded-lg border border-emerald-500/40 bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/40"
                                onClick={() => {
                                  setCityPanel({ open: false, cityId: "" });
                                  setSelectingEndpoint({ step: "from" });
                                }}
                              >
                                Créer une route : choisir départ et arrivée sur la carte
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                    )}

                    {mjAddPathwayPointToRoute && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleCityPanelSection("nav-point")}
                          className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-stone-200 hover:bg-white/5"
                        >
                          <span>Nouveau point de navigation</span>
                          <span aria-hidden>{cityPanelSections["nav-point"] ? "▼" : "▶"}</span>
                        </button>
                        {cityPanelSections["nav-point"] && (
                          <div className="rounded-lg border border-white/10 bg-black/30 p-2 pl-1">
                            <p className="text-xs font-semibold text-amber-100">Forcer un détour par cette ville</p>
                            <p className="mt-1 text-[11px] text-stone-400">Ajoute cette ville comme point de passage sur une route existante.</p>
                            <label className="mt-2 block text-[11px] text-stone-400">
                              Route
                              <select
                                className="mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-stone-100"
                                value={pathwayNavState.routeId}
                                onChange={(e) => setPathwayNavState((p) => ({ ...p, routeId: e.target.value, error: null }))}
                              >
                                <option value="">— Choisir une route —</option>
                                {(routes ?? [])
                                  .filter((r) => r.city_a_id != null && r.city_b_id != null)
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {(r as { name?: string }).name?.trim() || r.id}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label className="mt-2 block text-[11px] text-stone-400">
                              Position
                              <select
                                className="mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-stone-100"
                                value={pathwayNavState.insertPosition}
                                onChange={(e) =>
                                  setPathwayNavState((p) => ({
                                    ...p,
                                    insertPosition: e.target.value as "start" | "middle" | "end",
                                    error: null,
                                  }))
                                }
                              >
                                <option value="start">Après le départ</option>
                                <option value="middle">Au milieu</option>
                                <option value="end">Avant l&apos;arrivée</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className="mt-3 w-full rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-800/40 disabled:opacity-60 disabled:opacity-50"
                              disabled={!pathwayNavState.routeId || pathwayNavState.isSubmitting}
                              onClick={async () => {
                                if (!mjAddPathwayPointToRoute || !pathwayNavState.routeId) return;
                                setPathwayNavState((p) => ({ ...p, isSubmitting: true, error: null }));
                                try {
                                  const res = await mjAddPathwayPointToRoute({
                                    routeId: pathwayNavState.routeId,
                                    lat: city.lat,
                                    lon: city.lon,
                                    insertPosition: pathwayNavState.insertPosition,
                                  });
                                  if (res.error) {
                                    setPathwayNavState((p) => ({ ...p, isSubmitting: false, error: res.error ?? "Erreur." }));
                                    return;
                                  }
                                  setPathwayNavState((p) => ({ ...p, routeId: "", isSubmitting: false, error: null }));
                                  router.refresh();
                                } catch (e) {
                                  setPathwayNavState((p) => ({
                                    ...p,
                                    isSubmitting: false,
                                    error: e instanceof Error ? e.message : "Erreur inconnue.",
                                  }));
                                }
                              }}
                            >
                              {pathwayNavState.isSubmitting ? "Ajout..." : "Ajouter le point de navigation"}
                            </button>
                            {pathwayNavState.error && (
                              <p className="mt-2 rounded border border-red-500/30 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">
                                {pathwayNavState.error}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleCityPanelSection("delete")}
                      className="flex w-full items-center justify-between rounded py-1 text-left text-xs font-semibold text-stone-200 hover:bg-white/5"
                    >
                      <span>Supprimer</span>
                      <span aria-hidden>{cityPanelSections.delete ? "▼" : "▶"}</span>
                    </button>
                    {cityPanelSections.delete && (
                  <>
                  {cityDeleteError && (
                    <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                      {cityDeleteError}
                    </p>
                  )}

                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-rose-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-rose-500 disabled:opacity-60"
                    disabled={!mjDeleteCity}
                    onClick={async () => {
                      if (!mjDeleteCity) return;
                      setCityDeleteError(null);
                      const res = await mjDeleteCity({ cityId: city.id });
                      if (res.error) {
                        setCityDeleteError(res.error ?? "Erreur inconnue.");
                        return;
                      }
                      setCityPanel({ open: false, cityId: "" });
                      router.refresh();
                    }}
                  >
                    Supprimer la ville
                  </button>
                  </>
                    )}
                  </div>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                    onClick={() => setCityPanel({ open: false, cityId: "" })}
                  >
                    Fermer
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal : Créer une route (départ/arrivée = ville ou point sur une route, liste ou clic carte) */}
      {mode === "mj" && createRouteModalOpen && createRouteState && (() => {
        const fromPathway = !!createRouteState.fromPathwayPointId;
        const fromPoi = createRouteState.fromPoiId ? (mapObjects ?? []).find((x) => x.id === createRouteState.fromPoiId) : null;
        const fromCity = createRouteState.fromCityId ? cityById.get(createRouteState.fromCityId) : null;
        const toPathway = !!createRouteState.toPathwayPointId;
        const toPoi = createRouteState.toPoiId ? (mapObjects ?? []).find((x) => x.id === createRouteState.toPoiId) : null;
        const toCity = createRouteState.toCityId ? cityById.get(createRouteState.toCityId) : null;
        const toChosenByClick = createRouteState.toCityId != null || createRouteState.toPathwayPointId != null || createRouteState.toPoiId != null;
        const fromLabel = fromPathway ? "Point sur une route" : fromPoi ? fromPoi.name : (fromCity?.name ?? "Ville");
        const toLabel = toPathway ? "Point sur une route" : toPoi ? toPoi.name : (toCity?.name ?? "Ville");

        const validCities = filterCitiesWithValidCoords(cities ?? []);
        const fromPoint = fromPathway ? null : fromPoi && Number.isFinite(fromPoi.lon) && Number.isFinite(fromPoi.lat) ? { lon: fromPoi.lon!, lat: fromPoi.lat! } : fromCity;
        const withDistance = fromPoint
          ? validCities
              .filter((c) => !fromCity || c.id !== fromCity.id)
              .map((c) => ({
                city: c,
                km: geoDistanceKm({ lon: fromPoint.lon, lat: fromPoint.lat }, { lon: c.lon, lat: c.lat }),
              }))
          : validCities.map((c) => ({ city: c, km: 0 }));
        withDistance.sort((a, b) => a.km - b.km);
        const selectedOther = createRouteState.toCityId ? withDistance.find((x) => x.city.id === createRouteState.toCityId) : null;

        const canSubmit =
          createRouteState.name.trim().length > 0 &&
          createRouteState.isSubmitting === false &&
          (createRouteState.toCityId != null || createRouteState.toPathwayPointId != null || createRouteState.toPoiId != null) &&
          (!selectedOther || selectedOther.km <= maxRouteKm);

        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            onClick={() => { setCreateRouteModalOpen(false); setCreateRouteState(null); }}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-amber-500/20 bg-[#0f0b07]/98 p-3 text-stone-100 shadow-2xl backdrop-blur"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold text-amber-100">
                Créer une route — Départ : {fromLabel}
              </p>

              {toChosenByClick ? (
                <p className="mt-2 text-xs text-stone-400">Arrivée : {toLabel}</p>
              ) : (
                <div className="mt-2 flex flex-col gap-1">
                  <label className="block text-xs text-stone-300">
                    Destination (liste ou clic sur la carte : ville, entité ou route)
                  </label>
                  <div className="flex gap-1">
                    <select
                      className="flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-stone-100"
                      value={createRouteState.toCityId ?? ""}
                      onChange={(e) => {
                        const toId = e.target.value || undefined;
                        const other = toId ? withDistance.find((x) => x.city.id === toId) : null;
                        const name = other && fromCity
                          ? [fromCity.name, other.city.name].sort().join(" – ")
                          : other?.city.name ?? createRouteState?.name ?? "";
                        setCreateRouteState((prev) => prev ? { ...prev, toCityId: toId, toPathwayPointId: undefined, toPoiId: undefined, name: name || prev.name, error: null } : prev);
                      }}
                    >
                      <option value="">— Choisir —</option>
                      {withDistance.map(({ city: c, km }) => (
                        <option key={c.id} value={c.id} disabled={km > maxRouteKm}>
                          {c.name}{km > 0 ? ` — ${Math.round(km)} km` : ""}{km > maxRouteKm ? " (hors limite)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-900/40 px-2 py-1.5 text-xs text-emerald-100 hover:bg-emerald-800/50"
                      onClick={() => {
                        setCreateRouteModalOpen(false);
                        setSelectingEndpoint(
                          fromPathway && createRouteState.fromPathwayPointId
                            ? { step: "to", fromPathwayPointId: createRouteState.fromPathwayPointId }
                            : fromPoi && createRouteState.fromPoiId
                              ? { step: "to", fromPoiId: createRouteState.fromPoiId }
                              : fromCity
                                ? { step: "to", fromCityId: fromCity.id }
                                : null
                        );
                      }}
                    >
                      Carte
                    </button>
                  </div>
                </div>
              )}

              <label className="mt-2 block text-xs text-stone-300">
                Nom
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-stone-100"
                  value={createRouteState.name}
                  onChange={(e) => setCreateRouteState((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  placeholder="ex. Kzacht – Ishotii"
                />
              </label>
              <label className="mt-2 block text-xs text-stone-300">
                Tier
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-stone-100"
                  value={createRouteState.tier}
                  onChange={(e) =>
                    setCreateRouteState((prev) =>
                      prev ? { ...prev, tier: e.target.value as RouteTier } : prev
                    )
                  }
                >
                  {(["local", "regional", "national"] as const).map((t) => (
                    <option key={t} value={t}>{ROUTE_TIER_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              {createRouteState.error && (
                <p className="mt-2 rounded border border-red-500/30 bg-red-950/40 px-2 py-1 text-xs text-red-200">
                  {createRouteState.error}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-60"
                  disabled={!canSubmit}
                  onClick={async () => {
                    if (!canSubmit || !mjCreateRoute) return;
                    setCreateRouteState((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));
                    try {
                      const res = await mjCreateRoute({
                        cityAId: createRouteState.fromCityId ?? null,
                        cityBId: createRouteState.toCityId ?? null,
                        pathwayPointAId: createRouteState.fromPathwayPointId ?? null,
                        pathwayPointBId: createRouteState.toPathwayPointId ?? null,
                        poiAId: createRouteState.fromPoiId ?? null,
                        poiBId: createRouteState.toPoiId ?? null,
                        name: createRouteState.name.trim(),
                        tier: createRouteState.tier,
                      });
                      if (res.error) {
                        setCreateRouteState((prev) =>
                          prev ? { ...prev, isSubmitting: false, error: res.error ?? "" } : prev
                        );
                        return;
                      }
                      setCreateRouteState(null);
                      setCreateRouteModalOpen(false);
                      router.refresh();
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      setCreateRouteState((prev) =>
                        prev ? { ...prev, isSubmitting: false, error: msg } : prev
                      );
                    }
                  }}
                >
                  {createRouteState.isSubmitting ? "Création..." : "Créer"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                  onClick={() => { setCreateRouteModalOpen(false); setCreateRouteState(null); }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pop-in Détail route (MJ) */}
      {mode === "mj" && selectedRouteId && (() => {
        const route = routes?.find((r) => r.id === selectedRouteId);
        if (!route) return null;
        const cityA = route.city_a_id ? cityById.get(route.city_a_id) : null;
        const cityB = route.city_b_id ? cityById.get(route.city_b_id) : null;
        const tierLabel = ROUTE_TIER_LABELS[(route.tier as RouteTier) ?? "local"] ?? route.tier;
        const dist = route.distance_km != null ? `${Number(route.distance_km).toFixed(0)} km` : "—";
        const routeName = (route as { name?: string }).name?.trim() || `Route ${route.id}`;
        const poiA = (route as { poi_a_id?: string | null }).poi_a_id ? (mapObjects ?? []).find((o) => o.id === (route as any).poi_a_id) : null;
        const poiB = (route as { poi_b_id?: string | null }).poi_b_id ? (mapObjects ?? []).find((o) => o.id === (route as any).poi_b_id) : null;
        const labelA = cityA?.name ?? poiA?.name ?? "Point sur route";
        const labelB = cityB?.name ?? poiB?.name ?? "Point sur route";
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelectedRouteId(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-[#0f0b07]/95 p-4 text-stone-100 shadow-2xl backdrop-blur"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-serif text-base font-semibold text-amber-100">{routeName}</h2>
              <p className="mt-1 text-xs text-stone-300">
                {tierLabel} · {dist}
              </p>
              <p className="mt-2 text-xs text-stone-400">
                {labelA} ↔ {labelB}
              </p>
              {/* Points de passage : faire éviter la mer */}
              {(mjAddPathwayPointToRoute || mjDeletePathwayPoint) && (() => {
                const routeWaypoints = routeWaypointsMap.get(route.id) ?? [];
                const validCities = validCitiesAll;
                return (
                  <div className="mt-4 flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                    <p className="text-xs font-semibold text-amber-100">Points de passage (faire éviter la mer)</p>
                    <p className="text-[11px] text-stone-400">Ajoutez un point entre A et B pour détourner la route (par une ville ou par un clic sur la carte).</p>
                    {routeWaypoints.length > 0 && (
                      <ul className="space-y-1 text-[11px] text-stone-300">
                        {routeWaypoints.map((wp, idx) => (
                          <li key={wp.id} className="flex items-center justify-between gap-2">
                            <span>Point {idx + 1} — {Number(wp.lat).toFixed(2)}, {Number(wp.lon).toFixed(2)}</span>
                            {mjDeletePathwayPoint && (
                              <button
                                type="button"
                                className="shrink-0 rounded border border-red-500/30 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                                disabled={pathwayDeleteSubmitting === wp.id}
                                onClick={async () => {
                                  if (!mjDeletePathwayPoint) return;
                                  setPathwayDeleteSubmitting(wp.id);
                                  try {
                                    const res = await mjDeletePathwayPoint({ pathwayPointId: wp.id });
                                    if (res.error) setPathwayAddError(res.error);
                                    else router.refresh();
                                  } finally {
                                    setPathwayDeleteSubmitting(null);
                                  }
                                }}
                              >
                                {pathwayDeleteSubmitting === wp.id ? "..." : "Suppr."}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {routeWaypoints.length === 0 && <p className="text-[11px] text-stone-500">Aucun point de passage.</p>}
                    {mjAddPathwayPointToRoute && (
                      <>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <label className="text-[11px] text-stone-400">
                            Position
                            <select
                              className="mt-0.5 ml-1 rounded border border-white/10 bg-black/50 px-1.5 py-1 text-xs text-stone-100"
                              value={pathwayAddPosition}
                              onChange={(e) => { setPathwayAddPosition(e.target.value as "start" | "middle" | "end"); setPathwayAddError(null); }}
                            >
                              <option value="start">Après le départ</option>
                              <option value="middle">Au milieu</option>
                              <option value="end">Avant l&apos;arrivée</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="shrink-0 rounded border border-emerald-500/40 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-50"
                            disabled={placingPathwayPoint?.routeId === route.id || pathwayAddSubmitting}
                            onClick={() => {
                              setPathwayAddError(null);
                              setPlacingPathwayPoint({ routeId: route.id, insertPosition: pathwayAddPosition });
                            }}
                          >
                            {placingPathwayPoint?.routeId === route.id ? "Cliquez sur la carte..." : "Ajouter un point sur la carte"}
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-white/10 pt-2">
                          <label className="min-w-0 flex-1 text-[11px] text-stone-400">
                            Ou par une ville
                            <select
                              className="mt-0.5 w-full rounded border border-white/10 bg-black/50 px-1.5 py-1 text-xs text-stone-100"
                              value={pathwayAddCityId}
                              onChange={(e) => { setPathwayAddCityId(e.target.value); setPathwayAddError(null); }}
                            >
                              <option value="">— Choisir —</option>
                              {validCities.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="shrink-0 rounded border border-amber-500/40 bg-amber-900/30 px-2 py-1 text-xs text-amber-100 hover:bg-amber-800/40 disabled:opacity-50"
                            disabled={!pathwayAddCityId || pathwayAddSubmitting}
                            onClick={async () => {
                              if (!mjAddPathwayPointToRoute || !pathwayAddCityId) return;
                              const city = cityById.get(pathwayAddCityId);
                              if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lon)) return;
                              setPathwayAddSubmitting(true);
                              setPathwayAddError(null);
                              try {
                                const res = await mjAddPathwayPointToRoute({ routeId: route.id, lat: city.lat, lon: city.lon, insertPosition: pathwayAddPosition });
                                if (res.error) setPathwayAddError(res.error);
                                else { router.refresh(); setPathwayAddCityId(""); }
                              } finally {
                                setPathwayAddSubmitting(false);
                              }
                            }}
                          >
                            {pathwayAddSubmitting ? "..." : "Ajouter"}
                          </button>
                        </div>
                      </>
                    )}
                    {pathwayAddError && <p className="text-[11px] text-red-300">{pathwayAddError}</p>}
                  </div>
                );
              })()}
              {mjCreateRoute && (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-amber-100">Créer un embranchement depuis cette route</p>
                  <p className="text-[11px] text-stone-400">Créez un point sur la route, puis une nouvelle route vers une ville.</p>
                  <label className="text-[11px] text-stone-400">
                    Position sur la route : {branchPositionPct} %
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={branchPositionPct}
                      onChange={(e) => setBranchPositionPct(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </label>
                  {mjCreateBranchPointOnRoute && (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-800/40 disabled:opacity-60"
                      disabled={branchPointSubmitting}
                      onClick={async () => {
                        setBranchPointError(null);
                        setBranchPointSubmitting(true);
                        try {
                          const res = await mjCreateBranchPointOnRoute({ routeId: route.id, positionPct: branchPositionPct });
                          if (res.error) {
                            setBranchPointError(res.error);
                            setBranchPointSubmitting(false);
                            return;
                          }
                          if (res.pathwayPointId) {
                            setSelectedRouteId(null);
                            setSelectingEndpoint({ step: "to", fromPathwayPointId: res.pathwayPointId });
                          }
                        } finally {
                          setBranchPointSubmitting(false);
                        }
                      }}
                    >
                      {branchPointSubmitting ? "Création du point..." : "Créer le point puis cliquer sur la carte (ville, entité ou route) pour la destination"}
                    </button>
                  )}
                  {branchPointError && (
                    <p className="rounded border border-red-500/30 bg-red-950/40 px-2 py-1 text-xs text-red-200">{branchPointError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    {route.city_a_id && (
                      <button
                        type="button"
                        className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/10"
                        onClick={() => {
                          setSelectedRouteId(null);
                          setCityPanel({ open: true, cityId: route.city_a_id! });
                          setCreateRouteState({
                            fromCityId: route.city_a_id!,
                            toCityId: "",
                            name: "",
                            tier: (route.tier as "local" | "regional" | "national") ?? "regional",
                            isSubmitting: false,
                            error: null,
                          });
                          setCreateRouteModalOpen(true);
                        }}
                      >
                        Depuis {labelA}
                      </button>
                    )}
                    {route.city_b_id && (
                      <button
                        type="button"
                        className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/10"
                        onClick={() => {
                          setSelectedRouteId(null);
                          setCityPanel({ open: true, cityId: route.city_b_id! });
                          setCreateRouteState({
                            fromCityId: route.city_b_id!,
                            toCityId: "",
                            name: "",
                            tier: (route.tier as "local" | "regional" | "national") ?? "regional",
                            isSubmitting: false,
                            error: null,
                          });
                          setCreateRouteModalOpen(true);
                        }}
                      >
                        Depuis {labelB}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {routeDeleteError && (
                <p className="mt-2 rounded border border-red-500/30 bg-red-950/40 px-2 py-1 text-xs text-red-200">{routeDeleteError}</p>
              )}
              {mjDeleteRoute && (
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                  disabled={routeDeleteSubmitting === route.id}
                  onClick={async () => {
                    if (!mjDeleteRoute || routeDeleteSubmitting) return;
                    setRouteDeleteSubmitting(route.id);
                    setRouteDeleteError(null);
                    try {
                      const res = await mjDeleteRoute({ routeId: route.id });
                      if (res.error) setRouteDeleteError(res.error);
                      else {
                        setSelectedRouteId(null);
                        router.refresh();
                      }
                    } finally {
                      setRouteDeleteSubmitting(null);
                    }
                  }}
                >
                  {routeDeleteSubmitting === route.id ? "Suppression..." : "Supprimer la route"}
                </button>
              )}
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-100 hover:bg-white/10"
                onClick={() => { setSelectedRouteId(null); setRouteDeleteError(null); }}
              >
                Fermer
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

