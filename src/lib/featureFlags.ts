export function isRealmColoringEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REALM_COLORING_V2 !== "0";
}

export function isMapInfoPanelsV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_INFO_PANELS_V2 !== "0";
}

export function isRoleModelV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_ROLE_MODEL_V2 !== "0";
}

export function isMapRouteWorkerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_ROUTE_WORKER === "1";
}

